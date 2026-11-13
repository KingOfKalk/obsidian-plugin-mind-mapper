import type { PositionedNode, Rect, Size } from '../layout/types';
import type { Transform } from './viewport';

/** Extra area rendered around the viewport, as a fraction of its size on each side. */
export const CULL_MARGIN = 0.5;
/** Below this zoom text is unreadable: many nodes are drawn as one skeleton path, no node DOM. */
export const SKELETON_ZOOM = 0.2;
/** A skeleton only pays off for many nodes; a small map in a narrow pane keeps its content. */
export const SKELETON_MIN_NODES = 60;
/** More nodes than this in view are a skeleton at any zoom: the DOM stays bounded. */
export const MAX_CONTENT_NODES = 300;

/** The canvas in world coordinates, grown by `margin` of its size on each side. */
export function worldViewport(t: Transform, size: Size, margin = CULL_MARGIN): Rect {
  const width = size.width / t.zoom;
  const height = size.height / t.zoom;
  return {
    x: (0 - t.x) / t.zoom - margin * width,
    y: (0 - t.y) / t.zoom - margin * height,
    width: width * (1 + 2 * margin),
    height: height * (1 + 2 * margin),
  };
}

/** Whether two rects overlap (touching edges do not). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** `nodesInView` counts the visible viewport only, never the margin (README: "in view"). */
export function detailLevel(zoom: number, nodesInView: number): 'content' | 'skeleton' {
  if (nodesInView > MAX_CONTENT_NODES) return 'skeleton';
  return zoom < SKELETON_ZOOM && nodesInView > SKELETON_MIN_NODES ? 'skeleton' : 'content';
}

/** Uniform grid over node rects; built once per layout, queried per frame. */
export class SpatialIndex {
  private readonly cells = new Map<string, PositionedNode[]>();

  constructor(
    nodes: readonly PositionedNode[],
    private readonly cell = 512,
  ) {
    for (const node of nodes) {
      for (const key of this.keys(node)) {
        const list = this.cells.get(key);
        if (list) list.push(node);
        else this.cells.set(key, [node]);
      }
    }
  }

  query(rect: Rect): Set<string> {
    const found = new Set<string>();
    for (const key of this.keys(rect)) {
      for (const node of this.cells.get(key) ?? []) {
        if (found.has(node.node.id)) continue;
        if (overlaps(node, rect)) found.add(node.node.id);
      }
    }
    return found;
  }

  private *keys(rect: Rect): Generator<string> {
    const x0 = Math.floor(rect.x / this.cell);
    const x1 = Math.floor((rect.x + rect.width) / this.cell);
    const y0 = Math.floor(rect.y / this.cell);
    const y1 = Math.floor((rect.y + rect.height) / this.cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield `${x},${y}`;
  }
}
