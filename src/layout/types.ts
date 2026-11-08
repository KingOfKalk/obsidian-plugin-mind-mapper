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

export interface LayoutOptions {
  siblingGap: number;
  levelGap: number;
  nodeSize: (node: MindMapNode) => Size;
}

/** `x`/`y` is the top-left corner. */
export interface PositionedNode extends Rect {
  node: MindMapNode;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  source: Point;
  target: Point;
}

export interface MapLayout {
  nodes: PositionedNode[];
  edges: LayoutEdge[];
  bounds: Rect;
}
