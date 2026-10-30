import type {
  Answer,
  ConsequencePropagator,
  DecisionTreeNode,
  DecisionTreePath,
  PromisingnessJudge,
  Propagation,
  QuestionAsker,
} from "@ai-harness/core";
import { z } from "zod";
import { promptJson, type CursorPromptOptions } from "./promptJson.js";

const BRANCH_INTRO =
  "You are working on one branch of a decision tree that searches for solutions to a problem. " +
  "Each branch fixes answers to a sequence of questions. Everything a branch lists is established as true for that branch.";

const propagationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("refuted"), reason: z.string().min(1) }),
  z.object({ status: z.literal("solved"), consequences: z.array(z.string()) }),
  z.object({ status: z.literal("open"), consequences: z.array(z.string()) }),
]);

const questionSchema = z.object({
  question: z.string().min(1),
  answers: z.array(z.string().min(1)).min(1),
});

const comparisonSchema = z.object({ secondIsMorePromising: z.boolean() });

export function createCursorFrontier(options: CursorPromptOptions): {
  propagator: ConsequencePropagator;
  asker: QuestionAsker;
  judge: PromisingnessJudge;
} {
  return {
    propagator: {
      async propagate(context, given) {
        const reply = await promptJson(options, propagatePrompt(context, given), propagationSchema);
        return toPropagation(reply);
      },
    },
    asker: {
      async ask(context) {
        const reply = await promptJson(options, askPrompt(context), questionSchema);
        return {
          question: { text: reply.question },
          answers: reply.answers.map((text) => ({ text })),
        };
      },
    },
    judge: {
      async lessThan(first, second) {
        const reply = await promptJson(options, comparePrompt(first, second), comparisonSchema);
        return reply.secondIsMorePromising;
      },
    },
  };
}

function toPropagation(reply: z.infer<typeof propagationSchema>): Propagation {
  if (reply.status === "refuted") return { status: "refuted", reason: reply.reason };
  return { status: reply.status, consequences: { statements: reply.consequences } };
}

function propagatePrompt(context: DecisionTreePath, given: Answer): string {
  const parent = context[context.length - 1];
  const situation =
    parent === undefined
      ? `The problem:\n${given.text}\n\nNothing has been established yet. Work out what the problem statement itself forces.`
      : `${renderContext(context)}\n\nNew information for this branch:\nQuestion: ${questionOf(parent)}\nAnswer: ${given.text}\n\n` +
        "Work out what this new answer forces, given everything established above.";

  return `${BRANCH_INTRO}

${situation}

List only consequences that are new: forced facts, ruled-out options, and outcomes that now follow. Do not restate what is already established. Then classify the branch:
- "refuted": you are 100% certain that no solution exists anywhere in this branch, because what is established contradicts itself or the problem's requirements. Doubt, unlikeliness, or a weak branch is not refutation. Give the reason.
- "solved": the branch is a complete solution to the problem, with no open questions left to decide.
- "open": anything else.

Reply with only a JSON object, one of:
{"status": "refuted", "reason": "..."}
{"status": "solved", "consequences": ["..."]}
{"status": "open", "consequences": ["..."]}`;
}

function askPrompt(context: DecisionTreePath): string {
  return `${BRANCH_INTRO}

${renderContext(context)}

Choose the single most consequential open question for this branch: the one whose answer most changes what a solution looks like, or whether one exists. Do not ask anything the established facts already answer.

The question must be exhaustible. List its possible answers so that they are mutually exclusive and together cover every possibility consistent with what is established. When a full enumeration would be very long, group the possibilities into ranges or categories that still cover everything without overlap.

Reply with only a JSON object:
{"question": "...", "answers": ["...", "..."]}`;
}

function comparePrompt(first: DecisionTreePath, second: DecisionTreePath): string {
  return `${BRANCH_INTRO}

Two branches of the same search are below.

First branch:
${renderContext(first)}

Second branch:
${renderContext(second)}

Is the second branch more promising than the first? More promising means more likely to lead to a valid, high-quality solution with less further work. Judge only from what each branch has established.

Reply with only a JSON object:
{"secondIsMorePromising": true} or {"secondIsMorePromising": false}`;
}

function renderContext(context: DecisionTreePath): string {
  const sections = context.map((node, index) => {
    const header =
      node.parent === null
        ? `The problem:\n${node.given.text}`
        : `Decision ${index}\nQuestion: ${questionOf(node.parent)}\nAnswer: ${node.given.text}`;
    const statements = node.consequences.statements;
    return statements.length === 0
      ? header
      : `${header}\nConsequences:\n${statements.map((statement) => `- ${statement}`).join("\n")}`;
  });
  return sections.join("\n\n");
}

function questionOf(node: DecisionTreeNode): string {
  if (node.question === null) throw new Error(`Node ${node.id} has children but no recorded question`);
  return node.question.text;
}
