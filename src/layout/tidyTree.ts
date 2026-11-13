import type { MindMapNode, MindMapTree } from '../parser/types';
import { kanban } from './kanban';
import {
  DIVIDER_GAP,
  type LayoutDivider,
  type LayoutEdge,
  type LayoutOptions,
  type MapLayout,
  type Point,
  type PositionedNode,
  type Rect,
  type Side,
  type Size,
  TAG_ROW_GAP,
  type TextAlign,
} from './types';

export { DIVIDER_GAP };

/**
 * Spec "Layout": bounding-box tidy tree. Every layout is computed as a canonical left-to-right
 * tree (each subtree a box, siblings stacked, parent centered on its children; overlap-free by
 * construction) and then mapped: mirrored for right-to-left, axes swapped for the vertical ones.
 * Circle layouts put the first half of the first-level branches (rounded up) on the right side
 * (top to bottom) and the rest on the left side (bottom to top), each side a linear tree centered
 * on the root; counter-clockwise mirrors it. Kanban is a board, not a tree (src/layout/kanban.ts).
 */
export function layoutTree(tree: MindMapTree, options: LayoutOptions): MapLayout {
  const layout = options.layout ?? 'left-to-right';
  switch (layout) {
    case 'left-to-right':
      return finish(canonical(tree.root, options.nodeSize, options, tree.root), 'x');
    case 'right-to-left':
      return finish(
        mirrorX(canonical(tree.root, options.nodeSize, options, tree.root), tree.root),
        'x',
      );
    case 'top-to-bottom':
    case 'bottom-to-top': {
      const swapped = (node: MindMapNode): Size => {
        const { width, height } = options.nodeSize(node);
        return { width: height, height: width };
      };
      const vertical = swapAxes(canonical(tree.root, swapped, options, tree.root, null, false));
      return finish(layout === 'top-to-bottom' ? vertical : mirrorY(vertical, tree.root), 'y');
    }
    case 'circle-clockwise':
    case 'circle-counter-clockwise': {
      const clockwise = circle(tree.root, options);
      const raw = layout === 'circle-clockwise' ? clockwise : mirrorX(clockwise, tree.root);
      // The root has children on both sides; it gets no collapse toggle and centered text.
      const nodes = raw.nodes.map((p) =>
        p.node === tree.root ? { ...p, childSide: 'right' as const, align: 'center' as const } : p,
      );
      return finish({ ...raw, nodes }, 'x');
    }
    case 'kanban':
      // No connection lines and no collapse toggles (issue #32).
      return { ...finish({ ...kanban(tree.root, options), edges: [] }, 'y'), toggles: false };
  }
}

/** Positioned rects and edges before bounds; `childSide` and edge axis are set by the mapping. */
interface Raw {
  nodes: PositionedNode[];
  edges: Omit<LayoutEdge, 'axis'>[];
  dividers: LayoutDivider[];
}

/**
 * `source`: the tree's real root; its children's order is the branch order (a circle side gets a
 * copy of the root with a slice of them). `reversed`: a parent whose children are stacked in
 * reverse source order (left side of the circle layouts); a divider belongs between two
 * source-order neighbors, wherever they stack. `rows`: nodes below the root get their tag rows
 * (issue #103): each subtree is stacked by its footprint (box, gap, row) and a child column moves
 * away from its parent by the widest row reaching past its box towards the parent.
 */
