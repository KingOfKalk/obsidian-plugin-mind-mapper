import type { MapLayout, PositionedNode } from '../../src/layout/types';
import type { CollapseInfo } from '../../src/render/DomMapRenderer';
import { fitBounds, fitToBounds, type Transform } from '../../src/render/viewport';
import { FADE_MS, GLIDE_MS } from '../../src/view/animation';
import { Camera, type CameraHost, centredAt, screenCentreOf } from '../../src/view/camera';

/** Camera of the map view (issue #50): transform, fit, zoom, glides and fades. */

const NO_COLLAPSE: CollapseInfo = { hidden: new Map(), hasChildren: () => false };

function positioned(id: string, x: number, y: number): PositionedNode {
  return {
    node: { id, kind: 'root', markdown: id, line: 0, children: [] },
    x,
    y,
    width: 100,
    height: 40,
    childSide: 'right',
    align: 'center',
    depth: 0,
    branch: -1,
  } as unknown as PositionedNode;
}

function layoutOf(...nodes: PositionedNode[]): MapLayout {
  const right = Math.max(...nodes.map((p) => p.x + p.width));
  const bottom = Math.max(...nodes.map((p) => p.y + p.height));
  return { nodes, edges: [], dividers: [], bounds: { x: 0, y: 0, width: right, height: bottom } };
}

function setup(options: { reducedMotion?: boolean } = {}) {
  let next = 1;
  const pending = new Map<number, FrameRequestCallback>();
  let now = 0;
  const win = {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      pending.set(next, callback);
      return next++;
    },
    cancelAnimationFrame: (id: number) => pending.delete(id),
    matchMedia: (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && (options.reducedMotion ?? false),
    }),
  } as unknown as Window;
  const frames = (count: number): void => {
    for (let i = 0; i < count; i++) {
      now += 16;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(now);
    }
  };
  const canvas = document.body.createDiv();
  const resize = (width: number, height: number): void => {
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: height });
  };
  resize(800, 600);
  const shown: Transform[] = [];
  const opacity: (number | null)[] = [];
  let layout: MapLayout | null = layoutOf(positioned('a', 0, 0), positioned('b', 400, 300));
  const host: CameraHost = {
    win: () => win,
    canvas: () => canvas,
    showTransform: (t) => shown.push(t),
    setOpacity: (o) => opacity.push(o),
    shown: () => layout && { layout, collapse: NO_COLLAPSE },
    fitMaxZoom: () => 1,
  };
  const camera = new Camera(host);
  return {
    camera,
    canvas,
    resize,
    shown,
    opacity,
    frames,
    pending,
    setLayout: (l: MapLayout | null) => (layout = l),
    layout: () => layout,
  };
}

/** Enough frames for any animation to end. */
const SETTLE = Math.ceil((GLIDE_MS + 2 * FADE_MS) / 16) + 10;

afterEach(() => document.body.empty());

test('apply shows the transform; set ends the fit (later re-layouts anchor)', () => {
  const { camera, shown } = setup();
  camera.tryFit();
  expect(camera.fitted).toBe(true);
  camera.apply({ x: 1, y: 2, zoom: 1 });
  expect(camera.fitted).toBe(true);
  camera.set({ x: 5, y: 6, zoom: 2 });
  expect(camera.fitted).toBe(false);
  expect(camera.transform).toEqual({ x: 5, y: 6, zoom: 2 });
  expect(shown.at(-1)).toEqual({ x: 5, y: 6, zoom: 2 });
});

test('tryFit waits for a real canvas size and keeps the fit pending until then', () => {
  const { camera, resize, layout } = setup();
  resize(0, 0);
  camera.tryFit();
  expect(camera.pendingFit).toBe(true);
  expect(camera.fitted).toBe(false);
  resize(800, 600);
  camera.tryFit();
  expect(camera.pendingFit).toBe(false);
  expect(camera.fitted).toBe(true);
  const map = layout();
  if (!map) throw new Error('no layout');
  expect(camera.transform).toEqual(
    fitToBounds(fitBounds(map, new Map()), { width: 800, height: 600 }, 1),
  );
});

