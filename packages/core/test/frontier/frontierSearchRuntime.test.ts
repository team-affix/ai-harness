import assert from "node:assert/strict";
import { test } from "node:test";
import { contextOf } from "../../src/frontier/context.js";
import { FrontierSearchRuntime } from "../../src/frontier/frontierSearchRuntime.js";
import type {
  Answer,
  ConsequencePropagator,
  DecisionTreePath,
  PromisingnessJudge,
  Propagation,
  Question,
  QuestionAsker,
  TerminationEvent,
} from "../../src/frontier/types.js";

const PROBLEM = "What should go on the sandwich?";

function expectTermination<T extends TerminationEvent["type"]>(
  event: TerminationEvent | undefined,
  type: T,
): Extract<TerminationEvent, { type: T }> {
  assert.ok(event, `expected a ${type} event`);
  assert.equal(event.type, type);
  return event as Extract<TerminationEvent, { type: T }>;
}

function lastGiven(context: DecisionTreePath): string {
  const node = context[context.length - 1];
  assert.ok(node, "context must not be empty");
  return node.given.text;
}

function fakePropagator(outcomes: Record<string, Propagation>) {
  const calls: { context: string[]; given: string }[] = [];
  const propagator: ConsequencePropagator = {
    async propagate(context, given) {
      calls.push({ context: context.map((node) => node.given.text), given: given.text });
      const outcome = outcomes[given.text];
      assert.ok(outcome, `no propagation scripted for "${given.text}"`);
      return outcome;
    },
  };
  return { propagator, calls };
}

function fakeAsker(questions: Record<string, { question: string; answers: string[] }>) {
  const calls: string[] = [];
  const asker: QuestionAsker = {
    async ask(context) {
      const at = lastGiven(context);
      calls.push(at);
      const scripted = questions[at];
      assert.ok(scripted, `no question scripted for "${at}"`);
      const question: Question = { text: scripted.question };
      const answers: Answer[] = scripted.answers.map((text) => ({ text }));
      return { question, answers };
    },
  };
  return { asker, calls };
}

function fakeJudge(rank: Record<string, number>): PromisingnessJudge {
  return {
    async lessThan(first, second) {
      return (rank[lastGiven(first)] ?? 0) < (rank[lastGiven(second)] ?? 0);
    },
  };
}

function open(...statements: string[]): Propagation {
  return { status: "open", consequences: { statements } };
}

function solved(...statements: string[]): Propagation {
  return { status: "solved", consequences: { statements } };
}

function refuted(reason: string): Propagation {
  return { status: "refuted", reason };
}

test("a refuted root ends the search on the first step without asking a question", async () => {
  const { propagator } = fakePropagator({ [PROBLEM]: refuted("contradictory problem") });
  const { asker, calls } = fakeAsker({});
  const search = new FrontierSearchRuntime(PROBLEM, propagator, asker, fakeJudge({}));

  const event = expectTermination(await search.next(), "refuted");
  assert.equal(event.node.given.text, PROBLEM);
  assert.equal(event.node.parent, null);
  assert.equal(event.reason, "contradictory problem");
  assert.deepEqual(event.node.consequences.statements, []);
  assert.equal(search.exhausted, true);
  assert.equal(await search.next(), undefined);
  assert.deepEqual(calls, []);
});

test("a solved root is returned as a solution on the first step", async () => {
  const { propagator } = fakePropagator({ [PROBLEM]: solved("already decided") });
  const { asker, calls } = fakeAsker({});
  const search = new FrontierSearchRuntime(PROBLEM, propagator, asker, fakeJudge({}));

  const event = expectTermination(await search.next(), "solution");
  assert.equal(event.node.given.text, PROBLEM);
  assert.deepEqual(event.node.consequences.statements, ["already decided"]);
  assert.equal(search.exhausted, true);
  assert.deepEqual(calls, []);
});