function canonical(
  root: MindMapNode,
  nodeSize: (node: MindMapNode) => Size,
  options: LayoutOptions,
  source: MindMapNode,
  reversed: MindMapNode | null = null,
  rows = true,
): Raw {
  const branches = new Map(source.children.map((child, i) => [child, i]));
  const branchOf = (child: MindMapNode): number => branches.get(child) ?? -1;
  const sizes = new Map<MindMapNode, Size>();
  const tagRows = new Map<MindMapNode, Size>();
  /** Subtree extent above and below the middle of the node's box (edges attach there). */
  const ups = new Map<MindMapNode, number>();
  const downs = new Map<MindMapNode, number>();
  const heightOf = (node: MindMapNode): number => (ups.get(node) ?? 0) + (downs.get(node) ?? 0);
  /** Room before a node's child column for tag rows reaching past their boxes towards it. */
  const shifts = new Map<MindMapNode, number>();
  const overhang = (node: MindMapNode): number =>
    Math.max(0, (tagRows.get(node)?.width ?? 0) - (sizes.get(node)?.width ?? 0));

  /** Divider between the stacked children `i - 1` and `i`. */
  const dividerAt = (node: MindMapNode, i: number): boolean =>
    i > 0 && (node === reversed ? node.children[i - 1] : node.children[i])?.dividerBefore === true;
  const gapBefore = (node: MindMapNode, i: number): number =>
    i === 0 ? 0 : options.siblingGap + (dividerAt(node, i) ? DIVIDER_GAP : 0);

  const childrenBlockHeight = (node: MindMapNode): number =>
    node.children.reduce((sum, child, i) => sum + gapBefore(node, i) + heightOf(child), 0);

  /** Subtree extent along the level axis, from the node's near edge to its deepest descendant. */
  const extents = new Map<MindMapNode, number>();

  const measure = (node: MindMapNode): void => {
    const size = nodeSize(node);
    sizes.set(node, size);
    const row = rows && node !== root ? (options.tagRow?.(node) ?? null) : null;
    if (row) tagRows.set(node, row);
    for (const child of node.children) measure(child);
    const block = childrenBlockHeight(node);
    const below = row ? TAG_ROW_GAP + row.height : 0;
    ups.set(node, Math.max(size.height / 2, block / 2));
    downs.set(node, Math.max(size.height / 2 + below, block / 2));
    const shift = Math.max(0, ...node.children.map(overhang));
    shifts.set(node, shift);
    const deepest = Math.max(0, ...node.children.map((child) => extents.get(child) ?? 0));
    extents.set(node, size.width + (deepest > 0 ? options.levelGap + shift + deepest : 0));
  };

  const nodes: PositionedNode[] = [];
  const edges: Omit<LayoutEdge, 'axis'>[] = [];
  const dividers: LayoutDivider[] = [];

  /** `top`: the top of the node's subtree. */
  const place = (
    node: MindMapNode,
    x: number,
    top: number,
    depth: number,
    branch: number,
  ): PositionedNode => {
    const size = sizes.get(node) ?? { width: 0, height: 0 };
    const middle = top + (ups.get(node) ?? 0);
    const positioned: PositionedNode = {
      node,
      x,
      y: middle - size.height / 2,
      ...size,
      childSide: 'right',
      // Flush towards the parent; the root towards its children.
      align: depth === 0 ? 'right' : 'left',
      depth,
      branch,
    };
    const row = tagRows.get(node);
    if (row) {
      // Flush with the edge opposite the text (the right edge here).
      positioned.tags = {
        x: x + size.width - row.width,
        y: middle + size.height / 2 + TAG_ROW_GAP,
        ...row,
      };
    }
    nodes.push(positioned);

    // Children are centered on the middle of the box: a single child is level with it.
    let childTop = middle - childrenBlockHeight(node) / 2;
    const shift = shifts.get(node) ?? 0;
    const columnX = x + size.width + options.levelGap;
    const childX = columnX + shift;
    let previous: MindMapNode | null = null;
    node.children.forEach((child, i) => {
      const gap = gapBefore(node, i);
      if (previous && dividerAt(node, i)) {
        const y = childTop + gap / 2;
        // Spans both neighboring branches, not just the two nodes (spec "Dividers").
        const length = Math.max(extents.get(previous) ?? 0, extents.get(child) ?? 0);
        dividers.push({
          parentId: node.id,
          from: { x: columnX, y },
          to: { x: childX + length, y },
        });
      }
      childTop += gap;
      const placed = place(
        child,
        childX,
        childTop,
        depth + 1,
        depth === 0 ? branchOf(child) : branch,
      );
      const target = { x: placed.x, y: placed.y + placed.height / 2 };
      edges.push({
        fromId: node.id,
        toId: child.id,
        source: { x: x + size.width, y: middle },
        target,
        // Curves stay in the level gap, clear of the rows in the moved column's room.
        ...(shift > 0 ? { via: { x: columnX, y: target.y } } : {}),
      });
      childTop += heightOf(child);
      previous = child;
    });
    return positioned;
  };

  measure(root);
  place(root, 0, -(ups.get(root) ?? 0), 0, -1);
  return { nodes, edges, dividers };
}

/** Mirrors about the root's vertical center line (the root keeps its position). */
function mirrorX(raw: Raw, root: MindMapNode): Raw {
  const rootRect = raw.nodes.find((p) => p.node === root);
  const axis = rootRect ? rootRect.width : 0;
  const point = (p: Point): Point => ({ x: axis - p.x, y: p.y });
  const rect = (r: Rect): Rect => ({ ...r, x: axis - r.x - r.width });
  return {
    nodes: raw.nodes.map((p) => ({
      ...p,
      x: axis - p.x - p.width,
      childSide: flip(p.childSide),
      align: flipAlign(p.align),
      ...(p.tags ? { tags: rect(p.tags) } : {}),
    })),
    edges: raw.edges.map((e) => mapEdge(e, point)),
    dividers: raw.dividers.map((d) => ({ ...d, from: point(d.from), to: point(d.to) })),
  };
}

/** Mirrors about the root's horizontal center line (the root keeps its position). */
function mirrorY(raw: Raw, root: MindMapNode): Raw {
  const rootRect = raw.nodes.find((p) => p.node === root);
  const axis = rootRect ? 2 * rootRect.y + rootRect.height : 0;
  const point = (p: Point): Point => ({ x: p.x, y: axis - p.y });
  // Vertical layouts have no tag rows (centered text keeps its tags inside).
  return {
    nodes: raw.nodes.map((p) => ({ ...p, y: axis - p.y - p.height, childSide: flip(p.childSide) })),
    edges: raw.edges.map((e) => mapEdge(e, point)),
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
      align: 'center',
    })),
    edges: raw.edges.map((e) => mapEdge(e, point)),
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
  const right = canonical(rightRoot, nodeSize, options, root);
  const left = mirrorX(canonical(leftRoot, nodeSize, options, root, leftRoot), leftRoot);
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

function mapEdge<E extends Omit<LayoutEdge, 'axis'>>(edge: E, point: (p: Point) => Point): E {
  return {
    ...edge,
    source: point(edge.source),
    target: point(edge.target),
    ...(edge.via ? { via: point(edge.via) } : {}),
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

function flipAlign(align: TextAlign): TextAlign {
  return align === 'left' ? 'right' : align === 'right' ? 'left' : align;
}

function finish(raw: Raw, axis: 'x' | 'y'): MapLayout {
  return {
    nodes: raw.nodes,
    edges: raw.edges.map((e) => ({ ...e, axis })),
    dividers: raw.dividers,
    bounds: boundsOf(raw.nodes),
  };
}

/** All node footprints: boxes and tag rows. */
function boundsOf(nodes: PositionedNode[]): Rect {
  const rects = nodes.flatMap((n) => (n.tags ? [n, n.tags] : [n]));
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
