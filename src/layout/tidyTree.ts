import type { MindMapNode, MindMapTree } from '../parser/types';
import type {
  LayoutDivider,
  LayoutEdge,
  LayoutOptions,
  MapLayout,
  Point,
  PositionedNode,
  Rect,
  Side,
  Size,
} from './types';

export const DEFAULT_LAYOUT = { siblingGap: 12, levelGap: 60, nodeWidth: 200, nodeHeight: 36 };
/** Extra space between two siblings with a divider between them (spec "Dividers"). */
export const DIVIDER_GAP = 16;

/**
 * Spec "Layout": bounding-box tidy tree. Every layout is computed as a canonical left-to-right
 * tree (each subtree a box, siblings stacked, parent centered on its children; overlap-free by
 * construction) and then mapped: mirrored for right-to-left, axes swapped for the vertical ones.
 * Circle layouts put the first half of the first-level branches (rounded up) on the right side
 * (top to bottom) and the rest on the left side (bottom to top), each side a linear tree centered
 * on the root; counter-clockwise mirrors it.
 */
export function layoutTree(tree: MindMapTree, options: LayoutOptions): MapLayout {
  const layout = options.layout ?? 'left-to-right';
  switch (layout) {
    case 'left-to-right':
      return finish(canonical(tree.root, options.nodeSize, options), 'x');
    case 'right-to-left':
      return finish(mirrorX(canonical(tree.root, options.nodeSize, options), tree.root), 'x');
    case 'top-to-bottom':
    case 'bottom-to-top': {
      const swapped = (node: MindMapNode): Size => {
        const { width, height } = options.nodeSize(node);
        return { width: height, height: width };
      };
      const vertical = swapAxes(canonical(tree.root, swapped, options));
      return finish(layout === 'top-to-bottom' ? vertical : mirrorY(vertical, tree.root), 'y');
    }
    case 'circle-clockwise':
    case 'circle-counter-clockwise': {
      const clockwise = circle(tree.root, options);
      const raw = layout === 'circle-clockwise' ? clockwise : mirrorX(clockwise, tree.root);
      // The root has children on both sides; it gets no collapse toggle.
      const nodes = raw.nodes.map((p) =>
        p.node === tree.root ? { ...p, childSide: 'right' as const } : p,
      );
      return finish({ ...raw, nodes }, 'x');
    }
  }
}

/** Positioned rects and edges before bounds; `childSide` and edge axis are set by the mapping. */
interface Raw {
  nodes: PositionedNode[];
  edges: Omit<LayoutEdge, 'axis'>[];
  dividers: LayoutDivider[];
}

/**
 * `reversed`: a parent whose children are stacked in reverse source order (left side of the
 * circle layouts); a divider belongs between two source-order neighbors, wherever they stack.
 */
function canonical(
  root: MindMapNode,
  nodeSize: (node: MindMapNode) => Size,
  options: LayoutOptions,
  reversed: MindMapNode | null = null,
): Raw {
  const sizes = new Map<MindMapNode, Size>();
  const boxHeights = new Map<MindMapNode, number>();

  /** Divider between the stacked children `i - 1` and `i`. */
  const dividerAt = (node: MindMapNode, i: number): boolean =>
    i > 0 && (node === reversed ? node.children[i - 1] : node.children[i])?.dividerBefore === true;
  const gapBefore = (node: MindMapNode, i: number): number =>
    i === 0 ? 0 : options.siblingGap + (dividerAt(node, i) ? DIVIDER_GAP : 0);

  const childrenBlockHeight = (node: MindMapNode, height: (n: MindMapNode) => number): number =>
    node.children.reduce((sum, child, i) => sum + gapBefore(node, i) + height(child), 0);

  /** Subtree extent along the level axis, from the node's near edge to its deepest descendant. */
  const extents = new Map<MindMapNode, number>();

  const measure = (node: MindMapNode): number => {
    const size = nodeSize(node);
    sizes.set(node, size);
    const box = Math.max(size.height, childrenBlockHeight(node, measure));
    boxHeights.set(node, box);
    const deepest = Math.max(0, ...node.children.map((child) => extents.get(child) ?? 0));
    extents.set(node, size.width + (deepest > 0 ? options.levelGap + deepest : 0));
    return box;
  };

  const nodes: PositionedNode[] = [];
  const edges: Omit<LayoutEdge, 'axis'>[] = [];
  const dividers: LayoutDivider[] = [];

  const place = (node: MindMapNode, x: number, top: number): PositionedNode => {
    const size = sizes.get(node) ?? { width: 0, height: 0 };
    const box = boxHeights.get(node) ?? size.height;
    const centerY = top + box / 2;
    const positioned: PositionedNode = {
      node,
      x,
      y: centerY - size.height / 2,
      ...size,
      childSide: 'right',
    };
    nodes.push(positioned);

    const block = childrenBlockHeight(node, (child) => boxHeights.get(child) ?? 0);
    let childTop = centerY - block / 2;
    const childX = x + size.width + options.levelGap;
    let previous: MindMapNode | null = null;
    node.children.forEach((child, i) => {
      const gap = gapBefore(node, i);
      if (previous && dividerAt(node, i)) {
        const y = childTop + gap / 2;
        // Spans both neighbouring branches, not just the two nodes (spec "Dividers").
        const length = Math.max(extents.get(previous) ?? 0, extents.get(child) ?? 0);
        dividers.push({ parentId: node.id, from: { x: childX, y }, to: { x: childX + length, y } });
      }
      childTop += gap;
      const placed = place(child, childX, childTop);
      edges.push({
        fromId: node.id,
        toId: child.id,
        source: { x: x + size.width, y: centerY },
        target: { x: placed.x, y: placed.y + placed.height / 2 },
      });
      childTop += boxHeights.get(child) ?? 0;
      previous = child;
    });
    return positioned;
  };

  const rootBox = measure(root);
  place(root, 0, -rootBox / 2);
  return { nodes, edges, dividers };
}

