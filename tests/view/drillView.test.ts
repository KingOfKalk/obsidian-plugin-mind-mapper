import type { WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, type MindMapSettings } from '../../src/settings';
import { FADE_MS, GLIDE_MS } from '../../src/view/animation';
import { LIVE_UPDATE_DEBOUNCE_MS, MindMapView } from '../../src/view/MindMapView';
import { loadFixture } from '../fixtures';
import { FakeWorkspace, fakeFile } from '../helpers';
import type { Scope as MockScope } from '../mocks/obsidian';

/** Drill-down (issue #23) in the view: state, layout, controls, keys and animation. */

const SETTINGS: MindMapSettings = {
  ...DEFAULT_SETTINGS,
  defaultLayout: 'left-to-right',
  defaultTheme: 'rainbow',
};

/** Animation frames run only when the test calls `frame()`; each is 16 ms later. */
let pending = new Map<number, FrameRequestCallback>();
let now = 0;
let reducedMotion = false;

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
  pending = new Map();
  now = 0;
  reducedMotion = false;
  let next = 1;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
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

async function open(
  fixtureName: string,
  ws = new FakeWorkspace(),
  state: Record<string, unknown> = {},
): Promise<{ view: MindMapView; ws: FakeWorkspace }> {
  const leaf = {
    app: ws.app,
    setViewState: vi.fn((viewState: { state?: unknown }) =>
      view.setState(viewState.state, { history: false }),
    ),
  };
  const view = new MindMapView(leaf as unknown as WorkspaceLeaf, { settings: () => SETTINGS });
  if (!ws.vault.texts.has('Note.md')) ws.addNote('Note.md', fixtureName);
  await view.onOpen();
  const canvas = view.contentEl.querySelector('.mind-mapper-canvas');
  for (const [key, value] of [
    ['clientWidth', 800],
    ['clientHeight', 600],
  ] as const) {
    Object.defineProperty(canvas, key, { configurable: true, value });
  }
  await view.setState({ file: 'Note.md', ...state }, { history: false });
  return { view, ws };
}

