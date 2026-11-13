import type { MapLayout, Point, PositionedNode, Rect, Side } from '../../src/layout/types';
import type { MindMapNode } from '../../src/parser/types';
import {
  anchoredTransform,
  fitBounds,
  fitMargin,
  fitToBounds,
  IDENTITY,
  nextZoomStep,
  panBy,
  parseZoomPercent,
  resetZoom,
  transformCss,
  type Transform,
  wheelAction,
  zoomAt,
  zoomTo,
} from '../../src/render/viewport';

const toWorld = (t: Transform, p: Point): Point => ({
  x: (p.x - t.x) / t.zoom,
  y: (p.y - t.y) / t.zoom,
});

test('panBy moves the translation', () => {
  expect(panBy(IDENTITY, 5, -3)).toEqual({ x: 5, y: -3, zoom: 1 });
});

test('zoomAt keeps the point under the cursor fixed', () => {
  const t = { x: 30, y: -20, zoom: 0.8 };
  const at = { x: 200, y: 100 };
  const next = zoomAt(t, 1.5, at);
  expect(next.zoom).toBeCloseTo(1.2);
  const before = toWorld(t, at);
  const after = toWorld(next, at);
  expect(after.x).toBeCloseTo(before.x, 9);
  expect(after.y).toBeCloseTo(before.y, 9);
});

test('zoomAt clamps to the zoom limits and keeps the anchor', () => {
  const at = { x: 50, y: 70 };
  let t: Transform = { x: 10, y: 10, zoom: 1 };
  const anchor = toWorld(t, at);
  for (let i = 0; i < 100; i++) t = zoomAt(t, 1.2, at);
  expect(t.zoom).toBe(4);
  expect(toWorld(t, at).x).toBeCloseTo(anchor.x, 9);
  for (let i = 0; i < 100; i++) t = zoomAt(t, 1 / 1.2, at);
  expect(t.zoom).toBe(0.1);
  expect(toWorld(t, at).y).toBeCloseTo(anchor.y, 9);
});

const SMALL = { x: 0, y: -10, width: 100, height: 20 };
const SIZE = { width: 800, height: 600 };

test.each([1, 2, 4])('fitToBounds zooms a small map up to the cap %s and centers it', (cap) => {
  const t = fitToBounds(SMALL, SIZE, cap);
  expect(t?.zoom).toBe(cap);
  expect(t && { x: 50 * t.zoom + t.x, y: 0 * t.zoom + t.y }).toEqual({ x: 400, y: 300 });
});

test('fitToBounds zooms to the ratio when it is below the cap', () => {
  // margin 48: width ratio 704 / 300 = 2.35, height ratio 504 / 400 = 1.26
  const t = fitToBounds({ x: 0, y: 0, width: 300, height: 400 }, SIZE, 4);
  expect(t?.zoom).toBeCloseTo(1.26);
});

test.each([
  [800, 600, 48],
  [400, 300, 48],
  [100, 2000, 48],
  [1000, 900, 72],
  [2000, 1500, 120],
])('fitMargin of a %i x %i canvas is 8 %% of the shorter side, at least 48 px', (w, h, m) => {
  expect(fitMargin({ width: w, height: h })).toBeCloseTo(m);
});

test('fitToBounds keeps the proportional margin on a large canvas', () => {
  // margin 120: width ratio 1760 / 1000, height ratio 1260 / 1000
  const t = fitToBounds(
    { x: 0, y: 0, width: 1000, height: 1000 },
    { width: 2000, height: 1500 },
    4,
  );
  expect(t?.zoom).toBeCloseTo(1.26);
  expect(t?.y).toBeCloseTo(120);
});

test('fitToBounds clamps the cap to the zoom limits', () => {
  expect(fitToBounds(SMALL, SIZE, 10)?.zoom).toBe(4);
});

