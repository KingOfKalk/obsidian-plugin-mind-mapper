import type { MindMapNode, MindMapTree } from '../parser/types';

/** Collapsed node IDs as the layout reads them (the view's `CollapseState`). */
export interface Collapsed {
  has(id: string): boolean;
}

export interface VisibleTree {
  tree: MindMapTree;
  /** Collapsed node ID -> number of all its hidden descendants. */
  hidden: ReadonlyMap<string, number>;
}

/**
 * The tree without the subtrees of collapsed nodes; unchanged nodes keep their identity. The root is
 * never collapsed (a drilled-in center may be collapsed in the whole map).
 */
export function visibleTree(tree: MindMapTree, collapsed: Collapsed): VisibleTree {
  const hidden = new Map<string, number>();

  const visit = (node: MindMapNode): MindMapNode => {
    if (node.children.length === 0) return node;
    if (node !== tree.root && collapsed.has(node.id)) {
      hidden.set(node.id, countDescendants(node));
      return { ...node, children: [] };
    }
    const children = node.children.map(visit);
    return children.every((child, i) => child === node.children[i]) ? node : { ...node, children };
  };

  return { tree: { root: visit(tree.root) }, hidden };
}

function countDescendants(node: MindMapNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}
