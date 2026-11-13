import type { WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, type MindMapSettings } from '../../src/settings';
import type { Transform } from '../../src/render/viewport';
import { FADE_MS, GLIDE_MS } from '../../src/view/animation';
import { LIVE_UPDATE_DEBOUNCE_MS, MindMapView } from '../../src/view/MindMapView';
import { loadFixture } from '../fixtures';
import { FakeWorkspace } from '../helpers';
import { Menu as MockMenu } from '../mocks/obsidian';

/**
 * Smooth camera (issue #24): fit, zoom controls, Back to root and layout switches glide like the
 * drill-down; reduced motion, wheel and trackpad stay instant.
 */

/** Animation frames run only when the test calls `frame()`; each is 16 ms later. */
let pending = new Map<number, FrameRequestCallback>();
let now = 0;
let reducedMotion = false;
/** Frames requested so far. */
let requested = 0;

function frame(): void {
  now += 16;
  const callbacks = [...pending.values()];
  pending.clear();
  for (const callback of callbacks) callback(now);
}

function frames(count: number): void {
  for (let i = 0; i < count; i++) frame();
}

/** Enough frames for any animation to end. */
function settleFrames(): void {
  frames(Math.ceil((GLIDE_MS + 2 * FADE_MS) / 16) + 10);
}

beforeEach(() => {
  vi.useFakeTimers();
  MockMenu.lastShown = null;
  pending = new Map();
  now = 0;
  reducedMotion = false;
  let next = 1;
  requested = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    requested++;
    pending.set(next, callback);
    return next++;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    pending.delete(id);
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      media: query,
      matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
  document.body.empty();
});

const LTR: MindMapSettings = { ...DEFAULT_SETTINGS, defaultLayout: 'left-to-right' };

async function open(
  fixtureName = 'worked-example',
  settings: MindMapSettings = { ...LTR },
): Promise<{ view: MindMapView; ws: FakeWorkspace; settings: MindMapSettings }> {
  const ws = new FakeWorkspace();
  const leaf = { app: ws.app, setViewState: vi.fn(() => Promise.resolve()) };
  const view = new MindMapView(leaf as unknown as WorkspaceLeaf, { settings: () => settings });
  ws.addNote('Note.md', fixtureName);
  await view.onOpen();
  const canvas = view.contentEl.querySelector('.mind-mapper-canvas');
  for (const [key, value] of [
    ['clientWidth', 800],
    ['clientHeight', 600],
  ] as const) {
    Object.defineProperty(canvas, key, { configurable: true, value });
  }
  await view.setState({ file: 'Note.md' }, { history: false });
  // Culling frames of the first render.
  settleFrames();
  return { view, ws, settings };
}

function canvasOf(view: MindMapView): HTMLElement {
  const canvas = view.contentEl.querySelector<HTMLElement>('.mind-mapper-canvas');
  if (!canvas) throw new Error('no canvas');
  return canvas;
}

const animating = (view: MindMapView): boolean => canvasOf(view).classList.contains('is-animating');

/**
 * The transform on screen. Read from the DOM: `getTransform()` (pan and zoom input) finishes a
 * running animation first.
 */