test('fitToBounds shrinks large maps whatever the cap', () => {
  const t = fitToBounds({ x: 0, y: 0, width: 2000, height: 400 }, SIZE, 2);
  expect(t?.zoom).toBeCloseTo(704 / 2000);
  expect(t && 1000 * t.zoom + t.x).toBeCloseTo(400);
});

test.each([
  [0, 600],
  [800, 0],
])('fitToBounds returns null for zero size (%i x %i)', (width, height) => {
  expect(fitToBounds({ x: 0, y: 0, width: 10, height: 10 }, { width, height }, 1)).toBeNull();
});

test('resetZoom sets zoom 1 and keeps the viewport center', () => {
  const t = { x: 40, y: -60, zoom: 0.5 };
  const size = { width: 800, height: 600 };
  const center = { x: 400, y: 300 };
  const next = resetZoom(t, size);
  expect(next.zoom).toBe(1);
  expect(toWorld(next, center).x).toBeCloseTo(toWorld(t, center).x, 9);
  expect(toWorld(next, center).y).toBeCloseTo(toWorld(t, center).y, 9);
});

test('zoomTo sets the exact zoom, clamped, and keeps the anchor', () => {
  const t = { x: 30, y: -20, zoom: 0.8 };
  const at = { x: 200, y: 100 };
  const next = zoomTo(t, 1.29, at);
  expect(next.zoom).toBe(1.29);
  expect(toWorld(next, at).x).toBeCloseTo(toWorld(t, at).x, 9);
  expect(toWorld(next, at).y).toBeCloseTo(toWorld(t, at).y, 9);
  expect(zoomTo(t, 10, at).zoom).toBe(4);
  expect(zoomTo(t, 0.01, at).zoom).toBe(0.1);
});

test.each([
  [1, 1.25, 0.75],
  [1.29, 1.5, 1.25],
  [0.6, 0.75, 0.5],
  [0.1, 0.25, 0.1],
  [0.12, 0.25, 0.1],
  [3.5, 4, 3],
  [4, 4, 3],
  // float noise around a step counts as that step
  [1.25 + 1e-9, 1.5, 1],
  [1.25 - 1e-9, 1.5, 1],
])('nextZoomStep from %f: in %f, out %f', (zoom, zoomIn, zoomOut) => {
  expect(nextZoomStep(zoom, 1)).toBe(zoomIn);
  expect(nextZoomStep(zoom, -1)).toBe(zoomOut);
});

test('nextZoomStep walks through every step', () => {
  const steps = [0.1];
  while (steps.at(-1) !== 4) steps.push(nextZoomStep(steps.at(-1) ?? 4, 1));
  expect(steps).toEqual([0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]);
});

test.each([
  ['129', 1.29],
  ['129%', 1.29],
  ['129 %', 1.29],
  ['129\u00a0%', 1.29],
  [' 87,5 ', 0.875],
  ['87.5%', 0.875],
  ['100', 1],
  ['5', 0.1],
  ['0', 0.1],
  ['1000 %', 4],
])('parseZoomPercent(%j) is %f', (text, zoom) => {
  expect(parseZoomPercent(text)).toBe(zoom);
});

test.each(['', '   ', '%', 'abc', '12a', '-5', '1,2,3', '1e3', '12 34'])(
  'parseZoomPercent(%j) is invalid',
  (text) => {
    expect(parseZoomPercent(text)).toBeNull();
  },
);

function positioned(id: string, rect: Rect, childSide: Side = 'right'): PositionedNode {
  const node = { id, kind: id === 'R' ? 'root' : 'heading' } as MindMapNode;
  return { ...rect, node, childSide, align: 'left', depth: id === 'R' ? 0 : 1, branch: 0 };
}

function mapLayout(nodes: PositionedNode[], edges: [string, string][] = []): MapLayout {
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const bounds = {
    x: minX,
    y: minY,
    width: Math.max(...nodes.map((n) => n.x + n.width)) - minX,
    height: Math.max(...nodes.map((n) => n.y + n.height)) - minY,
  };
  const point = { x: 0, y: 0 };
  return {
    nodes,
    edges: edges.map(([fromId, toId]) => ({
      fromId,
      toId,
      source: point,
      target: point,
      axis: 'x',
    })),
    dividers: [],
    bounds,
  };
}