test('fitToView glides to the fit with is-animating on the canvas, then counts as fitted', () => {
  const { camera, canvas, frames, layout } = setup();
  camera.set({ x: 0, y: 0, zoom: 0.5 });
  camera.fitToView();
  expect(canvas.classList.contains('is-animating')).toBe(true);
  frames(3);
  const map = layout();
  if (!map) throw new Error('no layout');
  const fit = camera.fitTransform(map, NO_COLLAPSE);
  expect(camera.transform).not.toEqual(fit);
  frames(SETTLE);
  expect(camera.transform).toEqual(fit);
  expect(camera.fitted).toBe(true);
  expect(canvas.classList.contains('is-animating')).toBe(false);
});

test('with reduced motion an animation ends at once', () => {
  const { camera, canvas, pending } = setup({ reducedMotion: true });
  camera.zoomTo(2);
  expect(camera.transform.zoom).toBe(2);
  expect(canvas.classList.contains('is-animating')).toBe(false);
  expect(pending.size).toBe(0);
});

test('finish jumps a running glide to its end; cancel stops it where it is', () => {
  const first = setup();
  first.camera.zoomTo(2);
  first.frames(2);
  first.camera.finish();
  expect(first.camera.transform.zoom).toBe(2);
  expect(first.canvas.classList.contains('is-animating')).toBe(false);

  const second = setup();
  second.camera.run([second.camera.fade('out'), second.camera.glide(() => null)]);
  second.frames(2);
  second.camera.cancel();
  expect(second.canvas.classList.contains('is-animating')).toBe(false);
  expect(second.opacity.at(-1)).toBeNull();
  second.frames(SETTLE);
  expect(second.camera.transform.zoom).toBe(1);
});

test('fade in clears the opacity at its end', () => {
  const { camera, opacity, frames } = setup();
  camera.run([camera.fade('out'), camera.fade('in')]);
  frames(SETTLE);
  expect(opacity).toContain(0);
  expect(opacity.at(-1)).toBeNull();
});

test('glideTo a target that is already shown does nothing but ends the fit', () => {
  const { camera, canvas } = setup();
  camera.tryFit();
  const at = camera.transform;
  camera.glideTo(() => at);
  expect(camera.fitted).toBe(false);
  expect(canvas.classList.contains('is-animating')).toBe(false);
});

test('keepInPlace keeps the first anchor node still laid out at its screen position', () => {
  const { camera } = setup();
  camera.set({ x: 10, y: 20, zoom: 2 });
  const before = positioned('b', 400, 300);
  const after = positioned('b', 100, 50);
  const screen = screenCentreOf(before, camera.transform);
  camera.keepInPlace([positioned('gone', 0, 0), before], layoutOf(positioned('a', 0, 0), after));
  expect(screenCentreOf(after, camera.transform)).toEqual(screen);
  expect(camera.transform.zoom).toBe(2);
});

test('a re-layout during a glide to the fit retargets it to the new fit', () => {
  const { camera, frames, setLayout } = setup();
  camera.set({ x: 0, y: 0, zoom: 0.5 });
  camera.fitToView();
  frames(3);
  const bigger = layoutOf(positioned('a', 0, 0), positioned('b', 1600, 1200));
  setLayout(bigger);
  camera.tryFit();
  frames(SETTLE);
  expect(camera.transform).toEqual(camera.fitTransform(bigger, NO_COLLAPSE));
});

test('center and onScreen use the last real size while the canvas is hidden', () => {
  const { camera, resize } = setup();
  expect(camera.center()).toEqual({ x: 400, y: 300 });
  resize(0, 0);
  expect(camera.size()).toEqual({ width: 0, height: 0 });
  expect(camera.center()).toEqual({ x: 400, y: 300 });
  expect(camera.onScreen({ x: 10, y: 10, width: 10, height: 10 })).toBe(true);
  expect(camera.onScreen({ x: 900, y: 10, width: 10, height: 10 })).toBe(false);
});

test('centredAt puts the center of a rect at a screen point (inverse of screenCentreOf)', () => {
  const rect = { x: 40, y: 60, width: 100, height: 20 };
  const t = centredAt(rect, { x: 300, y: 200 }, 1.5);
  expect(t.zoom).toBe(1.5);
  expect(screenCentreOf(rect, t)).toEqual({ x: 300, y: 200 });
});
