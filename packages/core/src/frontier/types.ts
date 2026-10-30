export interface ConsequencePropagator {
  propagate(context: DecisionTreePath, given: Answer): Promise<Propagation>;
}

export interface QuestionAsker {
  ask(context: DecisionTreePath): Promise<{ readonly question: Question; readonly answers: readonly Answer[] }>;
}

export interface PromisingnessJudge {
  lessThan(first: DecisionTreePath, second: DecisionTreePath): Promise<boolean>;
}

export interface DecisionTreeNode {
  readonly id: number;
  readonly parent: DecisionTreeNode | null;
  readonly given: Answer;
  readonly consequences: Consequences;
  question: Question | null;
}

export type Propagation =
  | { readonly status: "refuted"; readonly reason: string }
  | { readonly status: "solved"; readonly consequences: Consequences }
  | { readonly status: "open"; readonly consequences: Consequences };

export type TerminationEvent =
  | { readonly type: "refuted"; readonly node: DecisionTreeNode; readonly reason: string }
  | { readonly type: "solution"; readonly node: DecisionTreeNode };

export interface Answer {
  readonly text: string;
}

export interface Question {
  readonly text: string;
}

export interface Consequences {
  readonly statements: readonly string[];
}

export type DecisionTreePath = readonly DecisionTreeNode[];
