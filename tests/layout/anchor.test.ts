import { nearestNode } from '../../src/layout/anchor';
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
  return {
    node,
    x,
    y,
    width: 100,
    height: 20,
    childSide: 'right',
    align: 'left',
    depth: 1,
    branch: 0,
  };
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