/** IDs of the nodes shown, sorted (node elements are kept across layouts, new ones appended). */
function nodeIds(view: MindMapView): string[] {
  return [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node')]
    .map((el) => el.dataset.nodeId ?? '')
    .sort();
}

function nodeEl(view: MindMapView, id: string): HTMLElement {
  const el = view.contentEl.querySelector<HTMLElement>(`.mind-mapper-node[data-node-id="${id}"]`);
  if (!el) throw new Error(`no node ${id}`);
  return el;
}

/**
 * The transform on screen. Read from the DOM: `getTransform()` (pan and zoom input) finishes a
 * running animation first.
 */
function shown(view: MindMapView): { x: number; y: number; zoom: number } {
  const css = view.contentEl.querySelector<HTMLElement>('.mind-mapper-world')?.style.transform;
  const match = /translate\((.+)px, (.+)px\) scale\((.+)\)/.exec(css ?? '');
  if (!match) throw new Error(`no transform: ${css}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

/** Screen position of the node's centre. */
function screenCentre(view: MindMapView, id: string): { x: number; y: number } {
  const el = nodeEl(view, id);
  const t = shown(view);
  const x = parseFloat(el.style.left) + parseFloat(el.style.width) / 2;
  const y = parseFloat(el.style.top) + parseFloat(el.style.height) / 2;
  return { x: x * t.zoom + t.x, y: y * t.zoom + t.y };
}

function drillButton(view: MindMapView): HTMLButtonElement {
  const b = view.contentEl.querySelector<HTMLButtonElement>(
    '.mind-mapper-controls button.mind-mapper-drill',
  );
  if (!b) throw new Error('no drill button');
  return b;
}

function opacity(view: MindMapView): string {
  return view.contentEl.querySelector<HTMLElement>('.mind-mapper-world')?.style.opacity ?? '';
}

function drawnLinks(view: MindMapView): string[] {
  return [...view.contentEl.querySelectorAll('.mind-mapper-crosslink-hit')].map(
    (el) => `${el.getAttribute('data-from-id')} -> ${el.getAttribute('data-to-id')}`,
  );
}

/** The transform a "Fit to view" would set now. */
function fitted(view: MindMapView): { x: number; y: number; zoom: number } {
  const before = view.getTransform();
  view.fitToView();
  const fit = view.getTransform();
  view.setTransform(before);
  return fit;
}

/** Drills in instantly (reduced motion) into each node in turn. */
function drillInto(view: MindMapView, ...ids: string[]): void {
  const before = reducedMotion;
  reducedMotion = true;
  for (const id of ids) {
    view.select(id);
    view.drill();
  }
  reducedMotion = before;
}

const BETA = ['Links/Beta', 'Links/Beta/Inner', 'Links/Beta/Inner/#1'];

describe('drilling in and out (reduced motion: instant)', () => {
  beforeEach(() => {
    reducedMotion = true;
  });

  test('a selected node with children becomes the centre: only its subtree, styled like the root, fitted', async () => {
    const { view, ws } = await open('crosslinks');
    const save = vi.spyOn(ws, 'requestSaveLayout');
    expect(view.canDrillDown()).toBe(false);
    view.select('Links/Beta');
    expect(view.canDrillDown()).toBe(true);
    view.drill();
    expect(nodeIds(view)).toEqual(BETA);
    expect(view.isDrilled).toBe(true);
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta'] });
    expect(save).toHaveBeenCalled();
    const centre = nodeEl(view, 'Links/Beta');
    expect(centre.classList.contains('is-root')).toBe(true);
    expect(centre.classList.contains('is-drill-centre')).toBe(true);
    expect(centre.hasAttribute('data-level')).toBe(false);
    expect(centre.hasAttribute('data-branch')).toBe(false);
    expect(view.selectedId).toBe('Links/Beta');
    expect(view.getTransform()).toEqual(fitted(view));
    // Centre marker and highlighted button (it drills out now: the centre is selected).
    expect(view.contentEl.querySelector('.mind-mapper-drill-marker')).not.toBeNull();
    expect(drillButton(view).classList.contains('is-active')).toBe(true);
    expect(drillButton(view).getAttribute('aria-label')).toBe('Drill out one level');
    // The centre has no collapse toggle, like the root.
    expect(view.contentEl.querySelector('[data-node-id="Links/Beta"].mind-mapper-collapse')).toBe(
      null,
    );
  });

  test('levels and branch colours are recomputed from the new centre', async () => {
    const { view } = await open('crosslinks');
    expect(nodeEl(view, 'Links/Gamma/#2').getAttribute('data-level')).toBe('2');
    expect(nodeEl(view, 'Links/Gamma/#2').getAttribute('data-branch')).toBe('3');
    drillInto(view, 'Links/Gamma');
    expect(nodeEl(view, 'Links/Gamma/#1').getAttribute('data-level')).toBe('1');
    expect(nodeEl(view, 'Links/Gamma/#1').getAttribute('data-branch')).toBe('1');
    expect(nodeEl(view, 'Links/Gamma/#2').getAttribute('data-level')).toBe('1');
    expect(nodeEl(view, 'Links/Gamma/#2').getAttribute('data-branch')).toBe('2');
    expect(nodeEl(view, 'Links/Gamma/#2/#1').getAttribute('data-level')).toBe('2');
    expect(nodeEl(view, 'Links/Gamma/#2/#1').getAttribute('data-branch')).toBe('2');
    const edge = view.contentEl.querySelector('path.mind-mapper-edge[data-level="1"]');
    expect(edge?.getAttribute('data-branch')).toBe('1');
  });

  test('links to nodes outside the drilled part are hidden', async () => {
    const { view } = await open('crosslinks');
    expect(drawnLinks(view)).toEqual(
      expect.arrayContaining([
        'Links/Gamma/#2 -> Links/Gamma',
        'Links/Gamma/#1 -> Links/Beta/Inner',
      ]),
    );
    drillInto(view, 'Links/Gamma');
    expect(drawnLinks(view)).toEqual(['Links/Gamma/#2 -> Links/Gamma']);
    view.showWholeMap();
    expect(drawnLinks(view)).toEqual(
      expect.arrayContaining(['Links/Gamma/#1 -> Links/Beta/Inner']),
    );
  });

  test('stacking; drilling out goes one level up, selects the node drilled out of and fits like "Fit to view"', async () => {
    const { view } = await open('crosslinks');
    view.select('Links/Beta');
    view.drill();
    view.select('Links/Beta/Inner');
    expect(drillButton(view).getAttribute('aria-label')).toBe('Drill down into selection');
    view.drill();
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta', 'Links/Beta/Inner'] });
    expect(nodeIds(view)).toEqual(['Links/Beta/Inner', 'Links/Beta/Inner/#1']);
    // The centre is selected: the button and D drill out one level.
    view.drill();
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta'] });
    expect(nodeIds(view)).toEqual(BETA);
    expect(view.selectedId).toBe('Links/Beta/Inner');
    expect(view.getTransform()).toEqual(fitted(view));
    expect(nodeEl(view, 'Links/Beta/Inner').classList.contains('is-root')).toBe(false);
    // Nothing selected while drilled in: the button still drills out.
    view.select(null);
    expect(drillButton(view).disabled).toBe(false);
    view.drill();
    expect(view.isDrilled).toBe(false);
    expect(nodeIds(view)).toHaveLength(10);
    expect(view.selectedId).toBe('Links/Beta');
    expect(view.contentEl.querySelector('.mind-mapper-drill-marker')).toBeNull();
    expect(drillButton(view).classList.contains('is-active')).toBe(false);
    // The whole map, fitted (margin, badges, "Max zoom for fit"), not the node centred.
    expect(view.getTransform()).toEqual(fitted(view));
  });

  test('"Show the whole map" goes straight out, selects the outermost drilled node and fits', async () => {
    const { view } = await open('crosslinks');
    drillInto(view, 'Links/Beta', 'Links/Beta/Inner');
    view.showWholeMap();
    expect(view.getState()).toMatchObject({ drill: [] });
    expect(nodeIds(view)).toHaveLength(10);
    expect(view.selectedId).toBe('Links/Beta');
    expect(view.getTransform()).toEqual(fitted(view));
  });

  test('after drilling out the map counts as fitted: a re-layout (measured sizes) fits again', async () => {
    const { view } = await open('crosslinks');
    drillInto(view, 'Links/Beta');
    view.showWholeMap();
    const content = nodeEl(view, 'Links/Gamma').querySelector('.mind-mapper-node-content');
    if (!content) throw new Error('no content');
    for (const [key, value] of [
      ['offsetWidth', 300],
      ['scrollWidth', 300],
      ['offsetHeight', 200],
      ['scrollHeight', 200],
    ] as const) {
      Object.defineProperty(content, key, { configurable: true, value });
    }
    const before = view.getTransform();
    (
      globalThis as unknown as { FakeResizeObserver: { trigger(els: Element[]): void } }
    ).FakeResizeObserver.trigger([content]);
    await vi.advanceTimersByTimeAsync(200);
    expect(view.getTransform()).not.toEqual(before);
    expect(view.getTransform()).toEqual(fitted(view));
  });

  test('the button is disabled for no selection, a leaf, and the root of the whole map', async () => {
    const { view } = await open('crosslinks');
    expect(drillButton(view).disabled).toBe(true);
    view.select('Links/Alpha/#1');
    expect(drillButton(view).disabled).toBe(true);
    view.select('Links');
    expect(drillButton(view).disabled).toBe(true);
    view.drill();
    expect(view.isDrilled).toBe(false);
    view.select('Links/Alpha');
    expect(drillButton(view).disabled).toBe(false);
    drillButton(view).click();
    expect(view.getState()).toMatchObject({ drill: ['Links/Alpha'] });
  });

  test('"Back to root" goes to the current centre', async () => {
    const { view } = await open('crosslinks');
    drillInto(view, 'Links/Beta');
    view.select('Links/Beta/Inner/#1');
    view.setTransform({ x: -500, y: 40, zoom: 0.7 });
    view.backToRoot();
    expect(view.selectedId).toBe('Links/Beta');
    expect(screenCentre(view, 'Links/Beta').x).toBeCloseTo(400);
    expect(view.getTransform().zoom).toBe(0.7);
  });

  test('a node collapsed in the whole map shows its children when drilled into; the collapse stays', async () => {
    const { view } = await open('crosslinks');
    view.toggleCollapse('Links/Beta');
    expect(nodeIds(view)).not.toContain('Links/Beta/Inner');
    drillInto(view, 'Links/Beta');
    expect(nodeIds(view)).toEqual(BETA);
    view.showWholeMap();
    expect(nodeIds(view)).not.toContain('Links/Beta/Inner');
  });

  test('collapse, layout and theme keep working inside the drilled view', async () => {
    const { view } = await open('crosslinks');
    drillInto(view, 'Links/Beta');
    view.toggleCollapse('Links/Beta/Inner');
    expect(nodeIds(view)).toEqual(['Links/Beta', 'Links/Beta/Inner']);
    view.chooseTheme('ocean');
    expect(view.contentEl.querySelector('.mind-mapper-theme-ocean')).not.toBeNull();
    view.chooseLayout('top-to-bottom');
    await vi.advanceTimersByTimeAsync(0);
    frame();
    expect(nodeIds(view)).toEqual(['Links/Beta', 'Links/Beta/Inner']);
    expect(view.isDrilled).toBe(true);
  });
});

describe('view state', () => {
  beforeEach(() => {
    reducedMotion = true;
  });

  test('the drill path is restored from the view state (restart), fitted; an older state shows the whole map', async () => {
    const { view, ws } = await open('crosslinks');
    drillInto(view, 'Links/Beta', 'Links/Beta/Inner');
    const saved = JSON.parse(JSON.stringify(view.getState())) as Record<string, unknown>;
    expect(saved).toMatchObject({ file: 'Note.md', drill: ['Links/Beta', 'Links/Beta/Inner'] });

    const { view: restored } = await open('crosslinks', ws, saved);
    expect(nodeIds(restored)).toEqual(['Links/Beta/Inner', 'Links/Beta/Inner/#1']);
    expect(restored.isDrilled).toBe(true);
    expect(nodeEl(restored, 'Links/Beta/Inner').classList.contains('is-root')).toBe(true);
    expect(restored.getTransform()).toEqual(fitted(restored));
    expect(drillButton(restored).classList.contains('is-active')).toBe(true);
    expect(restored.getState()).toMatchObject(saved);

    const { view: old } = await open('crosslinks', ws, {});
    expect(old.isDrilled).toBe(false);
    expect(nodeIds(old)).toHaveLength(10);
    expect(old.getState()).toMatchObject({ drill: [] });
  });

  test('renaming the note keeps the drilled view', async () => {
    const { view, ws } = await open('crosslinks');
    drillInto(view, 'Links/Beta');
    ws.addNote('Renamed.md', 'crosslinks');
    ws.vault.trigger('rename', fakeFile('Renamed.md'), 'Note.md');
    await vi.advanceTimersByTimeAsync(0);
    expect(view.getState()).toMatchObject({ file: 'Renamed.md', drill: ['Links/Beta'] });
    expect(nodeIds(view)).toEqual(BETA);
  });

  test('a saved drill path that no longer fits the note shows the whole map and is saved as such', async () => {
    const ws = new FakeWorkspace();
    const save = vi.spyOn(ws, 'requestSaveLayout');
    const { view } = await open('crosslinks', ws, { drill: ['Links/Gone'] });
    expect(view.isDrilled).toBe(false);
    expect(nodeIds(view)).toHaveLength(10);
    expect(view.getState()).toMatchObject({ drill: [] });
    expect(save).toHaveBeenCalled();
  });
});

describe('edits to the note', () => {
  beforeEach(() => {
    reducedMotion = true;
  });

  function change(ws: FakeWorkspace, fixtureName: string): void {
    const { text, cache } = loadFixture(fixtureName);
    ws.metadataCache.caches.set('Note.md', cache);
    ws.metadataCache.trigger('Note.md', text, cache ?? {});
  }

  test('an edit that keeps the drilled node keeps the drilled view', async () => {
    const { view, ws } = await open('live-before');
    drillInto(view, 'Live/Beta');
    change(ws, 'live-after');
    await vi.advanceTimersByTimeAsync(LIVE_UPDATE_DEBOUNCE_MS + 10);
    expect(view.isDrilled).toBe(true);
    expect(nodeIds(view)).toEqual(['Live/Beta', 'Live/Beta/#1']);
  });

  test('the drilled node removed or renamed by an edit: quietly back to the whole map, fitted', async () => {
    const { view, ws } = await open('live-before');
    drillInto(view, 'Live/Beta');
    const save = vi.spyOn(ws, 'requestSaveLayout');
    change(ws, 'worked-example');
    await vi.advanceTimersByTimeAsync(LIVE_UPDATE_DEBOUNCE_MS + 10);
    expect(view.isDrilled).toBe(false);
    expect(view.getState()).toMatchObject({ drill: [] });
    expect(save).toHaveBeenCalled();
    expect(nodeIds(view)).toContain('Project/Tasks');
    expect(view.contentEl.querySelector('.mind-mapper-drill-marker')).toBeNull();
    expect(drillButton(view).classList.contains('is-active')).toBe(false);
    expect(view.getTransform()).toEqual(fitted(view));
  });

  test('a sibling inserted above a drilled list item (its ordinal ID now names another node): back to the whole map, fitted', async () => {
    const { view, ws } = await open('drill-shift-before');
    drillInto(view, 'Shift/#1');
    expect(nodeIds(view)).toEqual(['Shift/#1', 'Shift/#1/#1']);
    change(ws, 'drill-shift-after');
    await vi.advanceTimersByTimeAsync(LIVE_UPDATE_DEBOUNCE_MS + 10);
    // Never silently another branch: `Shift/#1` is the new item "New" now.
    expect(view.isDrilled).toBe(false);
    expect(view.getState()).toMatchObject({ drill: [] });
    expect(nodeIds(view)).toContain('Shift/#3');
    expect(view.getTransform()).toEqual(fitted(view));
  });

  test('an edit elsewhere keeps a drilled list item; a restored path takes the node it finds', async () => {
    const { view, ws } = await open('drill-shift-after', new FakeWorkspace(), {
      drill: ['Shift/#2'],
    });
    expect(nodeIds(view)).toEqual(['Shift/#2', 'Shift/#2/#1']);
    change(ws, 'drill-shift-after');
    await vi.advanceTimersByTimeAsync(LIVE_UPDATE_DEBOUNCE_MS + 10);
    expect(view.isDrilled).toBe(true);
    expect(nodeIds(view)).toEqual(['Shift/#2', 'Shift/#2/#1']);
  });
});

