import type { Transform } from '../render/viewport';
import type { MapLayout, Point, PositionedNode } from './types';

/** Node whose center is closest to `world`. */
export function nearestNode(layout: MapLayout, world: Point): PositionedNode | null {
  let best: PositionedNode | null = null;
  let bestDistance = Infinity;
  for (const positioned of layout.nodes) {
    const dx = positioned.x + positioned.width / 2 - world.x;
    const dy = positioned.y + positioned.height / 2 - world.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = positioned;
      bestDistance = distance;
    }
  }
  return best;
}

/** Pans so that a node that moved from world point `before` to `after` stays at the same screen point. */
export function anchoredTransform(t: Transform, before: Point, after: Point): Transform {
  return {
    x: t.x + (before.x - after.x) * t.zoom,
    y: t.y + (before.y - after.y) * t.zoom,
    zoom: t.zoom,
  };
}
