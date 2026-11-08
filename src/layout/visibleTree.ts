import type { MindMapNode, MindMapTree } from '../parser/types';
import type { CollapseState } from '../view/collapseState';

export interface VisibleTree {
  tree: MindMapTree;
  /** Collapsed node ID -> number of all its hidden descendants. */
  hidden: ReadonlyMap<string, number>;
}

/** The tree without the subtrees of collapsed nodes; unchanged nodes keep their identity. */
export function visibleTree(tree: MindMapTree, collapsed: CollapseState): VisibleTree {
  const hidden = new Map<string, number>();

  const visit = (node: MindMapNode): MindMapNode => {
    if (node.children.length === 0) return node;
    if (collapsed.has(node.id)) {
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
