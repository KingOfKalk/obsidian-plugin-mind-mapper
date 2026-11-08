import type { LayoutEdge } from './types';

/** Cubic bezier with tangents along the layout's main axis at both ends. */
export function edgePath({ source: s, target: t, axis }: LayoutEdge): string {
  if (axis === 'y') {
    const my = s.y + (t.y - s.y) / 2;
    return `M ${s.x} ${s.y} C ${s.x} ${my}, ${t.x} ${my}, ${t.x} ${t.y}`;
  }
  const mx = s.x + (t.x - s.x) / 2;
  return `M ${s.x} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x} ${t.y}`;
}
