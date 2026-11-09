import { anchoredTransform, nearestNode } from '../../src/layout/anchor';
import type { MapLayout, PositionedNode } from '../../src/layout/types';
import type { MindMapNode } from '../../src/parser/types';

function positioned(id: string, x: number, y: number): PositionedNode {
  const node: MindMapNode = {
    id,
    kind: 'heading',
    label: id,
    markdown: id,
    sectionType: null,
    level: 1,
    line: 0,
    children: [],
  };
  return { node, x, y, width: 100, height: 20, childSide: 'right', depth: 1 };
}

const layout: MapLayout = {
  nodes: [positioned('a', 0, 0), positioned('b', 200, 0), positioned('c', 200, 100)],
  edges: [],
  dividers: [],
  bounds: { x: 0, y: 0, width: 300, height: 120 },
};

test('nearestNode picks the node whose center is closest', () => {
  expect(nearestNode(layout, { x: 240, y: 95 })?.node.id).toBe('c');
  expect(nearestNode(layout, { x: -50, y: 0 })?.node.id).toBe('a');
});

test('nearestNode of an empty layout is null', () => {
  expect(nearestNode({ ...layout, nodes: [] }, { x: 0, y: 0 })).toBeNull();
});

test('anchoredTransform keeps the anchor at the same screen position', () => {
  const t = { x: 30, y: -20, zoom: 0.5 };
  const before = { x: 200, y: 100 };
  const after = { x: 260, y: 40 };
  const next = anchoredTransform(t, before, after);
  expect(next.zoom).toBe(0.5);
  expect(after.x * next.zoom + next.x).toBeCloseTo(before.x * t.zoom + t.x);
  expect(after.y * next.zoom + next.y).toBeCloseTo(before.y * t.zoom + t.y);
});

test('anchoredTransform without movement keeps the transform', () => {
  const t = { x: 1, y: 2, zoom: 3 };
  expect(anchoredTransform(t, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual(t);
});
