import type { MindMapNode, MindMapTree } from '../parser/types';
import type { LayoutEdge, LayoutOptions, MapLayout, PositionedNode, Rect, Size } from './types';

export const DEFAULT_LAYOUT = { siblingGap: 12, levelGap: 60, nodeWidth: 200, nodeHeight: 36 };

/**
 * Left-to-right bounding-box tidy tree: each subtree is a box, sibling boxes are stacked,
 * the parent is centered on its children's extent. Overlap-free by construction.
 */
export function layoutTree(tree: MindMapTree, options: LayoutOptions): MapLayout {
  const sizes = new Map<MindMapNode, Size>();
  const boxHeights = new Map<MindMapNode, number>();

  const measure = (node: MindMapNode): number => {
    const size = options.nodeSize(node);
    sizes.set(node, size);
    const box = Math.max(size.height, childrenBlockHeight(node, measure));
    boxHeights.set(node, box);
    return box;
  };

  const childrenBlockHeight = (node: MindMapNode, height: (n: MindMapNode) => number): number =>
    node.children.length === 0
      ? 0
      : node.children.reduce((sum, child) => sum + height(child), 0) +
        options.siblingGap * (node.children.length - 1);

  const nodes: PositionedNode[] = [];
  const edges: LayoutEdge[] = [];

  const place = (node: MindMapNode, x: number, top: number): PositionedNode => {
    const size = sizes.get(node) ?? { width: 0, height: 0 };
    const box = boxHeights.get(node) ?? size.height;
    const centerY = top + box / 2;
    const positioned: PositionedNode = { node, x, y: centerY - size.height / 2, ...size };
    nodes.push(positioned);

    const block = childrenBlockHeight(node, (child) => boxHeights.get(child) ?? 0);
    let childTop = centerY - block / 2;
    const childX = x + size.width + options.levelGap;
    for (const child of node.children) {
      const placed = place(child, childX, childTop);
      edges.push({
        fromId: node.id,
        toId: child.id,
        source: { x: x + size.width, y: centerY },
        target: { x: placed.x, y: placed.y + placed.height / 2 },
      });
      childTop += (boxHeights.get(child) ?? 0) + options.siblingGap;
    }
    return positioned;
  };

  const rootBox = measure(tree.root);
  place(tree.root, 0, -rootBox / 2);
  return { nodes, edges, bounds: boundsOf(nodes) };
}

function boundsOf(nodes: PositionedNode[]): Rect {
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