describe('key D (view scope)', () => {
  function dHandler(view: MindMapView): MockScope['handlers'][number] {
    const handler = ((view.scope as unknown as MockScope | null)?.handlers ?? []).find(
      (h) => h.key === 'D',
    );
    if (!handler) throw new Error('no D handler');
    return handler;
  }

  function pressD(view: MindMapView, target: EventTarget): unknown {
    const evt = new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'target', { value: target });
    return dHandler(view).func(evt);
  }

  beforeEach(() => {
    reducedMotion = true;
  });

  test('registered without modifiers (no command hotkey)', async () => {
    const { view } = await open('crosslinks');
    expect(dHandler(view).modifiers).toEqual([]);
  });

  test('D on the map drills in, then out again; handled keys are consumed', async () => {
    const { view } = await open('crosslinks');
    const canvas = view.contentEl.querySelector('.mind-mapper-canvas') as HTMLElement;
    view.select('Links/Beta');
    expect(pressD(view, canvas)).toBe(false);
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta'] });
    expect(pressD(view, view.contentEl)).toBe(false);
    expect(view.isDrilled).toBe(false);
    // Nothing to do: the key is left alone.
    view.select(null);
    expect(pressD(view, canvas)).toBe(true);
  });

  test('D on a placeholder ("Loading…") does nothing, even with a restored drill path', async () => {
    const ws = new FakeWorkspace();
    ws.addNote('Note.md', 'crosslinks');
    vi.spyOn(ws.app.metadataCache, 'getFileCache').mockReturnValue(null);
    const { view } = await open('crosslinks', ws, { drill: ['Links/Beta'] });
    expect(view.showsMap()).toBe(false);
    expect(pressD(view, view.contentEl)).toBe(true);
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta'] });
  });

  test('D typed into the zoom field or any other text field does nothing', async () => {
    const { view } = await open('crosslinks');
    view.select('Links/Beta');
    const input = view.contentEl.querySelector('.mind-mapper-zoom-input') as HTMLElement;
    expect(pressD(view, input)).toBe(true);
    const textarea = view.contentEl.createEl('textarea');
    expect(pressD(view, textarea)).toBe(true);
    const editable = view.contentEl.createDiv();
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(pressD(view, editable)).toBe(true);
    expect(view.isDrilled).toBe(false);
  });
});

