import type { MindMapNode } from '../parser/types';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

/** Spec "Frontmatter" / "Layout": the six tree layouts and the kanban board (issue #32). */
export type MapLayoutName =
  | 'circle-clockwise'
  | 'circle-counter-clockwise'
  | 'left-to-right'
  | 'right-to-left'
  | 'top-to-bottom'
  | 'bottom-to-top'
  | 'kanban';

export const LAYOUT_NAMES: readonly MapLayoutName[] = [
  'circle-clockwise',
  'circle-counter-clockwise',
  'left-to-right',
  'right-to-left',
  'top-to-bottom',
  'bottom-to-top',
  'kanban',
];

/** Extra space between two siblings with a divider between them (spec "Dividers"). */
export const DIVIDER_GAP = 16;

/** Edge of a node its children grow from. */
export type Side = 'right' | 'left' | 'bottom' | 'top';

/** Text alignment of a node: flush towards the edge its line attaches to (towards the parent). */
export type TextAlign = 'left' | 'right' | 'center';

export interface LayoutOptions {
  siblingGap: number;
  levelGap: number;
  nodeSize: (node: MindMapNode) => Size;
  /** Default `left-to-right`. */
  layout?: MapLayoutName;
  /** Kanban: the column width is capped at it (the max node width setting); default no cap. */
  maxNodeWidth?: number;
  /**
   * Kanban: the card count of a column header (its children in the note, also when it is
   * collapsed); default the children in the laid-out tree.
   */
  childCount?: (node: MindMapNode) => number;
}

/** `x`/`y` is the top-left corner. */
export interface PositionedNode extends Rect {
  node: MindMapNode;
  /** Edge the children grow from (collapse toggle position). */
  childSide: Side;
  /**
   * Text alignment: towards the parent (left on the right side, right on the left side, centred in
   * vertical layouts); the root centred, or towards its branches in left-to-right and right-to-left.
   */
  align: TextAlign;
  /** Tree depth: 0 for the root, 1 for the first level (colour themes). */
  depth: number;
  /**
   * Source index of the first-level node this node belongs to (0 for the first branch, the node
   * itself on the first level); -1 for the root (colour themes).
   */
  branch: number;
  /** Kanban column header: the number of its cards (direct children), shown in a bubble. */
  count?: number;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  source: Point;
  target: Point;
  /** Tangent direction at both ends: `x` for horizontal layouts, `y` for vertical ones. */
  axis: 'x' | 'y';
}

/** Spec "Dividers": a line in the gap between two siblings, across both of their subtrees. */
export interface LayoutDivider {
  parentId: string;
  from: Point;
  to: Point;
}

export interface MapLayout {
  nodes: PositionedNode[];
  edges: LayoutEdge[];
  dividers: LayoutDivider[];
  bounds: Rect;
  /** False: nodes get no collapse toggles (kanban); every other layout has them. */
  toggles?: boolean;
}
