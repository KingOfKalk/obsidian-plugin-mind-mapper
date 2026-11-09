import type { MindMapNode, MindMapTree } from '../parser/types';

/** The node with this ID in the subtree of `node` (pre-order), null when there is none. */
export function findNode(node: MindMapNode, id: string): MindMapNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Drill-down (issue #23): the subtree of the node with this ID as a map of its own. The node is
 * shown like the root (kind `root`: large, no box, no collapse toggle); its children keep their
 * identity. Null when the node is gone.
 */
export function drilledTree(tree: MindMapTree, id: string): MindMapTree | null {
  const node = findNode(tree.root, id);
  return node ? { root: { ...node, kind: 'root' } } : null;
}

/** Every step of the path is a node below the step before it (the first below the root). */
export function isValidDrillPath(tree: MindMapTree, path: readonly string[]): boolean {
  let parent = tree.root;
  for (const id of path) {
    const node = parent.children.map((child) => findNode(child, id)).find((n) => n !== null);
    if (!node) return false;
    parent = node;
  }
  return true;
}