describe('animation', () => {
  test('drilling in: glide towards the node, then fade out the old map and fade in the drilled one', async () => {
    const { view } = await open('crosslinks');
    view.setTransform({ x: 0, y: 300, zoom: 0.5 });
    const start = view.getTransform();
    view.select('Links/Beta');
    view.drill();
    // The state changes at once (saved, commands), the old map stays until the cross-fade.
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta'] });
    expect(nodeIds(view)).toHaveLength(10);
    const canvas = view.contentEl.querySelector('.mind-mapper-canvas');
    expect(canvas?.classList.contains('is-animating')).toBe(true);
    frame();
    frame();
    // Gliding: the transform moves, the map is fully shown.
    expect(shown(view)).not.toEqual(start);
    expect(opacity(view)).toBe('');
    frames(Math.ceil(GLIDE_MS / 16) + 1);
    // Fading out the old map.
    frames(3);
    expect(Number(opacity(view))).toBeLessThan(1);
    expect(nodeIds(view)).toHaveLength(10);
    frames(Math.ceil(FADE_MS / 16));
    // Swapped: the drilled view, fitted, fading in.
    expect(nodeIds(view)).toEqual(BETA);
    expect(Number(opacity(view))).toBeLessThan(1);
    settleFrames();
    expect(opacity(view)).toBe('');
    expect(canvas?.classList.contains('is-animating')).toBe(false);
    expect(view.getTransform()).toEqual(fitted(view));
  });

  test('the glide ends with the node where it is in the drilled view, at its zoom', async () => {
    const { view } = await open('crosslinks');
    view.select('Links/Beta');
    view.drill();
    frames(Math.ceil(GLIDE_MS / 16) + 2);
    const glided = shown(view);
    const before = screenCentre(view, 'Links/Beta');
    settleFrames();
    expect(glided.zoom).toBeCloseTo(view.getTransform().zoom);
    const after = screenCentre(view, 'Links/Beta');
    expect(before.x).toBeCloseTo(after.x, 0);
    expect(before.y).toBeCloseTo(after.y, 0);
  });

  test('drilling out reverses it: fade out, swap, fade in, then glide to the fitted whole map', async () => {
    const { view } = await open('crosslinks');
    drillInto(view, 'Links/Beta');
    view.drill();
    expect(view.isDrilled).toBe(false);
    expect(nodeIds(view)).toEqual(BETA);
    frames(3);
    expect(Number(opacity(view))).toBeLessThan(1);
    expect(nodeIds(view)).toEqual(BETA);
    frames(Math.ceil(FADE_MS / 16));
    expect(nodeIds(view)).toHaveLength(10);
    frames(Math.ceil(FADE_MS / 16) + 1);
    expect(opacity(view)).toBe('');
    const gliding = shown(view);
    settleFrames();
    expect(view.selectedId).toBe('Links/Beta');
    expect(view.getTransform()).toEqual(fitted(view));
    // On screen too (the CSS transform rounds the zoom).
    const fit = fitted(view);
    expect(shown(view).x).toBeCloseTo(fit.x);
    expect(shown(view).y).toBeCloseTo(fit.y);
    expect(shown(view).zoom).toBeCloseTo(fit.zoom);
    expect(gliding).not.toEqual(shown(view));
  });

  test('pressing again during an animation finishes it at once and continues (no pile-up)', async () => {
    const { view } = await open('crosslinks');
    view.select('Links/Beta');
    view.drill();
    frames(3);
    // Mid-glide: the drill-in completes at once, then drilling out starts.
    view.drill();
    expect(view.isDrilled).toBe(false);
    expect(nodeIds(view)).toEqual(BETA);
    expect(nodeEl(view, 'Links/Beta').classList.contains('is-root')).toBe(true);
    // And again: the drill-out completes, drilling in starts once more.
    view.drill();
    expect(nodeIds(view)).toHaveLength(10);
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta'] });
    settleFrames();
    expect(nodeIds(view)).toEqual(BETA);
    expect(opacity(view)).toBe('');
    expect(pending.size).toBe(0);
  });

  test('with reduced motion it switches instantly, no frames', async () => {
    const { view } = await open('crosslinks');
    settleFrames();
    reducedMotion = true;
    view.select('Links/Beta');
    view.drill();
    expect(nodeIds(view)).toEqual(BETA);
    expect(opacity(view)).toBe('');
    expect(view.contentEl.querySelector('.is-animating')).toBeNull();
  });

  test('pan and zoom input reads the transform: that finishes the animation first', async () => {
    const { view } = await open('crosslinks');
    view.select('Links/Beta');
    view.drill();
    frames(3);
    const t = view.getTransform();
    expect(nodeIds(view)).toEqual(BETA);
    expect(t).toEqual(fitted(view));
  });

  test('panning or zooming during an animation finishes it first', async () => {
    const { view } = await open('crosslinks');
    view.select('Links/Beta');
    view.drill();
    frames(3);
    view.zoomIn();
    expect(nodeIds(view)).toEqual(BETA);
    expect(opacity(view)).toBe('');
    const zoomed = view.getTransform();
    settleFrames();
    expect(view.getTransform()).toEqual(zoomed);
  });

  test('closing the view during an animation stops it', async () => {
    const { view } = await open('crosslinks');
    view.select('Links/Beta');
    view.drill();
    frames(3);
    await view.onClose();
    expect(() => settleFrames()).not.toThrow();
  });
});
