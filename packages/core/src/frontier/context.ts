import type { DecisionTreeNode, DecisionTreePath } from "./types.js";

export function contextOf(node: DecisionTreeNode): DecisionTreePath {
  const path: DecisionTreeNode[] = [];
  for (let current: DecisionTreeNode | null = node; current !== null; current = current.parent) {
    path.push(current);
  }
  return path.reverse();
}