test("each step visits one answer or expands the most promising open node", async () => {
  const { propagator, calls: propagateCalls } = fakePropagator({
    [PROBLEM]: open("needs bread"),
    rye: refuted("no rye in the kitchen"),
    white: solved("white bread is enough"),
    wheat: open("wheat goes with cheddar"),
    sourdough: open("sourdough goes with swiss"),
    swiss: solved("swiss on sourdough"),
    cheddar: refuted("out of cheddar"),
  });
  const { asker, calls: askCalls } = fakeAsker({
    [PROBLEM]: { question: "Which bread?", answers: ["rye", "white", "wheat", "sourdough"] },
    sourdough: { question: "Which cheese on sourdough?", answers: ["swiss"] },
    wheat: { question: "Which cheese on wheat?", answers: ["cheddar"] },
  });
  const judge = fakeJudge({ sourdough: 2, wheat: 1 });
  const search = new FrontierSearchRuntime(PROBLEM, propagator, asker, judge);

  assert.equal(await search.next(), undefined, "root visit is open");
  assert.equal(await search.next(), undefined, "root expansion");

  const rye = expectTermination(await search.next(), "refuted");
  assert.equal(rye.node.given.text, "rye");
  assert.equal(rye.node.parent?.question?.text, "Which bread?");

  const white = expectTermination(await search.next(), "solution");
  assert.equal(white.node.given.text, "white");
  assert.deepEqual(white.node.consequences.statements, ["white bread is enough"]);

  assert.equal(await search.next(), undefined, "wheat visit is open");
  assert.equal(await search.next(), undefined, "sourdough visit is open");
  assert.equal(await search.next(), undefined, "expansion pops the most promising node");
  assert.deepEqual(askCalls, [PROBLEM, "sourdough"]);

  const swiss = expectTermination(await search.next(), "solution");
  assert.deepEqual(
    contextOf(swiss.node).map((node) => node.given.text),
    [PROBLEM, "sourdough", "swiss"],
  );
  assert.equal(swiss.node.parent?.question?.text, "Which cheese on sourdough?");
  assert.deepEqual(swiss.node.consequences.statements, ["swiss on sourdough"]);
  assert.deepEqual(swiss.node.parent?.consequences.statements, ["sourdough goes with swiss"]);
  assert.equal(search.exhausted, false);

  assert.equal(await search.next(), undefined, "wheat expansion");
  const cheddar = expectTermination(await search.next(), "refuted");
  assert.equal(cheddar.node.given.text, "cheddar");
  assert.equal(search.exhausted, true);
  assert.equal(await search.next(), undefined);
  assert.deepEqual(askCalls, [PROBLEM, "sourdough", "wheat"]);

  assert.deepEqual(propagateCalls.slice(0, 2), [
    { context: [], given: PROBLEM },
    { context: [PROBLEM], given: "rye" },
  ]);
});

test("a step whose asker fails leaves the search unchanged for a retry", async () => {
  const { propagator } = fakePropagator({ [PROBLEM]: open(), only: solved() });
  let failures = 1;
  const asker: QuestionAsker = {
    async ask() {
      if (failures-- > 0) throw new Error("model unavailable");
      return { question: { text: "Which?" }, answers: [{ text: "only" }] };
    },
  };
  const search = new FrontierSearchRuntime(PROBLEM, propagator, asker, fakeJudge({}));

  await search.next();
  await assert.rejects(search.next(), /model unavailable/);
  assert.equal(search.exhausted, false);
  assert.equal(await search.next(), undefined);
  expectTermination(await search.next(), "solution");
  assert.equal(search.exhausted, true);
});

test("duplicate answers are rejected", async () => {
  const { propagator } = fakePropagator({ [PROBLEM]: open() });
  const { asker } = fakeAsker({ [PROBLEM]: { question: "Which?", answers: ["same", "same"] } });
  const search = new FrontierSearchRuntime(PROBLEM, propagator, asker, fakeJudge({}));

  await search.next();
  await assert.rejects(search.next(), /duplicate answer "same"/);
});

test("the search has work to do before the first step", () => {
  const { propagator } = fakePropagator({});
  const search = new FrontierSearchRuntime(PROBLEM, propagator, fakeAsker({}).asker, fakeJudge({}));
  assert.equal(search.exhausted, false);
});

