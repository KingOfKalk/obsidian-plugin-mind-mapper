import type { PositionedNode, Rect } from '../../src/layout/types';
import {
  detailLevel,
  footprint,
  MAX_CONTENT_NODES,
  SKELETON_MIN_NODES,
  SKELETON_ZOOM,
  SpatialIndex,
  worldViewport,
} from '../../src/render/culling';

test('worldViewport at zoom 1 and 0.5 with margin', () => {
  expect(worldViewport({ x: 0, y: 0, zoom: 1 }, { width: 800, height: 600 }, 0)).toEqual({
    x: 0,
    y: 0,
    width: 800,
    height: 600,
  });
  // pan by (100, 50) at zoom 0.5: world origin of the canvas is (-200, -100)
  expect(worldViewport({ x: 100, y: 50, zoom: 0.5 }, { width: 800, height: 600 }, 0.5)).toEqual({
    x: -200 - 800,
    y: -100 - 600,
    width: 1600 * 2,
    height: 1200 * 2,
  });
});

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('SpatialIndex returns exactly the intersecting nodes', () => {
  const random = rng(7);
  const nodes = Array.from({ length: 300 }, (_, i) => ({
    node: { id: `n${i}` },
    x: random() * 8000 - 4000,
    y: random() * 8000 - 4000,
    width: 40 + random() * 600,
    height: 20 + random() * 300,
    childSide: 'right',
  })) as unknown as PositionedNode[];
  const index = new SpatialIndex(nodes);
  for (let q = 0; q < 50; q++) {
    const rect = {
      x: random() * 8000 - 4000,
      y: random() * 8000 - 4000,
      width: random() * 3000,
      height: random() * 3000,
    };
    const expected = new Set(nodes.filter((n) => intersects(n, rect)).map((n) => n.node.id));
    expect(index.query(rect)).toEqual(expected);
  }
});

test('detailLevel: skeleton only below 0.2 zoom with more than 60 nodes in view', () => {
  expect(SKELETON_ZOOM).toBe(0.2);
  expect(SKELETON_MIN_NODES).toBe(60);
  expect(detailLevel(0.1, 61)).toBe('skeleton');
  expect(detailLevel(0.199, 1000)).toBe('skeleton');
  expect(detailLevel(0.2, 200)).toBe('content');
  expect(detailLevel(1, 300)).toBe('content');
  // a small map in a narrow pane stays content, whatever the zoom
  expect(detailLevel(0.1, 60)).toBe('content');
  expect(detailLevel(0.05, 15)).toBe('content');
});

test('more than 300 nodes in view are a skeleton at any zoom', () => {
  expect(MAX_CONTENT_NODES).toBe(300);
  expect(detailLevel(0.25, 301)).toBe('skeleton');
  expect(detailLevel(1, 301)).toBe('skeleton');
  expect(detailLevel(0.25, 300)).toBe('content');
});

// Issue #103: a node is in view when its box or its tag row below it is.
test('footprint: the box, grown by the tag row', () => {
  const box = { x: 0, y: 0, width: 100, height: 20 };
  expect(footprint(box as PositionedNode)).toEqual(box);
  const tags = { x: -80, y: 24, width: 180, height: 22 };
  expect(footprint({ ...box, tags } as PositionedNode)).toEqual({
    x: -80,
    y: 0,
    width: 180,
    height: 46,
  });
});

test('SpatialIndex finds a node by its tag row', () => {
  const node = {
    node: { id: 'a' },
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    tags: { x: -80, y: 24, width: 180, height: 22 },
  } as unknown as PositionedNode;
  const index = new SpatialIndex([node]);
  expect(index.query({ x: -70, y: 30, width: 20, height: 10 })).toEqual(new Set(['a']));
  expect(index.query({ x: -70, y: 0, width: 20, height: 10 })).toEqual(new Set());
});
