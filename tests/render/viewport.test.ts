import type { Point } from '../../src/layout/types';
import {
  fitToBounds,
  IDENTITY,
  panBy,
  resetZoom,
  transformCss,
  type Transform,
  wheelAction,
  zoomAt,
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

test('fitToBounds centers and never zooms above 1', () => {
  const t = fitToBounds({ x: 0, y: -10, width: 100, height: 20 }, { width: 800, height: 600 });
  expect(t?.zoom).toBe(1);
  expect(t && { x: 50 * t.zoom + t.x, y: 0 * t.zoom + t.y }).toEqual({ x: 400, y: 300 });
});

test('fitToBounds shrinks large maps', () => {
  const t = fitToBounds({ x: 0, y: 0, width: 2000, height: 400 }, { width: 800, height: 600 });
  expect(t?.zoom).toBeCloseTo(720 / 2000);
  expect(t && 1000 * t.zoom + t.x).toBeCloseTo(400);
});

test.each([
  [0, 600],
  [800, 0],
])('fitToBounds returns null for zero size (%i x %i)', (width, height) => {
  expect(fitToBounds({ x: 0, y: 0, width: 10, height: 10 }, { width, height })).toBeNull();
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