test.each([
  ['right', { x: 0, y: -4, width: 121, height: 18 }],
  ['left', { x: -21, y: -4, width: 121, height: 18 }],
  ['bottom', { x: 0, y: 0, width: 100, height: 31 }],
  ['top', { x: 0, y: -21, width: 100, height: 31 }],
] as const)(
  'fitBounds includes the badge of a collapsed node on its child side %s',
  (side, rect) => {
    const layout = mapLayout([positioned('A', { x: 0, y: 0, width: 100, height: 10 }, side)]);
    expect(fitBounds(layout, new Map([['A', 3]]))).toEqual(rect);
  },
);

test('fitBounds includes the toggles of expanded parents, a badge grows with its count', () => {
  const layout = mapLayout(
    [
      positioned('R', { x: 0, y: 40, width: 60, height: 20 }),
      positioned('A', { x: 120, y: 0, width: 80, height: 20 }),
      positioned('B', { x: 120, y: 80, width: 60, height: 20 }),
      positioned('C', { x: 210, y: 80, width: 30, height: 20 }),
    ],
    [
      ['R', 'A'],
      ['R', 'B'],
      ['B', 'C'],
    ],
  );
  // A collapsed (badge "1234", 42 px wide) ends at 200 + 3 + 42; B is expanded (inside the
  // bounds), C and the root have no toggle.
  expect(fitBounds(layout, new Map([['A', 1234]]))).toEqual({
    x: 0,
    y: 0,
    width: 245,
    height: 100,
  });
  expect(fitBounds(layout, new Map())).toEqual(layout.bounds);
  const expandedA = mapLayout(
    [...layout.nodes, positioned('D', { x: 300, y: 0, width: 40, height: 20 })],
    [['A', 'D']],
  );
  expect(fitBounds(expandedA, new Map())).toEqual(expandedA.bounds);
});

test('fitBounds of a layout without toggles (kanban) is its bounds, also with collapsed nodes', () => {
  const layout = {
    ...mapLayout(
      [
        positioned('R', { x: 0, y: 0, width: 60, height: 20 }),
        positioned('A', { x: 0, y: 40, width: 100, height: 20 }, 'bottom'),
      ],
      [['R', 'A']],
    ),
    toggles: false,
  };
  expect(fitBounds(layout, new Map([['A', 1234]]))).toEqual(layout.bounds);
});

test('fitBounds: a leaf at the edge has no toggle, the root never has one', () => {
  const layout = mapLayout(
    [
      // A root toggle would stick out on the right.
      positioned('R', { x: 120, y: 0, width: 80, height: 20 }),
      positioned('A', { x: 0, y: 0, width: 60, height: 20 }),
    ],
    [['R', 'A']],
  );
  expect(fitBounds(layout, new Map())).toEqual(layout.bounds);
});

const wheel = {
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  offsetX: 5,
  offsetY: 6,
};

test('plain wheel pans', () => {
  expect(wheelAction({ ...wheel, deltaX: 4, deltaY: 100 })).toEqual({
    kind: 'pan',
    dx: -4,
    dy: -100,
  });
});

test('line-mode deltas are scaled to pixels', () => {
  expect(wheelAction({ ...wheel, deltaMode: 1, deltaY: 3 })).toEqual({
    kind: 'pan',
    dx: -0,
    dy: -48,
  });
});

test.each(['ctrlKey', 'metaKey'] as const)('%s + wheel zooms at the pointer', (key) => {
  expect(wheelAction({ ...wheel, [key]: true, deltaY: -250 })).toEqual({
    kind: 'zoom',
    factor: 2,
    at: { x: 5, y: 6 },
  });
});

test('transformCss', () => {
  expect(transformCss({ x: 1, y: 2, zoom: 0.5 })).toBe('translate(1px, 2px) scale(0.5)');
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