test("the judge decides which open node is expanded", async () => {
  const comparisons: [string, string][] = [];
  const judge: PromisingnessJudge = {
    async lessThan(first, second) {
      comparisons.push([lastGiven(first), lastGiven(second)]);
      return lastGiven(second) === "better";
    },
  };
  const { propagator } = fakePropagator({
    [PROBLEM]: open(),
    worse: open(),
    better: open(),
  });
  const { asker, calls } = fakeAsker({
    [PROBLEM]: { question: "Which?", answers: ["worse", "better"] },
    better: { question: "Done?", answers: ["yes"] },
  });
  const search = new FrontierSearchRuntime(PROBLEM, propagator, asker, judge);

  await search.next();
  await search.next();
  await search.next();
  await search.next();
  await search.next();

  assert.deepEqual(comparisons, [["worse", "better"]]);
  assert.deepEqual(calls, [PROBLEM, "better"]);
});

test("a propagator failure retries the same visit", async () => {
  let failures = 1;
  const calls: string[] = [];
  const propagator: ConsequencePropagator = {
    async propagate(_context, given) {
      calls.push(given.text);
      if (failures-- > 0) throw new Error("model unavailable");
      return solved("recovered");
    },
  };
  const { asker, calls: askCalls } = fakeAsker({});
  const search = new FrontierSearchRuntime(PROBLEM, propagator, asker, fakeJudge({}));

  await assert.rejects(search.next(), /model unavailable/);
  assert.equal(search.exhausted, false);
  const event = expectTermination(await search.next(), "solution");
  assert.deepEqual(event.node.consequences.statements, ["recovered"]);
  assert.deepEqual(calls, [PROBLEM, PROBLEM]);
  assert.deepEqual(askCalls, []);
});

test("a judge failure while inserting retries that visit", async () => {
  let failComparison = true;
  const judge: PromisingnessJudge = {
    async lessThan() {
      if (failComparison) {
        failComparison = false;
        throw new Error("judge failed");
      }
      return false;
    },
  };
  const { propagator, calls } = fakePropagator({
    [PROBLEM]: open(),
    first: open(),
    second: open(),
  });
  const { asker, calls: askCalls } = fakeAsker({
    [PROBLEM]: { question: "Which?", answers: ["first", "second"] },
  });
  const search = new FrontierSearchRuntime(PROBLEM, propagator, asker, judge);

  await search.next();
  await search.next();
  await search.next();
  await assert.rejects(search.next(), /judge failed/);
  assert.equal(search.exhausted, false);
  assert.equal(await search.next(), undefined);
  assert.deepEqual(
    calls.map((call) => call.given),
    [PROBLEM, "first", "second", "second"],
  );
  assert.deepEqual(askCalls, [PROBLEM]);
});

test("an empty answer list does not expand the node", async () => {
  const { propagator } = fakePropagator({ [PROBLEM]: open(), kept: solved() });
  let attempts = 0;
  let askedNode: DecisionTreePath[number] | undefined;
  const asker: QuestionAsker = {
    async ask(context) {
      askedNode = context[context.length - 1];
      attempts++;
      if (attempts === 1) return { question: { text: "Which?" }, answers: [] };
      return { question: { text: "Which?" }, answers: [{ text: "kept" }] };
    },
  };
  const search = new FrontierSearchRuntime(PROBLEM, propagator, asker, fakeJudge({}));

  await search.next();
  await assert.rejects(search.next(), /no answers/);
  assert.equal(askedNode?.question?.text, undefined);
  assert.equal(await search.next(), undefined);
  assert.equal(askedNode?.question?.text, "Which?");
  expectTermination(await search.next(), "solution");
});

test("next rejects a second call while a step is running", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const propagator: ConsequencePropagator = {
    async propagate() {
      await gate;
      return solved();
    },
  };
  const search = new FrontierSearchRuntime(PROBLEM, propagator, fakeAsker({}).asker, fakeJudge({}));

  const first = search.next();
  await assert.rejects(search.next(), /while a step is running/);
  release();
  expectTermination(await first, "solution");
  assert.equal(search.exhausted, true);
});
