import type { LayoutEdge } from './types';

/** Cubic bezier with horizontal tangents at both ends. */
export function edgePath({ source: s, target: t }: LayoutEdge): string {
  const mx = s.x + (t.x - s.x) / 2;
  return `M ${s.x} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x} ${t.y}`;
}
