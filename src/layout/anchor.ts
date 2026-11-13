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
