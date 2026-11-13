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

/**
 * Every step of the path is a node below the step before it (the first below the root). With
 * `markdown` (each step's own markdown when drilled into), each step must also still have it:
 * ordinal IDs of non-heading nodes shift when a sibling is inserted above, and the ID then names
 * another node. A step without known markdown (a restored path) takes the node it finds.
 */
export function isValidDrillPath(
  tree: MindMapTree,
  path: readonly string[],
  markdown: readonly (string | undefined)[] = [],
): boolean {
  let parent = tree.root;
  for (const [i, id] of path.entries()) {
    const node = parent.children.map((child) => findNode(child, id)).find((n) => n !== null);
    if (!node) return false;
    const known = markdown[i];
    if (known !== undefined && node.markdown !== known) return false;
    parent = node;
  }
  return true;
}

/** Each step's own markdown in `tree` (undefined for a step not found). */
export function drillMarkdown(tree: MindMapTree, path: readonly string[]): (string | undefined)[] {
  return path.map((id) => findNode(tree.root, id)?.markdown);
}
