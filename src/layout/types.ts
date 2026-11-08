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

/** Spec "Frontmatter" / "Layout": the six layouts. */
export type MapLayoutName =
  | 'circle-clockwise'
  | 'circle-counter-clockwise'
  | 'left-to-right'
  | 'right-to-left'
  | 'top-to-bottom'
  | 'bottom-to-top';

export const LAYOUT_NAMES: readonly MapLayoutName[] = [
  'circle-clockwise',
  'circle-counter-clockwise',
  'left-to-right',
  'right-to-left',
  'top-to-bottom',
  'bottom-to-top',
];

/** Edge of a node its children grow from. */
export type Side = 'right' | 'left' | 'bottom' | 'top';

export interface LayoutOptions {
  siblingGap: number;
  levelGap: number;
  nodeSize: (node: MindMapNode) => Size;
  /** Default `left-to-right`. */
  layout?: MapLayoutName;
}

/** `x`/`y` is the top-left corner. */
export interface PositionedNode extends Rect {
  node: MindMapNode;
  /** Edge the children grow from (collapse toggle position). */
  childSide: Side;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  source: Point;
  target: Point;
  /** Tangent direction at both ends: `x` for horizontal layouts, `y` for vertical ones. */
  axis: 'x' | 'y';
}

export interface MapLayout {
  nodes: PositionedNode[];
  edges: LayoutEdge[];
  bounds: Rect;
}