function shown(view: MindMapView): Transform {
  const css = view.contentEl.querySelector<HTMLElement>('.mind-mapper-world')?.style.transform;
  const match = /translate\((.+)px, (.+)px\) scale\((.+)\)/.exec(css ?? '');
  if (!match) throw new Error(`no transform: ${css}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

/** On screen: the CSS transform keeps about six digits. */
function expectShown(view: MindMapView, t: Transform): void {
  const s = shown(view);
  expect(s.x).toBeCloseTo(t.x, 3);
  expect(s.y).toBeCloseTo(t.y, 3);
  expect(s.zoom).toBeCloseTo(t.zoom, 5);
}

function opacity(view: MindMapView): string {
  return view.contentEl.querySelector<HTMLElement>('.mind-mapper-world')?.style.opacity ?? '';
}

function zoomField(view: MindMapView): HTMLInputElement {
  const input = view.contentEl.querySelector<HTMLInputElement>('.mind-mapper-zoom-input');
  if (!input) throw new Error('no zoom input');
  return input;
}

const percent = (zoom: number): string => `${Math.round(zoom * 100)}%`;

function control(view: MindMapView, label: string): HTMLElement {
  const el = view.contentEl.querySelector<HTMLElement>(
    `.mind-mapper-controls button[aria-label="${label}"]`,
  );
  if (!el) throw new Error(`no control ${label}`);
  return el;
}

function nodeBox(view: MindMapView, id: string) {
  const el = view.contentEl.querySelector<HTMLElement>(`.mind-mapper-node[data-node-id="${id}"]`);
  if (!el) throw new Error(`no node ${id}`);
  return {
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
    width: parseFloat(el.style.width),
    height: parseFloat(el.style.height),
  };
}

/** Children below the root: top-to-bottom. */
function grows(view: MindMapView, root: string, child: string): string {
  const r = nodeBox(view, root);
  const c = nodeBox(view, child);
  if (c.y >= r.y + r.height) return 'down';
  if (c.y + c.height <= r.y) return 'up';
  return c.x > r.x ? 'right' : 'left';
}

/** What `act` sets from `start` with reduced motion: the instant result of before issue #24. */
function instantly(view: MindMapView, start: Transform, act: (v: MindMapView) => void): Transform {
  const before = reducedMotion;
  reducedMotion = true;
  view.setTransform(start);
  act(view);
  const result = view.getTransform();
  reducedMotion = before;
  view.setTransform(start);
  settleFrames();
  return result;
}

/** The fit of the shown map (instant). */
function fitOf(view: MindMapView): Transform {
  return instantly(view, view.getTransform(), (v) => v.fitToView());
}

interface FakeObserverClass {
  trigger(elements?: Element[]): void;
}
const FakeRO = (globalThis as unknown as { FakeResizeObserver: FakeObserverClass })
  .FakeResizeObserver;

/** Pretends the rendered content of `id` has this natural size (measured on the next report). */
function report(view: MindMapView, id: string, width: number, height: number): void {
  const el = view.contentEl.querySelector<HTMLElement>(
    `[data-node-id="${id}"] .mind-mapper-node-content`,
  );
  if (!el) throw new Error(`no content for ${id}`);
  for (const [key, value] of [
    ['offsetWidth', Math.min(width, 302)],
    ['scrollWidth', width],
    ['offsetHeight', height],
    ['scrollHeight', height],
  ] as const) {
    Object.defineProperty(el, key, { configurable: true, value });
  }
  FakeRO.trigger([el]);
}

function change(ws: FakeWorkspace, path: string, fixtureName: string): void {
  const { text, cache } = loadFixture(fixtureName);
  ws.metadataCache.caches.set(path, cache);
  ws.metadataCache.trigger(path, text, cache ?? {});
}

/** Moved away from the fit, the whole map still in view. */
const START: Transform = { x: 120, y: 90, zoom: 0.6 };

const ACTIONS: [string, (view: MindMapView) => void][] = [
  ['Fit to view', (view) => view.fitToView()],
  ['Zoom in', (view) => view.zoomIn()],
  ['Zoom out', (view) => view.zoomOut()],
  ['a typed zoom or preset', (view) => view.zoomTo(1.29)],
  ['Reset zoom', (view) => view.resetZoom()],
  ['Back to root', (view) => view.backToRoot()],
];

describe('camera actions glide', () => {
  test.each(ACTIONS)(
    '%s glides (about 250 ms, eased) to the transform it set at once before',
    async (_, act) => {
      const { view } = await open();
      const target = instantly(view, START, act);
      expect(target).not.toEqual(START);
      act(view);
      expect(animating(view)).toBe(true);
      // Nothing moves before the first frame.
      expect(shown(view)).toEqual(START);
      frames(Math.round(GLIDE_MS / 2 / 16));
      const mid = shown(view);
      expect(mid).not.toEqual(START);
      expect(mid).not.toEqual(target);
      // The zoom field follows the camera.
      expect(zoomField(view).value).toBe(percent(mid.zoom));
      settleFrames();
      expect(animating(view)).toBe(false);
      expectShown(view, target);
      expect(view.getTransform()).toEqual(target);
      expect(zoomField(view).value).toBe(percent(target.zoom));
      expect(pending.size).toBe(0);
    },
  );

  test.each(ACTIONS)('%s is instant with reduced motion', async (_, act) => {
    const { view } = await open();
    const target = instantly(view, START, act);
    reducedMotion = true;
    act(view);
    expect(animating(view)).toBe(false);
    expectShown(view, target);
    expect(zoomField(view).value).toBe(percent(target.zoom));
    settleFrames();
    expectShown(view, target);
  });

  test('the glide is eased: slow at the start and the end', async () => {
    const { view } = await open();
    view.setTransform({ x: 10, y: 10, zoom: 1 });
    view.zoomTo(2);
    const zooms: number[] = [];
    for (let i = 0; i < Math.ceil(GLIDE_MS / 16) + 1; i++) {
      frame();
      zooms.push(shown(view).zoom);
    }
    const steps = zooms.slice(1).map((z, i) => z - (zooms[i] ?? 0));
    const middle = steps[Math.floor(steps.length / 2)] ?? 0;
    expect(steps[0]).toBeLessThan(middle);
    expect(steps.at(-2) ?? 0).toBeLessThan(middle);
    expect(zooms.at(-1)).toBe(2);
  });

  test('a second action mid-animation finishes the first at once and glides on from there', async () => {
    const { view } = await open();
    view.setTransform({ x: 0, y: 0, zoom: 1 });
    view.zoomIn();
    frames(3);
    view.zoomIn();
    // The first glide ended at 125 %; the second starts there.
    expect(shown(view).zoom).toBe(1.25);
    expect(zoomField(view).value).toBe('125%');
    expect(animating(view)).toBe(true);
    settleFrames();
    expect(view.getTransform().zoom).toBe(1.5);
    expect(pending.size).toBe(0);
  });

  test('actions never pile up: five quick presses end five steps further, one animation', async () => {
    const { view } = await open();
    view.setTransform({ x: 0, y: 0, zoom: 1 });
    for (let i = 0; i < 5; i++) view.zoomIn();
    // Steps 1.25, 1.5, 2, 3, 4: the first four ended at once.
    expect(shown(view).zoom).toBe(3);
    const before = requested;
    frame();
    // One running animation asks for one frame (plus the renderer's culling frame).
    expect(requested - before).toBeLessThanOrEqual(2);
    settleFrames();
    expect(view.getTransform().zoom).toBe(4);
  });

  test('Fit to view during a zoom glide fits from the finished zoom', async () => {
    const { view } = await open();
    view.setTransform(START);
    view.zoomIn();
    frames(3);
    view.fitToView();
    expect(shown(view).zoom).toBe(0.75);
    settleFrames();
    expect(view.getTransform()).toEqual(fitOf(view));
  });

  test('wheel input during a glide finishes it and applies the wheel on the final transform', async () => {
    const { view } = await open();
    const fit = instantly(view, START, (v) => v.fitToView());
    view.fitToView();
    frames(3);
    canvasOf(view).dispatchEvent(
      new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }),
    );
    expect(animating(view)).toBe(false);
    expectShown(view, { ...fit, y: fit.y - 100 });
    settleFrames();
    expect(view.getTransform()).toEqual({ ...fit, y: fit.y - 100 });
  });

  test('a drag during a glide finishes it and pans from the final transform', async () => {
    const { view } = await open();
    const target = instantly(view, START, (v) => v.zoomTo(1.29));
    view.zoomTo(1.29);
    frames(3);
    const canvas = canvasOf(view);
    const pointer = (type: string, x: number, buttons = 1) =>
      canvas.dispatchEvent(
        new PointerEvent(type, { bubbles: true, button: 0, buttons, clientX: x, clientY: 0 }),
      );
    pointer('pointerdown', 100);
    pointer('pointermove', 130);
    pointer('pointerup', 130, 0);
    expect(animating(view)).toBe(false);
    expect(view.getTransform()).toEqual({ ...target, x: target.x + 30 });
  });

  test('a double click on the empty canvas glides to the fit', async () => {
    const { view } = await open();
    const fit = instantly(view, START, (v) => v.fitToView());
    const canvas = canvasOf(view);
    for (let i = 0; i < 2; i++) {
      for (const type of ['pointerdown', 'pointerup'])
        canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0 }));
    }
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(animating(view)).toBe(true);
    expect(shown(view)).toEqual(START);
    settleFrames();
    expect(view.getTransform()).toEqual(fit);
  });

  test('the control bar glides: zoom buttons, Fit to view, the presets and a typed zoom', async () => {
    const { view } = await open();
    view.setTransform({ x: 0, y: 0, zoom: 1 });
    control(view, 'Zoom in').click();
    expect(animating(view)).toBe(true);
    settleFrames();
    expect(view.getTransform().zoom).toBe(1.25);
    control(view, 'Zoom out').click();
    expect(animating(view)).toBe(true);
    settleFrames();
    expect(view.getTransform().zoom).toBe(1);

    control(view, 'Zoom presets').click();
    const preset = MockMenu.lastShown?.items.find((item) => item.title === '75%');
    preset?.clickHandler?.();
    expect(animating(view)).toBe(true);
    settleFrames();
    expect(view.getTransform().zoom).toBe(0.75);

    const input = zoomField(view);
    input.focus();
    input.value = '129';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(animating(view)).toBe(true);
    frames(5);
    // The field shows the zoom on the way.
    expect(input.value).toBe(percent(shown(view).zoom));
    settleFrames();
    expect(view.getTransform().zoom).toBe(1.29);
    expect(input.value).toBe('129%');

    const fit = instantly(view, view.getTransform(), (v) => v.fitToView());
    control(view, 'Fit to view').click();
    expect(animating(view)).toBe(true);
    settleFrames();
    expect(view.getTransform()).toEqual(fit);
  });

  test('Back to root that does not move the camera starts no animation', async () => {
    const { view } = await open();
    view.backToRoot();
    settleFrames();
    view.backToRoot();
    expect(animating(view)).toBe(false);
  });

  test('opening a note fits at once (no glide from nowhere)', async () => {
    const { view } = await open();
    // `open` settled; the first fit needed no frames.
    const ws = new FakeWorkspace();
    const leaf = { app: ws.app, setViewState: vi.fn(() => Promise.resolve()) };
    const fresh = new MindMapView(leaf as unknown as WorkspaceLeaf, { settings: () => LTR });
    ws.addNote('Note.md', 'worked-example');
    await fresh.onOpen();
    for (const [key, value] of [
      ['clientWidth', 800],
      ['clientHeight', 600],
    ] as const) {
      Object.defineProperty(canvasOf(fresh), key, { configurable: true, value });
    }
    await fresh.setState({ file: 'Note.md' }, { history: false });
    expect(animating(fresh)).toBe(false);
    expectShown(fresh, fitOf(view));
  });

  test('collapse and live edits stay instant and anchored', async () => {
    const { view, ws } = await open();
    view.setTransform(START);
    view.collapseAll();
    expect(animating(view)).toBe(false);
    view.expandAll();
    change(ws, 'Note.md', 'worked-example');
    await vi.advanceTimersByTimeAsync(LIVE_UPDATE_DEBOUNCE_MS);
    expect(animating(view)).toBe(false);
  });

  test('a re-layout from measuring during the fit glide moves its target: it lands on the new fit', async () => {
    const { view } = await open();
    view.setTransform(START);
    view.fitToView();
    frames(3);
    report(view, 'Project', 300, 200);
    await vi.advanceTimersByTimeAsync(100);
    // Still gliding, no jump to the new fit.
    expect(animating(view)).toBe(true);
    settleFrames();
    const landed = view.getTransform();
    expect(landed).toEqual(fitOf(view));
  });

  test('a re-layout from measuring during a zoom glide keeps the anchor like after an instant zoom', async () => {
    const reference = await open();
    reducedMotion = true;
    reference.view.setTransform(START);
    reference.view.zoomTo(1.29);
    report(reference.view, 'Project/Tasks', 300, 200);
    await vi.advanceTimersByTimeAsync(100);
    const expected = reference.view.getTransform();
    reducedMotion = false;

    const { view } = await open();
    view.setTransform(START);
    view.zoomTo(1.29);
    frames(3);
    report(view, 'Project/Tasks', 300, 200);
    await vi.advanceTimersByTimeAsync(100);
    settleFrames();
    const landed = view.getTransform();
    expect(landed.zoom).toBe(expected.zoom);
    expect(landed.x).toBeCloseTo(expected.x, 9);
    expect(landed.y).toBeCloseTo(expected.y, 9);
  });

  test('closing the view during a glide stops it', async () => {
    const { view } = await open();
    view.setTransform(START);
    view.fitToView();
    frames(3);
    await view.onClose();
    expect(() => settleFrames()).not.toThrow();
  });
});

describe('layout switches cross-fade and glide to the new fit', () => {
  /** The fit of a map opened with `layout` (instant at open). */
  async function fitWith(fixtureName: string, layout = LTR.defaultLayout): Promise<Transform> {
    const { view } = await open(fixtureName, { ...LTR, defaultLayout: layout });
    return view.getTransform();
  }

  test('choosing a layout: fade out, swap with the center node kept in place, fade in, glide to the fit', async () => {
    const expected = await fitWith('worked-example', 'top-to-bottom');
    const { view } = await open();
    view.setTransform(START);
    view.chooseLayout('top-to-bottom');
    // The layout frame starts the animation; the old map fades out first.
    frame();
    expect(animating(view)).toBe(true);
    frames(3);
    expect(Number(opacity(view))).toBeLessThan(1);
    expect(grows(view, 'Project', 'Project/Tasks')).toBe('right');
    frames(Math.ceil(FADE_MS / 16));
    // Swapped: the new layout fades in at the old zoom.
    expect(grows(view, 'Project', 'Project/Tasks')).toBe('down');
    expect(Number(opacity(view))).toBeLessThan(1);
    expect(shown(view).zoom).toBe(START.zoom);
    frames(Math.ceil(FADE_MS / 16) + 1);
    expect(opacity(view)).toBe('');
    // Gliding to the fit.
    frames(3);
    expect(shown(view)).not.toEqual(expected);
    settleFrames();
    expect(animating(view)).toBe(false);
    expect(view.getTransform()).toEqual(expected);
    expect(zoomField(view).value).toBe(percent(expected.zoom));
  });

  test('the node at the center keeps its screen position across the swap', async () => {
    const { view } = await open();
    const box = nodeBox(view, 'Project/Tasks');
    view.setTransform({
      x: 400 - (box.x + box.width / 2) * 0.6,
      y: 300 - (box.y + box.height / 2) * 0.6,
      zoom: 0.6,
    });
    view.chooseLayout('top-to-bottom');
    frames(1 + Math.ceil(FADE_MS / 16) + 2);
    expect(grows(view, 'Project', 'Project/Tasks')).toBe('down');
    const after = nodeBox(view, 'Project/Tasks');
    const t = shown(view);
    expect((after.x + after.width / 2) * t.zoom + t.x).toBeCloseTo(400, 6);
    expect((after.y + after.height / 2) * t.zoom + t.y).toBeCloseTo(300, 6);
  });

  test('Next layout glides too', async () => {
    const expected = await fitWith('worked-example', 'right-to-left');
    const { view } = await open();
    view.setTransform(START);
    view.nextLayout();
    frame();
    expect(animating(view)).toBe(true);
    settleFrames();
    expect(view.getTransform()).toEqual(expected);
  });

  test('a setting that changes the layout glides', async () => {
    const expected = await fitWith('worked-example', 'top-to-bottom');
    const { view, settings } = await open();
    view.setTransform(START);
    settings.defaultLayout = 'top-to-bottom';
    view.refresh();
    expect(animating(view)).toBe(true);
    settleFrames();
    expect(grows(view, 'Project', 'Project/Tasks')).toBe('down');
    expect(view.getTransform()).toEqual(expected);
  });

  test('a frontmatter edit that changes the layout glides', async () => {
    const expected = await fitWith('fm-layout');
    const { view, ws } = await open('live-before');
    view.setTransform(START);
    change(ws, 'Note.md', 'fm-layout');
    await vi.advanceTimersByTimeAsync(LIVE_UPDATE_DEBOUNCE_MS);
    expect(animating(view)).toBe(true);
    settleFrames();
    expect(grows(view, 'Root', 'Root/A')).toBe('down');
    expect(view.getTransform()).toEqual(expected);
  });

  test('with reduced motion a layout switch is instant', async () => {
    const expected = await fitWith('worked-example', 'top-to-bottom');
    const { view } = await open();
    reducedMotion = true;
    view.setTransform(START);
    view.chooseLayout('top-to-bottom');
    frame();
    expect(animating(view)).toBe(false);
    expect(opacity(view)).toBe('');
    expect(grows(view, 'Project', 'Project/Tasks')).toBe('down');
    expectShown(view, expected);
  });

  test('another layout during a switch finishes it and switches again', async () => {
    const expected = await fitWith('worked-example', 'bottom-to-top');
    const { view } = await open();
    view.setTransform(START);
    view.chooseLayout('top-to-bottom');
    frames(4);
    view.chooseLayout('bottom-to-top');
    // The first switch completed at once.
    expect(grows(view, 'Project', 'Project/Tasks')).toBe('down');
    expect(opacity(view)).toBe('');
    settleFrames();
    expect(grows(view, 'Project', 'Project/Tasks')).toBe('up');
    expect(view.getTransform()).toEqual(expected);
    expect(pending.size).toBe(0);
  });
});
