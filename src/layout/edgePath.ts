import type { LayoutEdge, Rect } from './types';

/** Cubic bezier with tangents along the layout's main axis at both ends. */
export function edgePath({ source: s, target: t, axis }: LayoutEdge): string {
  if (axis === 'y') {
    const my = s.y + (t.y - s.y) / 2;
    return `M ${s.x} ${s.y} C ${s.x} ${my}, ${t.x} ${my}, ${t.x} ${t.y}`;
  }
  const mx = s.x + (t.x - s.x) / 2;
  return `M ${s.x} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x} ${t.y}`;
}

/**
 * Cross-connection line between two node rects: leaves and enters through the facing edges
 * (vertical edges when the nodes are mostly side by side, horizontal ones when stacked).
 */
export function crossLinkPath(from: Rect, to: Rect): string {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sign = dx >= 0 ? 1 : -1;
    const s = { x: sign > 0 ? from.x + from.width : from.x, y: from.y + from.height / 2 };
    const t = { x: sign > 0 ? to.x : to.x + to.width, y: to.y + to.height / 2 };
    const k = Math.max(40, 0.4 * Math.abs(t.x - s.x));
    return `M ${s.x} ${s.y} C ${s.x + sign * k} ${s.y}, ${t.x - sign * k} ${t.y}, ${t.x} ${t.y}`;
  }
  const sign = dy >= 0 ? 1 : -1;
  const s = { x: from.x + from.width / 2, y: sign > 0 ? from.y + from.height : from.y };
  const t = { x: to.x + to.width / 2, y: sign > 0 ? to.y : to.y + to.height };
  const k = Math.max(40, 0.4 * Math.abs(t.y - s.y));
  return `M ${s.x} ${s.y} C ${s.x} ${s.y + sign * k}, ${t.x} ${t.y - sign * k}, ${t.x} ${t.y}`;
}
