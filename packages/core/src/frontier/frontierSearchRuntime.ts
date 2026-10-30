import { AsyncMaxHeap } from "../asyncMaxHeap/asyncMaxHeap.js";
import { contextOf } from "./context.js";
import type {
  Answer,
  ConsequencePropagator,
  DecisionTreeNode,
  PromisingnessJudge,
  QuestionAsker,
  TerminationEvent,
} from "./types.js";

interface PendingVisit {
  readonly parent: DecisionTreeNode | null;
  readonly given: Answer;
}

export class FrontierSearchRuntime {
  readonly #propagator: ConsequencePropagator;
  readonly #asker: QuestionAsker;
  readonly #heap: AsyncMaxHeap<DecisionTreeNode>;
  readonly #pending: PendingVisit[];
  #nextId = 0;
  #stepping = false;

  constructor(
    problem: string,
    propagator: ConsequencePropagator,
    asker: QuestionAsker,
    judge: PromisingnessJudge,
  ) {
    this.#propagator = propagator;
    this.#asker = asker;
    this.#heap = new AsyncMaxHeap((a, b) => judge.lessThan(contextOf(a), contextOf(b)));
    this.#pending = [{ parent: null, given: { text: problem } }];
  }

  get exhausted(): boolean {
    return this.#pending.length === 0 && this.#heap.size === 0;
  }

  async next(): Promise<TerminationEvent | undefined> {
    if (this.#stepping) throw new Error("FrontierSearchRuntime.next() called while a step is running");
    this.#stepping = true;
    try {
      const visit = this.#pending[0];
      if (visit !== undefined) return await this.#visit(visit);
      const node = this.#heap.peek();
      if (node !== undefined) await this.#expand(node);
      return undefined;
    } finally {
      this.#stepping = false;
    }
  }

  async #visit(visit: PendingVisit): Promise<TerminationEvent | undefined> {
    const context = visit.parent === null ? [] : contextOf(visit.parent);
    const propagation = await this.#propagator.propagate(context, visit.given);
    const node: DecisionTreeNode = {
      id: this.#nextId,
      parent: visit.parent,
      given: visit.given,
      consequences: propagation.status === "refuted" ? { statements: [] } : propagation.consequences,
      question: null,
    };
    if (propagation.status === "open") await this.#heap.push(node);
    this.#pending.shift();
    this.#nextId++;

    switch (propagation.status) {
      case "refuted":
        return { type: "refuted", node, reason: propagation.reason };
      case "solved":
        return { type: "solution", node };
      case "open":
        return undefined;
    }
  }

  async #expand(node: DecisionTreeNode): Promise<void> {
    const { question, answers } = await this.#asker.ask(contextOf(node));
    if (answers.length === 0) {
      throw new Error(`QuestionAsker returned no answers for "${question.text}"`);
    }
    const seen = new Set<string>();
    for (const answer of answers) {
      if (seen.has(answer.text)) {
        throw new Error(`QuestionAsker returned duplicate answer "${answer.text}" for "${question.text}"`);
      }
      seen.add(answer.text);
    }

    await this.#heap.pop();
    node.question = question;
    for (const answer of answers) this.#pending.push({ parent: node, given: answer });
  }
}
