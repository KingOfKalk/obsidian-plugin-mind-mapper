import type { MindMapNode, MindMapTree } from './types';

/** Pre-order walk over a node and all its descendants. */
export function walk(node: MindMapNode, visit: (node: MindMapNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

export function allNodes(tree: MindMapTree): MindMapNode[] {
  const nodes: MindMapNode[] = [];
  walk(tree.root, (node) => nodes.push(node));
  return nodes;
}