/** Mirrors about the root's vertical center line (the root keeps its position). */
function mirrorX(raw: Raw, root: MindMapNode): Raw {
  const rootRect = raw.nodes.find((p) => p.node === root);
  const axis = rootRect ? rootRect.width : 0;
  const point = (p: Point): Point => ({ x: axis - p.x, y: p.y });
  return {
    nodes: raw.nodes.map((p) => ({
      ...p,
      x: axis - p.x - p.width,
      childSide: flip(p.childSide),
    })),
    edges: raw.edges.map((e) => ({ ...e, source: point(e.source), target: point(e.target) })),
    dividers: raw.dividers.map((d) => ({ ...d, from: point(d.from), to: point(d.to) })),
  };
}

/** Mirrors about the root's horizontal center line (the root keeps its position). */
function mirrorY(raw: Raw, root: MindMapNode): Raw {
  const rootRect = raw.nodes.find((p) => p.node === root);
  const axis = rootRect ? 2 * rootRect.y + rootRect.height : 0;
  const point = (p: Point): Point => ({ x: p.x, y: axis - p.y });
  return {
    nodes: raw.nodes.map((p) => ({ ...p, y: axis - p.y - p.height, childSide: flip(p.childSide) })),
    edges: raw.edges.map((e) => ({ ...e, source: point(e.source), target: point(e.target) })),
    dividers: raw.dividers.map((d) => ({ ...d, from: point(d.from), to: point(d.to) })),
  };
}

/** Canonical (computed with swapped sizes) to top-to-bottom: x and y swap roles. */
function swapAxes(raw: Raw): Raw {
  const point = (p: Point): Point => ({ x: p.y, y: p.x });
  return {
    nodes: raw.nodes.map((p) => ({
      ...p,
      x: p.y,
      y: p.x,
      width: p.height,
      height: p.width,
      childSide: 'bottom',
    })),
    edges: raw.edges.map((e) => ({ ...e, source: point(e.source), target: point(e.target) })),
    dividers: raw.dividers.map((d) => ({ ...d, from: point(d.from), to: point(d.to) })),
  };
}

function circle(root: MindMapNode, options: LayoutOptions): Raw {
  const half = Math.ceil(root.children.length / 2);
  const rightRoot = { ...root, children: root.children.slice(0, half) };
  // Left side clockwise: bottom to top, so the stack order is reversed.
  const leftRoot = { ...root, children: root.children.slice(half).reverse() };
  const nodeSize = (node: MindMapNode): Size =>
    options.nodeSize(node === rightRoot || node === leftRoot ? root : node);
  const right = canonical(rightRoot, nodeSize, options);
  const left = mirrorX(canonical(leftRoot, nodeSize, options, leftRoot), leftRoot);
  const rootRect = right.nodes[0];
  const nodes = [
    ...(rootRect ? [{ ...rootRect, node: root }] : []),
    ...right.nodes.slice(1),
    ...left.nodes.slice(1),
  ];
  return {
    nodes,
    edges: [...right.edges, ...left.edges],
    dividers: [...right.dividers, ...left.dividers],
  };
}

function flip(side: Side): Side {
  switch (side) {
    case 'right':
      return 'left';
    case 'left':
      return 'right';
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
  }
}

function finish(raw: Raw, axis: 'x' | 'y'): MapLayout {
  return {
    nodes: raw.nodes,
    edges: raw.edges.map((e) => ({ ...e, axis })),
    dividers: raw.dividers,
    bounds: boundsOf(raw.nodes),
  };
}

function boundsOf(nodes: PositionedNode[]): Rect {
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
