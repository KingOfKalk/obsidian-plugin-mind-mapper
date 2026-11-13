import { type CachedMetadata, MarkdownRenderer, type WorkspaceLeaf } from 'obsidian';
import { estimateSize } from '../../src/layout/nodeSize';
import { layoutTree } from '../../src/layout/tidyTree';
import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import { DomMapRenderer } from '../../src/render/DomMapRenderer';
import { fitBounds, fitMargin, fitToBounds, IDENTITY } from '../../src/render/viewport';
import { NodeContentModal } from '../../src/render/NodeContentModal';
import { DEFAULT_SETTINGS, type MindMapSettings } from '../../src/settings';
import type { MockInstance } from 'vitest';
import { MindMapView, type ViewServices } from '../../src/view/MindMapView';
import { loadFixture } from '../fixtures';
import { FakeWorkspace, fakeFile, useGerman } from '../helpers';
import {
  type Component as MockComponent,
  Menu as MockMenu,
  Modal as MockModal,
  type Scope as MockScope,
} from '../mocks/obsidian';

// Camera moves are instant here (reduced motion): these tests check where actions put the view.
// The animations themselves have their own tests (cameraView.test.ts, drillView.test.ts).
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      media: query,
      matches: query === '(prefers-reduced-motion: reduce)',
    }),
  });
});
afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

function newView(ws = new FakeWorkspace()): { view: MindMapView; ws: FakeWorkspace } {
  // Like Obsidian: setViewState with the same view type passes the state to the view.
  const leaf = {
    app: ws.app,
    setViewState: vi.fn((viewState: { state?: unknown }) =>
      view.setState(viewState.state, { history: false }),
    ),
  };
  // Most tests assert left-to-right geometry; layouts have their own tests below.
  const view = new MindMapView(leaf as unknown as WorkspaceLeaf, {
    settings: () => LTR_SETTINGS,
  });
  return { view, ws };
}

const LTR_SETTINGS: MindMapSettings = { ...DEFAULT_SETTINGS, defaultLayout: 'left-to-right' };

function setElSize(el: Element | null, width: number, height: number): void {
  if (!el) throw new Error('element missing');
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
}

/** Sizes the map canvas (creates the view DOM first via onOpen). */
async function setSize(view: MindMapView, width: number, height: number): Promise<void> {
  await view.onOpen();
  setElSize(view.contentEl.querySelector('.mind-mapper-canvas'), width, height);
}

function placeholderText(view: MindMapView): string | null | undefined {
  const el = view.contentEl.querySelector<HTMLElement>('.mind-mapper-placeholder');
  return el && !el.hidden ? el.textContent : null;
}

function nodeIds(view: MindMapView): (string | undefined)[] {
  return [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node')].map(
    (el) => el.dataset.nodeId,
  );
}

function resetLabel(view: MindMapView): string | null | undefined {
  return view.contentEl.querySelector<HTMLInputElement>('.mind-mapper-zoom-input')?.value;
}

const state = (file: unknown) => [{ file }, { history: false }] as const;

test('new view has no file, title "Mind map", placeholder "No note selected"', async () => {
  const { view } = newView();
  await view.onOpen();
  expect(view.file).toBeNull();
  expect(view.getDisplayText()).toBe('Mind map');
  expect(placeholderText(view)).toBe('No note selected');
});

test('setState({file}) round-trips through getState and sets title', async () => {
  const { view } = newView();
  await view.setState(...state('Notizen/Über Ärger 🚀.md'));
  expect(view.getState().file).toBe('Notizen/Über Ärger 🚀.md');
  expect(view.getDisplayText()).toBe('Über Ärger 🚀');
});

function headerTitle(view: MindMapView): string | null | undefined {
  return view.containerEl.querySelector('.view-header-title')?.textContent;
}

test('the view header title follows the note: set, switched and reset', async () => {
  const { view } = newView();
  await view.onOpen();
  await view.setState(...state('Folder/First.md'));
  expect(headerTitle(view)).toBe('First');
  await view.setState(...state('Second.md'));
  expect(headerTitle(view)).toBe('Second');
  await view.setState(...state(42));
  expect(headerTitle(view)).toBe('Mind map');
});

test('setState with malformed state falls back to no file', async () => {
  const { view } = newView();
  await view.setState(...state('a.md'));
  await view.setState(...state(42));
  expect(view.file).toBeNull();
  expect(placeholderText(view)).toBe('No note selected');
});

test('getViewType and getIcon', () => {
  const { view } = newView();
  expect(view.getViewType()).toBe('mind-mapper-view');
  expect(view.getIcon()).toBe('network');
});

test('renders every node of the worked example with one edge per child', async () => {
  const { view, ws } = newView();
  ws.addNote('Worked example.md', 'worked-example');
  await setSize(view, 800, 600);
  await view.setState(...state('Worked example.md'));
  expect(placeholderText(view)).toBeNull();
  const ids = nodeIds(view);
  expect(ids).toEqual(expect.arrayContaining(['Project', 'Project/Tasks', 'Project/Notes']));
  expect(ids.length).toBeGreaterThan(3);
  expect(view.contentEl.querySelectorAll('path.mind-mapper-edge')).toHaveLength(ids.length - 1);
});

test('missing file shows Note not found', async () => {
  const { view } = newView();
  await view.setState(...state('gone/Old.md'));
  expect(placeholderText(view)).toBe('Note not found: gone/Old.md');
  expect(nodeIds(view)).toEqual([]);
});

test('null cache shows Loading and renders on the first changed event for the file', async () => {
  const { view, ws } = newView();
  const fixture = loadFixture('worked-example');
  ws.vault.texts.set('Note.md', fixture.text);
  await setSize(view, 800, 600);
  await view.setState(...state('Note.md'));
  expect(placeholderText(view)).toBe('Loading…');

  ws.metadataCache.caches.set('Other.md', fixture.cache);
  ws.metadataCache.trigger('Other.md', fixture.text, fixture.cache ?? {});
  await vi.waitFor(() => expect(placeholderText(view)).toBe('Loading…'));
  expect(nodeIds(view)).toEqual([]);

  ws.metadataCache.caches.set('Note.md', fixture.cache);
  ws.metadataCache.trigger('Note.md', fixture.text, fixture.cache ?? {});
  await vi.waitFor(() => expect(nodeIds(view)).toContain('Project/Tasks'));
  // one permanent listener: it also drives live update
  expect(ws.metadataCache.listenerCount).toBe(1);
  await view.onClose();
  expect(ws.metadataCache.listenerCount).toBe(0);
});

test('stale load is discarded', async () => {
  const { view, ws } = newView();
  ws.addNote('First.md', 'worked-example');
  ws.addNote('Second.md', 'skipped-levels');
  await setSize(view, 800, 600);
  const release = ws.vault.hold('First.md');
  const first = view.setState(...state('First.md'));
  await view.setState(...state('Second.md'));
  release();
  await first;
  expect(nodeIds(view)[0]).toBe('A');
});

function expectedFit(fixture: string, name: string, width: number, height: number) {
  const { cache, text } = loadFixture(fixture);
  const tree = buildTree(toParserInput(cache, text), name);
  const layout = layoutTree(tree, {
    siblingGap: DEFAULT_SETTINGS.siblingGap,
    levelGap: DEFAULT_SETTINGS.levelGap,
    nodeSize: estimateSize,
  });
  return fitToBounds(
    fitBounds(layout, new Map()),
    { width, height },
    DEFAULT_SETTINGS.fitMaxZoom / 100,
  );
}

test('fit waits for a non-zero size and runs once', async () => {
  const { view, ws } = newView();
  ws.addNote('Big.md', 'no-h1');
  await setSize(view, 0, 0);
  await view.setState(...state('Big.md'));
  expect(view.getTransform()).toEqual(IDENTITY);

  await setSize(view, 800, 600);
  view.onResize();
  expect(view.getTransform()).toEqual(expectedFit('no-h1', 'Big', 800, 600));

  view.setTransform({ x: 5, y: 5, zoom: 1 });
  view.onResize();
  expect(view.getTransform()).toEqual({ x: 5, y: 5, zoom: 1 });
});

test('root-only map renders and fits', async () => {
  const { view, ws } = newView();
  ws.addNote('Empty.md', 'empty');
  await setSize(view, 800, 600);
  await view.setState(...state('Empty.md'));
  expect(nodeIds(view)).toEqual(['']);
  const t = view.getTransform();
  expect(t).toEqual(expectedFit('empty', 'Empty', 800, 600));
  expect(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.zoom)).toBe(true);
});

test('zoom actions change the transform and the controls label', async () => {
  const { view, ws } = newView();
  ws.addNote('Note.md', 'worked-example');
  await setSize(view, 800, 600);
  await view.onOpen();
  await view.setState(...state('Note.md'));
  view.resetZoom();
  expect(view.getTransform().zoom).toBe(1);
  expect(resetLabel(view)).toBe('100%');
  view.zoomIn();
  expect(view.getTransform().zoom).toBe(1.25);
  expect(resetLabel(view)).toBe('125%');
  view.zoomOut();
  view.zoomOut();
  expect(view.getTransform().zoom).toBe(0.75);
  view.fitToView();
  expect(view.getTransform()).toEqual(expectedFit('worked-example', 'Note', 800, 600));
});

test('zoom in / out snap to the next step, centred on the canvas', async () => {
  const { view, ws } = newView();
  ws.addNote('Note.md', 'worked-example');
  await setSize(view, 800, 600);
  await view.setState(...state('Note.md'));
  const center = { x: 400, y: 300 };
  const worldAt = (p: { x: number; y: number }) => {
    const t = view.getTransform();
    return { x: (p.x - t.x) / t.zoom, y: (p.y - t.y) / t.zoom };
  };
  view.zoomTo(1.29);
  expect(view.getTransform().zoom).toBe(1.29);
  expect(resetLabel(view)).toBe('129%');
  const before = worldAt(center);
  view.zoomIn();
  expect(view.getTransform().zoom).toBe(1.5);
  expect(worldAt(center).x).toBeCloseTo(before.x, 9);
  expect(worldAt(center).y).toBeCloseTo(before.y, 9);
  view.zoomTo(1.29);
  view.zoomOut();
  expect(view.getTransform().zoom).toBe(1.25);
  view.zoomTo(4);
  view.zoomIn();
  expect(view.getTransform().zoom).toBe(4);
  view.zoomTo(0.01);
  expect(view.getTransform().zoom).toBe(0.1);
  view.zoomOut();
  expect(view.getTransform().zoom).toBe(0.1);
});

test('the zoom input applies a typed zoom', async () => {
  const { view, ws } = newView();
  ws.addNote('Note.md', 'worked-example');
  await setSize(view, 800, 600);
  await view.setState(...state('Note.md'));
  const input = view.contentEl.querySelector<HTMLInputElement>('.mind-mapper-zoom-input');
  if (!input) throw new Error('no zoom input');
  input.focus();
  input.value = '129';
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  expect(view.getTransform().zoom).toBe(1.29);
  expect(input.value).toBe('129%');
});

test('the default fit cap is 150 %', async () => {
  expect(DEFAULT_SETTINGS.fitMaxZoom).toBe(150);
  const { view, ws } = newView();
  ws.addNote('Small.md', 'empty');
  await setSize(view, 800, 600);
  await view.setState(...state('Small.md'));
  expect(view.getTransform().zoom).toBe(1.5);
});

test.each([
  [800, 600],
  // Narrow: the width limits the fit, the badges on the right decide it.
  [400, 1000],
  [1000, 2400],
])(
  'fit of a collapsed map (%i x %i) keeps every node and badge inside the margin',
  async (width, height) => {
    // Cap 400 %: the size limits the fit, not the cap.
    const ws = new FakeWorkspace();
    const settings = { ...LTR_SETTINGS, fitMaxZoom: 400 };
    const leaf = { app: ws.app, setViewState: vi.fn() };
    const view = new MindMapView(leaf as unknown as WorkspaceLeaf, { settings: () => settings });
    // Collapsed, its badges are the rightmost part of the map.
    ws.addNote('Note.md', 'numbered');
    await setSize(view, width, height);
    await view.setState(...state('Note.md'));
    view.collapseAll();
    view.fitToView();
    expect(view.getTransform().zoom).toBeLessThan(4);
    const t = view.getTransform();
    const margin = fitMargin({ width, height });
    const screen = (r: { x: number; y: number; width: number; height: number }) => ({
      left: r.x * t.zoom + t.x,
      top: r.y * t.zoom + t.y,
      right: (r.x + r.width) * t.zoom + t.x,
      bottom: (r.y + r.height) * t.zoom + t.y,
    });
    const boxes = [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node')].map((el) =>
      nodeBox(view, el.dataset.nodeId ?? ''),
    );
    // Badges (left-to-right: right of the node, 18 px high, about 8 px per digit + 10).
    const toggles = [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-collapse')];
    expect(toggles.some((el) => el.dataset.mmState === 'collapsed')).toBe(true);
    for (const el of toggles) {
      const w = Math.max(18, 10 + 7 * (el.textContent ?? '').length);
      boxes.push({
        x: parseFloat(el.style.left) + 3,
        y: parseFloat(el.style.top) - 9,
        width: w,
        height: 18,
      });
    }
    const all = boxes.map(screen);
    const eps = 1e-6;
    expect(Math.min(...all.map((b) => b.left))).toBeGreaterThanOrEqual(margin - eps);
    expect(Math.min(...all.map((b) => b.top))).toBeGreaterThanOrEqual(margin - eps);
    expect(Math.max(...all.map((b) => b.right))).toBeLessThanOrEqual(width - margin + eps);
    expect(Math.max(...all.map((b) => b.bottom))).toBeLessThanOrEqual(height - margin + eps);
  },
);

describe('fit zoom cap', () => {
  async function openCollapsed(fitMaxZoom: number) {
    const ws = new FakeWorkspace();
    const settings = { ...LTR_SETTINGS, fitMaxZoom };
    const leaf = { app: ws.app, setViewState: vi.fn() };
    const view = new MindMapView(leaf as unknown as WorkspaceLeaf, { settings: () => settings });
    ws.addNote('Note.md', 'worked-example');
    await setSize(view, 800, 600);
    await view.setState(...state('Note.md'));
    return { view, settings };
  }

  test('a small map after Collapse all fits up to the cap', async () => {
    const { view } = await openCollapsed(200);
    const before = view.getTransform().zoom;
    view.collapseAll();
    view.fitToView();
    expect(view.getTransform().zoom).toBe(2);
    expect(view.getTransform().zoom).toBeGreaterThan(before);
    expect(resetLabel(view)).toBe('200%');
  });

  test('the cap 100% never zooms above 1', async () => {
    const { view } = await openCollapsed(100);
    view.collapseAll();
    view.fitToView();
    expect(view.getTransform().zoom).toBe(1);
  });

  test('a changed setting is used by the next fit', async () => {
    const { view, settings } = await openCollapsed(200);
    view.collapseAll();
    settings.fitMaxZoom = 300;
    view.fitToView();
    // The collapsed map is limited by its size here (about 2.29), not by the cap.
    expect(view.getTransform().zoom).toBeGreaterThan(2.2);
    expect(view.getTransform().zoom).toBeLessThanOrEqual(3);
  });
});

test('fit and zoom center use the canvas size, not the view padding box', async () => {
  const { view, ws } = newView();
  ws.addNote('Note.md', 'worked-example');
  await setSize(view, 800, 600);
  setElSize(view.contentEl, 1000, 900);
  await view.setState(...state('Note.md'));
  expect(view.getTransform()).toEqual(expectedFit('worked-example', 'Note', 800, 600));
});

test('node content is rendered by Obsidian with the pinned file as source path', async () => {
  const spy = vi.spyOn(MarkdownRenderer, 'render');
  const { view, ws } = newView();
  ws.addNote('Note.md', 'worked-example');
  await setSize(view, 800, 600);
  await view.setState(...state('Note.md'));
  expect(spy).toHaveBeenCalledWith(
    ws.app,
    'Intro paragraph.',
    expect.any(HTMLElement),
    'Note.md',
    expect.anything(),
  );
  spy.mockRestore();
});

test('expand opens the full content modal for that node', async () => {
  const { view, ws } = newView();
  ws.addNote('Note.md', 'worked-example');
  await setSize(view, 800, 600);
  await view.setState(...state('Note.md'));
  const button = view.contentEl.querySelector<HTMLElement>(
    '[data-node-id="Project/#1"] .mind-mapper-node-expand',
  );
  button?.click();
  expect(MockModal.lastOpened).toBeInstanceOf(NodeContentModal);
  await vi.waitFor(() =>
    expect(MockModal.lastOpened?.contentEl.textContent).toBe('Intro paragraph.'),
  );
});

test('closing the view releases all node components', async () => {
  const components: MockComponent[] = [];
  const spy = vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_a, _m, _el, _p, c) => {
    components.push(c as unknown as MockComponent);
    return Promise.resolve();
  });
  const { view, ws } = newView();
  ws.addNote('Note.md', 'worked-example');
  await setSize(view, 800, 600);
  await view.setState(...state('Note.md'));
  expect(components.length).toBeGreaterThan(0);
  await view.onClose();
  expect(components.some((c) => c.loaded)).toBe(false);
  spy.mockRestore();
});

interface FakeObserverClass {
  instances: { observed: Set<Element>; connected: boolean }[];
  trigger(elements?: Element[]): void;
}
const FakeRO = (globalThis as unknown as { FakeResizeObserver: FakeObserverClass })
  .FakeResizeObserver;

function contentOf(view: MindMapView, id: string): HTMLElement {
  const el = view.contentEl.querySelector<HTMLElement>(
    `[data-node-id="${id}"] .mind-mapper-node-content`,
  );
  if (!el) throw new Error(`no content for ${id}`);
  return el;
}

function nodeBox(view: MindMapView, id: string) {
  const el = view.contentEl.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
  return {
    x: parseFloat(el?.style.left ?? ''),
    y: parseFloat(el?.style.top ?? ''),
    width: parseFloat(el?.style.width ?? ''),
    height: parseFloat(el?.style.height ?? ''),
  };
}

/** Pretends the rendered content of `id` has this natural size. */
function report(view: MindMapView, id: string, width: number, height: number): void {
  const el = contentOf(view, id);
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

async function openWorked(): Promise<{ view: MindMapView; ws: FakeWorkspace }> {
  const { view, ws } = newView();
  ws.addNote('Note.md', 'worked-example');
  await setSize(view, 800, 600);
  await view.setState(...state('Note.md'));
  return { view, ws };
}

describe('measuring', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('first layout uses estimated sizes', async () => {
    const { view } = await openWorked();
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 16 * 8 + 18, height: 38 });
  });

  test('a measured size change re-layouts once after 100 ms and keeps the anchor in place', async () => {
    const { view } = await openWorked();
    // put Project/Tasks exactly at the viewport center, so it is the anchor
    const tasks = nodeBox(view, 'Project/Tasks');
    view.setTransform({
      x: 400 - tasks.x - tasks.width / 2,
      y: 300 - tasks.y - tasks.height / 2,
      zoom: 1,
    });
    const t0 = view.getTransform();
    const screenBefore = { x: tasks.x + t0.x, y: tasks.y + t0.y };
    report(view, 'Project/#1', 300, 200);
    report(view, 'Project/Tasks/#1', 250, 90);
    expect(nodeBox(view, 'Project/#1').height).toBe(38);
    await vi.advanceTimersByTimeAsync(99);
    expect(nodeBox(view, 'Project/#1').height).toBe(38);
    await vi.advanceTimersByTimeAsync(1);
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 318, height: 214 });
    const after = nodeBox(view, 'Project/Tasks');
    expect(after.y).not.toBe(tasks.y);
    const t = view.getTransform();
    expect(after.x * t.zoom + t.x).toBeCloseTo(screenBefore.x);
    expect(after.y * t.zoom + t.y).toBeCloseTo(screenBefore.y);
  });

  test('without user interaction the re-layout fits again', async () => {
    const { view } = await openWorked();
    const fittedBefore = view.getTransform();
    // tall leaves: the map no longer fits at zoom 1
    for (const id of ['Project/#1', 'Project/Tasks/#1', 'Project/Tasks/#2', 'Project/Notes/#1']) {
      report(view, id, 300, 228);
    }
    await vi.advanceTimersByTimeAsync(100);
    const boxes = [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node')].map((el) =>
      nodeBox(view, el.dataset.nodeId ?? ''),
    );
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const bounds = {
      x: minX,
      y: minY,
      width: Math.max(...boxes.map((b) => b.x + b.width)) - minX,
      height: Math.max(...boxes.map((b) => b.y + b.height)) - minY,
    };
    expect(view.getTransform()).toEqual(
      fitToBounds(bounds, { width: 800, height: 600 }, DEFAULT_SETTINGS.fitMaxZoom / 100),
    );
    expect(view.getTransform()).not.toEqual(fittedBefore);
  });

  test('clipped content marks the node and keeps the max size', async () => {
    const { view } = await openWorked();
    report(view, 'Project/#1', 900, 900);
    await vi.advanceTimersByTimeAsync(100);
    const el = view.contentEl.querySelector('[data-node-id="Project/#1"]');
    expect(el?.classList.contains('is-clipped')).toBe(true);
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 320, height: 240 });
  });

  test('css-change re-measures all nodes', async () => {
    const { view, ws } = await openWorked();
    const el = contentOf(view, 'Project/#1');
    for (const [key, value] of [
      ['offsetWidth', 200],
      ['scrollWidth', 200],
      ['offsetHeight', 100],
      ['scrollHeight', 100],
    ] as const) {
      Object.defineProperty(el, key, { configurable: true, value });
    }
    ws.trigger('css-change');
    await vi.advanceTimersByTimeAsync(100);
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 218, height: 114 });
  });

  test('measured sizes are reused when the same markdown is shown again', async () => {
    const { view, ws } = await openWorked();
    report(view, 'Project/#1', 280, 50);
    await vi.advanceTimersByTimeAsync(100);
    ws.addNote('Other.md', 'skipped-levels');
    await view.setState(...state('Other.md'));
    await view.setState(...state('Note.md'));
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 298, height: 64 });
  });

  test('a hidden tab (0 x 0 reports) changes neither sizes nor the transform', async () => {
    const { view } = await openWorked();
    view.setTransform({ x: -60, y: 311, zoom: 1 });
    const before = nodeBox(view, 'Project/#1');
    setElSize(view.contentEl.querySelector('.mind-mapper-canvas'), 0, 0);
    for (const id of ['Project', 'Project/#1', 'Project/Tasks', 'Project/Tasks/#1']) {
      report(view, id, 0, 0);
    }
    await vi.advanceTimersByTimeAsync(200);
    expect(nodeBox(view, 'Project/#1')).toEqual(before);
    expect(view.getTransform()).toEqual({ x: -60, y: 311, zoom: 1 });
  });

  test('a 0 x 0 report of a visible map is ignored (element not rendered yet)', async () => {
    const { view } = await openWorked();
    const before = nodeBox(view, 'Project/#1');
    report(view, 'Project/#1', 0, 0);
    await vi.advanceTimersByTimeAsync(200);
    expect(nodeBox(view, 'Project/#1')).toEqual(before);
  });

  test('a re-layout due while the tab is hidden waits for the next resize', async () => {
    const { view } = await openWorked();
    view.setTransform({ x: 10, y: 300, zoom: 1 });
    report(view, 'Project/#1', 300, 200);
    const canvas = view.contentEl.querySelector('.mind-mapper-canvas');
    setElSize(canvas, 0, 0);
    await vi.advanceTimersByTimeAsync(200);
    expect(nodeBox(view, 'Project/#1').height).toBe(38);
    expect(view.getTransform()).toEqual({ x: 10, y: 300, zoom: 1 });
    setElSize(canvas, 800, 600);
    view.onResize();
    expect(nodeBox(view, 'Project/#1').height).toBe(214);
  });

  test('onClose disconnects the observer and cancels a pending re-layout', async () => {
    const { view } = await openWorked();
    report(view, 'Project/#1', 300, 200);
    const content = contentOf(view, 'Project/#1');
    const observers = FakeRO.instances.filter((o) => o.observed.has(content));
    expect(observers).toHaveLength(1);
    await view.onClose();
    expect(observers.every((o) => !o.connected)).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(view.contentEl.querySelectorAll('.mind-mapper-node')).toHaveLength(0);
  });
});

function change(ws: FakeWorkspace, path: string, fixtureName: string): void {
  const { text, cache } = loadFixture(fixtureName);
  ws.metadataCache.caches.set(path, cache);
  ws.metadataCache.trigger(path, text, cache ?? {});
}

async function openLive(): Promise<{ view: MindMapView; ws: FakeWorkspace }> {
  const { view, ws } = newView();
  ws.addNote('Live.md', 'live-before');
  await setSize(view, 800, 600);
  await view.setState(...state('Live.md'));
  return { view, ws };
}

/** Puts the node at the viewport center (800 x 600 canvas), so it is the anchor. */
function centerOn(view: MindMapView, id: string): { x: number; y: number } {
  const box = nodeBox(view, id);
  view.setTransform({ x: 400 - box.x - box.width / 2, y: 300 - box.y - box.height / 2, zoom: 1 });
  return screenOf(view, id);
}

function screenOf(view: MindMapView, id: string): { x: number; y: number } {
  const box = nodeBox(view, id);
  const t = view.getTransform();
  return { x: box.x * t.zoom + t.x, y: box.y * t.zoom + t.y };
}

describe('live update', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('a change of the pinned note re-renders after 300 ms, not before', async () => {
    const { view, ws } = await openLive();
    expect(nodeIds(view)).not.toContain('Live/#2');
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(299);
    expect(nodeIds(view)).not.toContain('Live/#2');
    await vi.advanceTimersByTimeAsync(1);
    expect(nodeIds(view)).toContain('Live/#2');
    expect(contentOf(view, 'Live/#1').textContent).toBe('New first paragraph.');
  });

  test('rapid changes every 100 ms for 2 s give one update with the last text', async () => {
    const { view, ws } = await openLive();
    const render = vi.spyOn(MarkdownRenderer, 'render');
    render.mockClear();
    for (let i = 0; i < 20; i++) {
      change(ws, 'Live.md', i % 2 === 0 ? 'live-renamed' : 'live-after');
      await vi.advanceTimersByTimeAsync(100);
    }
    // last change (i = 19) was live-after, 100 ms ago
    expect(nodeIds(view)).not.toContain('Live/#2');
    expect(render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(nodeIds(view)).toContain('Live/#2');
    expect(nodeIds(view)).toContain('Live/Beta');
    expect(nodeIds(view)).not.toContain('Live/Gamma');
    // only the new paragraph is rendered; "Alpha paragraph." moved from Live/#1 to Live/#2 unrendered
    expect(render.mock.calls.map((call) => call[1])).toEqual(['New first paragraph.']);
    render.mockRestore();
  });

  test('changes of other files are ignored', async () => {
    const { view, ws } = await openLive();
    change(ws, 'Other.md', 'live-after');
    await vi.advanceTimersByTimeAsync(1000);
    expect(nodeIds(view)).not.toContain('Live/#2');
  });

  test('live update keeps the node nearest the center in place and does not re-fit', async () => {
    const { view, ws } = await openLive();
    const before = centerOn(view, 'Live/Beta');
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(300);
    expect(nodeIds(view)).toContain('Live/#2');
    const after = screenOf(view, 'Live/Beta');
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test('a fitted map is not re-fitted by a live update', async () => {
    const { view, ws } = await openLive();
    const before = screenOf(view, 'Live');
    const zoom = view.getTransform().zoom;
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(300);
    // a later re-measure must not fit either: the live update ended the automatic fit
    report(view, 'Live/#1', 300, 200);
    await vi.advanceTimersByTimeAsync(100);
    expect(view.getTransform().zoom).toBe(zoom);
    expect(screenOf(view, 'Live').x).toBeCloseTo(before.x, 1);
  });

  test('a loading view renders on the first changed event without debounce', async () => {
    const { view, ws } = newView();
    const { text } = loadFixture('live-before');
    ws.vault.texts.set('Live.md', text);
    await setSize(view, 800, 600);
    await view.setState(...state('Live.md'));
    expect(placeholderText(view)).toBe('Loading…');
    change(ws, 'Live.md', 'live-before');
    await vi.advanceTimersByTimeAsync(0);
    expect(nodeIds(view)).toContain('Live/Beta');
  });

  test('cachedRead rejection shows "Could not read note"', async () => {
    const { view, ws } = newView();
    ws.addNote('Live.md', 'live-before');
    vi.spyOn(ws.vault, 'cachedRead').mockRejectedValue(new Error('disk'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await view.onOpen();
    await view.setState(...state('Live.md'));
    expect(placeholderText(view)).toBe('Could not read note');
    error.mockRestore();
  });
});

function toggleOf(view: MindMapView, id: string): HTMLElement {
  const el = view.contentEl.querySelector<HTMLElement>(
    `.mind-mapper-collapse[data-node-id="${id}"]`,
  );
  if (!el) throw new Error(`no toggle for ${id}`);
  return el;
}

function selectedIds(view: MindMapView): (string | undefined)[] {
  return [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node.is-selected')].map(
    (el) => el.dataset.nodeId,
  );
}

describe('collapse and selection', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('toggling a node hides its subtree and keeps the toggled node in place on screen', async () => {
    const { view } = await openWorked();
    view.setTransform({ x: 37, y: 250, zoom: 1 });
    const before = screenOf(view, 'Project/Tasks');
    toggleOf(view, 'Project/Tasks').click();
    expect(nodeIds(view)).not.toContain('Project/Tasks/#1');
    expect(nodeIds(view)).toContain('Project/Notes/#1');
    expect(toggleOf(view, 'Project/Tasks').textContent).toBe('2');
    const after = screenOf(view, 'Project/Tasks');
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
    toggleOf(view, 'Project/Tasks').click();
    expect(nodeIds(view)).toContain('Project/Tasks/#1');
  });

  test('collapseAll shows root and first level; expandAll shows all', async () => {
    const { view } = await openWorked();
    view.collapseAll();
    expect(nodeIds(view).sort()).toEqual(
      ['Project', 'Project/#1', 'Project/Notes', 'Project/Tasks'].sort(),
    );
    view.expandAll();
    expect(nodeIds(view)).toHaveLength(7);
  });

  test('toggle data-mm-state follows toggle, collapse all, expand all and a live edit', async () => {
    const { view, ws } = await openLive();
    const states = (): Record<string, [string | null, string | null]> =>
      Object.fromEntries(
        [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-collapse')].map((el) => [
          el.dataset.nodeId ?? '',
          [el.getAttribute('data-mm-id'), el.getAttribute('data-mm-state')],
        ]),
      );
    const all = (state: string) =>
      Object.values(states()).every(([id, s]) => id === 'node.toggle' && s === state);
    expect(Object.keys(states()).length).toBeGreaterThan(0);
    expect(all('expanded')).toBe(true);
    view.toggleCollapse('Live/Beta');
    expect(states()['Live/Beta']).toEqual(['node.toggle', 'collapsed']);
    view.expandAll();
    expect(all('expanded')).toBe(true);
    view.collapseAll();
    expect(Object.values(states()).some(([, s]) => s === 'collapsed')).toBe(true);
    expect(Object.values(states()).every(([id]) => id === 'node.toggle')).toBe(true);
    view.expandAll();
    view.toggleCollapse('Live/Beta');
    view.toggleCollapse('Live/Delta');
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(300);
    expect(states()['Live/Beta']).toEqual(['node.toggle', 'collapsed']);
    expect(states()['Live/Delta']).toEqual(['node.toggle', 'collapsed']);
    view.toggleCollapse('Live/Beta');
    expect(states()['Live/Beta']).toEqual(['node.toggle', 'expanded']);
  });

  test('collapse state survives a live update; a renamed collapsed heading loses it, its unchanged sibling keeps it', async () => {
    const { view, ws } = await openLive();
    view.toggleCollapse('Live/Beta');
    view.toggleCollapse('Live/Delta');
    expect(nodeIds(view)).not.toContain('Live/Delta/#1');
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(300);
    expect(nodeIds(view)).not.toContain('Live/Beta/#1');
    expect(nodeIds(view)).not.toContain('Live/Delta/#1');
    change(ws, 'Live.md', 'live-renamed');
    await vi.advanceTimersByTimeAsync(300);
    expect(nodeIds(view)).toContain('Live/Gamma/#1');
    expect(nodeIds(view)).not.toContain('Live/Delta/#1');
  });

  test('after collapse all, a branch with a new id (moved or renamed) stays collapsed', async () => {
    const { view, ws } = await openLive();
    view.collapseAll();
    change(ws, 'Live.md', 'live-renamed');
    await vi.advanceTimersByTimeAsync(300);
    expect(nodeIds(view)).toContain('Live/Gamma');
    expect(nodeIds(view)).not.toContain('Live/Gamma/#1');
    expect(nodeIds(view)).not.toContain('Live/Delta/#1');
  });

  test('after collapse all, a branch expanded by hand stays expanded across a live edit', async () => {
    const { view, ws } = await openLive();
    view.collapseAll();
    view.toggleCollapse('Live/Delta');
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(300);
    expect(nodeIds(view)).toContain('Live/Delta/#1');
    expect(nodeIds(view)).not.toContain('Live/Beta/#1');
  });

  test('after collapse all, a deleted and recreated note stays collapsed', async () => {
    const { view, ws } = await openWorked();
    view.collapseAll();
    ws.vault.texts.delete('Note.md');
    ws.vault.trigger('delete', fakeFile('Note.md'));
    ws.addNote('Note.md', 'worked-example');
    ws.vault.trigger('create', fakeFile('Note.md'));
    await vi.advanceTimersByTimeAsync(0);
    expect(nodeIds(view)).toContain('Project/Tasks');
    expect(nodeIds(view)).not.toContain('Project/Tasks/#1');
  });

  test('switching the view to another note resets the collapse state', async () => {
    const { view, ws } = await openWorked();
    view.collapseAll();
    ws.addNote('Live.md', 'live-before');
    await view.setState(...state('Live.md'));
    expect(nodeIds(view)).toContain('Live/Beta/#1');
    change(ws, 'Live.md', 'live-renamed');
    await vi.advanceTimersByTimeAsync(300);
    expect(nodeIds(view)).toContain('Live/Gamma/#1');
  });

  test('the collapse button follows the collapse state', async () => {
    const { view } = await openWorked();
    const button = () =>
      view.contentEl.querySelector<HTMLElement>('.mind-mapper-controls button:nth-child(5)');
    expect(button()?.getAttribute('aria-label')).toBe('Collapse all');
    button()?.click();
    expect(nodeIds(view)).not.toContain('Project/Tasks/#1');
    expect(button()?.getAttribute('aria-label')).toBe('Expand all');
    button()?.click();
    expect(nodeIds(view)).toContain('Project/Tasks/#1');
    expect(button()?.getAttribute('aria-label')).toBe('Collapse all');
    view.toggleCollapse('Project/Notes');
    expect(button()?.getAttribute('aria-label')).toBe('Expand all');
  });

  test('click selects a node; the selection survives a live update and stays in place', async () => {
    const { view, ws } = await openLive();
    view.setTransform({ x: 20, y: 280, zoom: 1 });
    contentOf(view, 'Live/Delta').click();
    expect(view.selectedId).toBe('Live/Delta');
    expect(selectedIds(view)).toEqual(['Live/Delta']);
    const before = screenOf(view, 'Live/Delta');
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(300);
    expect(selectedIds(view)).toEqual(['Live/Delta']);
    const after = screenOf(view, 'Live/Delta');
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test('the selection is cleared when its node disappears', async () => {
    const { view, ws } = await openLive();
    contentOf(view, 'Live/Beta').click();
    change(ws, 'Live.md', 'live-renamed');
    await vi.advanceTimersByTimeAsync(300);
    expect(view.selectedId).toBeNull();
    expect(selectedIds(view)).toEqual([]);
  });

  test('a tap on the empty canvas clears the selection', async () => {
    const { view } = await openLive();
    contentOf(view, 'Live/Beta').click();
    const canvas = view.contentEl.querySelector<HTMLElement>('.mind-mapper-canvas');
    for (const type of ['pointerdown', 'pointerup']) {
      canvas?.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          buttons: type === 'pointerdown' ? 1 : 0,
          clientX: 5,
          clientY: 5,
          pointerId: 1,
        }),
      );
    }
    expect(view.selectedId).toBeNull();
  });
});

/** A cache the parser cannot read (a section without position): parsing throws. */
function breakNote(ws: FakeWorkspace, path: string): void {
  const { text, cache } = loadFixture('live-after');
  const broken = { ...cache, sections: [{ type: 'paragraph' }] } as unknown as CachedMetadata;
  ws.metadataCache.caches.set(path, broken);
  ws.metadataCache.trigger(path, text, broken);
}

function updateErrorText(view: MindMapView): string | null {
  const el = view.contentEl.querySelector<HTMLElement>('[data-mm-id="map.update-error"]');
  return el && !el.hidden ? el.textContent : null;
}

describe('a failing update', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('a live update that cannot be parsed keeps the last map with a notice; the next good one clears it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { view, ws } = await openLive();
    const before = nodeIds(view);
    expect(updateErrorText(view)).toBeNull();
    breakNote(ws, 'Live.md');
    await vi.advanceTimersByTimeAsync(300);
    expect(nodeIds(view)).toEqual(before);
    expect(updateErrorText(view)).toBe('Could not update the map. Showing the last version.');
    expect(error).toHaveBeenCalledWith(
      'Mind Mapper: could not update the map',
      'Live.md',
      expect.any(TypeError),
    );
    // The last map keeps working (it re-lays out from the last good tree).
    view.collapseAll();
    view.expandAll();
    expect(nodeIds(view).sort()).toEqual([...before].sort());
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(300);
    expect(nodeIds(view)).toContain('Live/#2');
    expect(updateErrorText(view)).toBeNull();
  });

  test('another note that cannot be parsed in the same tab shows the message, not the old map', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { view, ws } = await openLive();
    const { text, cache } = loadFixture('live-before');
    ws.vault.texts.set('Other.md', text);
    ws.metadataCache.caches.set('Other.md', {
      ...cache,
      sections: [{ type: 'paragraph' }],
    } as unknown as CachedMetadata);
    await view.setState(...state('Other.md'));
    expect(placeholderText(view)).toBe('Could not show the note');
    expect(updateErrorText(view)).toBeNull();
  });

  test('a note that cannot be parsed on opening shows a placeholder message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { view, ws } = newView();
    ws.addNote('Live.md', 'live-before');
    const { text, cache } = loadFixture('live-before');
    ws.vault.texts.set('Live.md', text);
    ws.metadataCache.caches.set('Live.md', {
      ...cache,
      sections: [{ type: 'paragraph' }],
    } as unknown as CachedMetadata);
    await setSize(view, 800, 600);
    await view.setState(...state('Live.md'));
    expect(placeholderText(view)).toBe('Could not show the note');
    expect(nodeIds(view)).toEqual([]);
  });
});

function hintText(view: MindMapView): string | null {
  const el = view.contentEl.querySelector<HTMLElement>('.mind-mapper-hint');
  return el && !el.hidden ? el.textContent : null;
}

/** Moves the note in the fake vault and fires the vault rename event. */
function rename(ws: FakeWorkspace, from: string, to: string, fixtureName: string): void {
  ws.vault.texts.delete(from);
  ws.metadataCache.caches.delete(from);
  ws.addNote(to, fixtureName);
  ws.vault.trigger('rename', fakeFile(to), from);
}

describe('rename, delete, empty note', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('renaming the pinned note updates file and title without re-fit', async () => {
    const { view, ws } = await openWorked();
    view.setTransform({ x: -60, y: 311, zoom: 0.8 });
    const setViewState = vi.spyOn(view.leaf, 'setViewState');
    rename(ws, 'Note.md', 'Folder/Renamed.md', 'worked-example');
    await vi.advanceTimersByTimeAsync(0);
    expect(view.file).toBe('Folder/Renamed.md');
    expect(view.getDisplayText()).toBe('Renamed');
    expect(headerTitle(view)).toBe('Renamed');
    expect(setViewState).toHaveBeenCalledWith({
      type: 'mind-mapper-view',
      state: { file: 'Folder/Renamed.md', layout: null, theme: null, drill: [] },
    });
    expect(view.getTransform()).toEqual({ x: -60, y: 311, zoom: 0.8 });
    expect(nodeIds(view)).toContain('Project/Tasks');
  });

  test('renaming another note changes nothing', async () => {
    const { view, ws } = await openWorked();
    ws.addNote('Other.md', 'live-before');
    rename(ws, 'Other.md', 'Other2.md', 'live-before');
    await vi.advanceTimersByTimeAsync(0);
    expect(view.file).toBe('Note.md');
  });

  test('rename while hidden (0 x 0 canvas), then shown: title updated, transform unchanged', async () => {
    const { view, ws } = await openWorked();
    view.setTransform({ x: 15, y: 290, zoom: 1 });
    const canvas = view.contentEl.querySelector('.mind-mapper-canvas');
    setElSize(canvas, 0, 0);
    rename(ws, 'Note.md', 'Renamed.md', 'worked-example');
    await vi.advanceTimersByTimeAsync(0);
    setElSize(canvas, 800, 600);
    view.onResize();
    await vi.advanceTimersByTimeAsync(200);
    expect(view.getDisplayText()).toBe('Renamed');
    expect(view.getTransform()).toEqual({ x: 15, y: 290, zoom: 1 });
  });

  test('deleting the pinned note shows "Note was deleted"; recreating it renders again', async () => {
    const { view, ws } = await openWorked();
    ws.vault.texts.delete('Note.md');
    ws.vault.trigger('delete', fakeFile('Note.md'));
    expect(placeholderText(view)).toBe('Note was deleted');
    ws.vault.trigger('delete', fakeFile('Other.md'));
    expect(placeholderText(view)).toBe('Note was deleted');
    ws.addNote('Note.md', 'worked-example');
    ws.vault.trigger('create', fakeFile('Note.md'));
    await vi.advanceTimersByTimeAsync(0);
    expect(placeholderText(view)).toBeNull();
    expect(nodeIds(view)).toContain('Project/Tasks');
  });

  test('an empty note shows the root and the hint; adding content removes the hint', async () => {
    const { view, ws } = newView();
    ws.addNote('Empty.md', 'empty');
    await setSize(view, 800, 600);
    await view.setState(...state('Empty.md'));
    expect(nodeIds(view)).toEqual(['']);
    expect(hintText(view)).toBe('This note has no content yet');
    change(ws, 'Empty.md', 'live-before');
    await vi.advanceTimersByTimeAsync(300);
    expect(hintText(view)).toBeNull();
  });

  test('a note with only frontmatter shows the hint', async () => {
    const { view, ws } = newView();
    ws.addNote('Fm.md', 'frontmatter-only');
    await setSize(view, 800, 600);
    await view.setState(...state('Fm.md'));
    expect(hintText(view)).toBe('This note has no content yet');
  });

  test('closing the view removes the vault listeners', async () => {
    const { view, ws } = await openWorked();
    expect(ws.vault.listenerCount('rename')).toBe(1);
    await view.onClose();
    expect(ws.vault.listenerCount('rename')).toBe(0);
    expect(ws.vault.listenerCount('delete')).toBe(0);
    expect(ws.vault.listenerCount('create')).toBe(0);
  });
});

describe('re-layouts of a hidden or reloaded map', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('a live update while the tab is hidden keeps the centered node in place', async () => {
    const { view, ws } = await openLive();
    const before = centerOn(view, 'Live/Delta');
    const canvas = view.contentEl.querySelector('.mind-mapper-canvas');
    setElSize(canvas, 0, 0);
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(300);
    setElSize(canvas, 800, 600);
    view.onResize();
    await vi.advanceTimersByTimeAsync(200);
    expect(nodeIds(view)).toContain('Live/#2');
    const after = screenOf(view, 'Live/Delta');
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test('renaming a note without H1 (root = file name) keeps the other nodes in place', async () => {
    const { view, ws } = newView();
    ws.addNote('A.md', 'no-h1');
    await setSize(view, 800, 600);
    await view.setState(...state('A.md'));
    const child = nodeIds(view).find((id) => id !== '') ?? '';
    view.setTransform({ x: 30, y: 280, zoom: 1 });
    const rootWidth = nodeBox(view, '').width;
    const before = screenOf(view, child);
    rename(ws, 'A.md', 'A much longer file name.md', 'no-h1');
    await vi.advanceTimersByTimeAsync(0);
    expect(nodeBox(view, '').width).toBeGreaterThan(rootWidth);
    const after = screenOf(view, child);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });
});

function centerX(view: MindMapView, id: string): number {
  const box = nodeBox(view, id);
  return box.x + box.width / 2;
}

async function openWith(
  fixtureName: string,
  services: Partial<ViewServices>,
): Promise<{ view: MindMapView; ws: FakeWorkspace }> {
  const ws = new FakeWorkspace();
  const leaf = { app: ws.app, setViewState: vi.fn(() => Promise.resolve()) };
  const view = new MindMapView(leaf as unknown as WorkspaceLeaf, services);
  ws.addNote('Note.md', fixtureName);
  await setSize(view, 800, 600);
  await view.setState(...state('Note.md'));
  return { view, ws };
}

describe('kanban (issue #32)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const P = 'Product launch';
  const COLUMNS = [`${P}/To do`, `${P}/Doing`, `${P}/Done`] as const;

  function shownIds(view: MindMapView): string[] {
    return [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node')].map(
      (el) => el.dataset.nodeId ?? '',
    );
  }

  function counts(view: MindMapView): Record<string, string | null> {
    return Object.fromEntries(
      [...view.contentEl.querySelectorAll<HTMLElement>('[data-mm-id="node.card-count"]')].map(
        (el): [string, string | null] => [
          el.closest<HTMLElement>('.mind-mapper-node')?.dataset.nodeId ?? '',
          el.textContent,
        ],
      ),
    );
  }

  const count = (view: MindMapView, selector: string) =>
    view.contentEl.querySelectorAll(selector).length;

  test('frontmatter kanban: headline above equal columns, card counts, no lines, no toggles', async () => {
    const { view } = await openWith('kanban', {});
    const root = nodeBox(view, P);
    const columns = COLUMNS.map((id) => nodeBox(view, id));
    for (const column of columns) {
      expect(column.y).toBeGreaterThan(root.y + root.height);
      expect(column.y).toBe(columns[0]?.y);
      expect(column.width).toBe(columns[0]?.width);
    }
    const left = columns[0]?.x ?? 0;
    const last = columns[2] ?? root;
    expect(root.x + root.width / 2).toBeCloseTo((left + last.x + last.width) / 2);
    // Cards below their header, subtasks indented below their card.
    const card = nodeBox(view, `${P}/To do/#1`);
    const subtask = nodeBox(view, `${P}/To do/#1/#1`);
    expect(card.x).toBe(columns[0]?.x);
    expect(card.y).toBeGreaterThan((columns[0]?.y ?? 0) + (columns[0]?.height ?? 0));
    expect(subtask.x).toBeGreaterThan(card.x);
    expect(subtask.y).toBeGreaterThan(card.y + card.height);
    expect(counts(view)).toEqual({ [COLUMNS[0]]: '3', [COLUMNS[1]]: '3', [COLUMNS[2]]: '2' });
    expect(count(view, '.mind-mapper-edge')).toBe(0);
    expect(count(view, '[data-mm-id="node.toggle"]')).toBe(0);
    // Between two columns, between two subtasks, between two cards.
    expect(count(view, '.mind-mapper-divider')).toBe(3);
    // The link line stays.
    expect(count(view, '.mind-mapper-crosslink')).toBe(1);
  });

  test('Collapse all leaves the headline and the column headers with their counts', async () => {
    const { view } = await openWith('kanban', {});
    view.collapseAll();
    expect(shownIds(view)).toEqual([P, ...COLUMNS]);
    expect(counts(view)).toEqual({ [COLUMNS[0]]: '3', [COLUMNS[1]]: '3', [COLUMNS[2]]: '2' });
    expect(count(view, '[data-mm-id="node.toggle"]')).toBe(0);
    expect(count(view, '.mind-mapper-divider')).toBe(1);
    view.expandAll();
    expect(shownIds(view)).toHaveLength(16);
  });

  test('a collapse state from another layout stays in effect', async () => {
    const { view } = await openWith('kanban', {});
    view.chooseLayout('left-to-right');
    await vi.advanceTimersByTimeAsync(20);
    view.toggleCollapse(COLUMNS[0]);
    view.chooseLayout('kanban');
    await vi.advanceTimersByTimeAsync(20);
    expect(shownIds(view).filter((id) => id.startsWith(`${COLUMNS[0]}/`))).toEqual([]);
    expect(shownIds(view)).toContain(`${P}/Doing/Website redesign`);
    expect(counts(view)[COLUMNS[0]]).toBe('3');
  });

  test('the column width is capped at the max node width', async () => {
    const settings = { ...DEFAULT_SETTINGS, maxNodeWidth: 160 };
    const { view } = await openWith('kanban', { settings: () => settings });
    for (const id of COLUMNS) expect(nodeBox(view, id).width).toBe(160);
  });

  test('drilled in, the centre is the headline and its children the columns', async () => {
    const { view } = await openWith('kanban', {});
    view.select(COLUMNS[1]);
    view.drillDown();
    await vi.advanceTimersByTimeAsync(1000);
    const centre = nodeBox(view, COLUMNS[1]);
    const columns = ['Website redesign', 'Beta feedback', 'Customer interviews'].map((name) =>
      nodeBox(view, `${COLUMNS[1]}/${name}`),
    );
    for (const column of columns) {
      expect(column.y).toBe(columns[0]?.y);
      expect(column.y).toBeGreaterThan(centre.y + centre.height);
    }
    expect(counts(view)).toEqual({
      [`${COLUMNS[1]}/Website redesign`]: '2',
      [`${COLUMNS[1]}/Beta feedback`]: '0',
      [`${COLUMNS[1]}/Customer interviews`]: '0',
    });
  });
});

describe('layouts, frontmatter and settings', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('default layout is circle-clockwise: first-level branches on both sides of the root', async () => {
    const { view } = await openWith('worked-example', {});
    const root = centerX(view, 'Project');
    // three branches: two right (#1, Tasks), one left (Notes)
    expect(centerX(view, 'Project/#1')).toBeGreaterThan(root);
    expect(centerX(view, 'Project/Tasks')).toBeGreaterThan(root);
    expect(centerX(view, 'Project/Notes')).toBeLessThan(root);
    expect(centerX(view, 'Project/Notes/#1')).toBeLessThan(centerX(view, 'Project/Notes'));
  });

  test('frontmatter mind-mapper-layout top-to-bottom puts all children below the root', async () => {
    const { view } = await openWith('fm-layout', {});
    const root = nodeBox(view, 'Root');
    for (const id of ['Root/A', 'Root/B', 'Root/A/#1']) {
      expect(nodeBox(view, id).y).toBeGreaterThan(root.y + root.height);
    }
  });

  test('node text is aligned towards the parent; the root centred, or towards its branches', async () => {
    const settings = { ...DEFAULT_SETTINGS };
    const { view, ws } = await openWith('worked-example', { settings: () => settings });
    const align = (id: string) => {
      const el = view.contentEl.querySelector(`.mind-mapper-node[data-node-id="${id}"]`);
      return [...(el?.classList ?? [])].filter((c) => c.startsWith('is-align-')).join(' ');
    };
    const aligns = () =>
      ['Project', 'Project/Tasks', 'Project/Tasks/#1', 'Project/Notes'].map(align);
    // balanced: Tasks on the right, Notes on the left
    expect(aligns()).toEqual([
      'is-align-center',
      'is-align-left',
      'is-align-left',
      'is-align-right',
    ]);
    // the control-bar switcher
    view.chooseLayout('left-to-right');
    await vi.advanceTimersByTimeAsync(20);
    expect(aligns()).toEqual(['is-align-right', 'is-align-left', 'is-align-left', 'is-align-left']);
    view.chooseLayout('right-to-left');
    await vi.advanceTimersByTimeAsync(20);
    expect(aligns()).toEqual([
      'is-align-left',
      'is-align-right',
      'is-align-right',
      'is-align-right',
    ]);
    // the setting
    view.chooseLayout(null);
    settings.defaultLayout = 'bottom-to-top';
    view.refresh();
    await vi.advanceTimersByTimeAsync(20);
    expect(aligns()).toEqual([
      'is-align-center',
      'is-align-center',
      'is-align-center',
      'is-align-center',
    ]);
    // the frontmatter (top-to-bottom) after a live edit
    change(ws, 'Note.md', 'fm-layout');
    await vi.advanceTimersByTimeAsync(300);
    expect(['Root', 'Root/A', 'Root/A/#1'].map(align)).toEqual([
      'is-align-center',
      'is-align-center',
      'is-align-center',
    ]);
  });

  test('mind-mapper-title replaces the root label, the root id stays', async () => {
    const { view } = await openWith('fm-layout', {});
    expect(contentOf(view, 'Root').textContent).toBe('Custom title');
  });

  test('an invalid mind-mapper-layout falls back to the setting and is reported on every load', async () => {
    const warnOnce = vi.fn();
    const { view, ws } = await openWith('fm-invalid (warning expected)', {
      warnOnce,
      settings: () => LTR_SETTINGS,
    });
    expect(centerX(view, 'Root/B')).toBeGreaterThan(centerX(view, 'Root'));
    expect(warnOnce).toHaveBeenCalledWith(
      'Note.md\0mind-mapper-layout\0spiral',
      'Mind Mapper: unknown mind-mapper-layout "spiral" in Note.md, using left-to-right',
    );
    change(ws, 'Note.md', 'fm-invalid (warning expected)');
    await vi.advanceTimersByTimeAsync(300);
    // the plugin's warnOnce keeps it to one notice
    expect(warnOnce).toHaveBeenCalledTimes(2);
  });

  test('refresh after a gap change keeps the viewport anchored', async () => {
    const settings = { ...LTR_SETTINGS };
    const { view } = await openWith('worked-example', { settings: () => settings });
    const before = centerOn(view, 'Project/Tasks');
    const notesBefore = nodeBox(view, 'Project/Notes').x;
    settings.levelGap = 200;
    view.refresh();
    expect(nodeBox(view, 'Project/Notes').x).toBeGreaterThan(notesBefore);
    const after = screenOf(view, 'Project/Tasks');
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test('refresh after a default layout change fits the new layout', async () => {
    const settings = { ...LTR_SETTINGS };
    const { view } = await openWith('worked-example', { settings: () => settings });
    view.setTransform({ x: -500, y: 900, zoom: 0.3 });
    settings.defaultLayout = 'right-to-left';
    view.refresh();
    // culling renders the nodes in view on the next animation frame
    await vi.advanceTimersByTimeAsync(20);
    expect(centerX(view, 'Project/Notes')).toBeLessThan(centerX(view, 'Project'));
    const t = view.getTransform();
    expect(t).not.toEqual({ x: -500, y: 900, zoom: 0.3 });
    // fitted: the root is inside the 800 x 600 canvas
    const root = screenOf(view, 'Project');
    expect(root.x).toBeGreaterThanOrEqual(0);
    expect(root.x).toBeLessThan(800);
  });

  test('a live update that changes the layout fits once', async () => {
    const { view, ws } = await openWith('live-before', { settings: () => LTR_SETTINGS });
    view.setTransform({ x: -500, y: 900, zoom: 0.3 });
    change(ws, 'Note.md', 'fm-layout');
    await vi.advanceTimersByTimeAsync(300);
    expect(view.getTransform()).not.toEqual({ x: -500, y: 900, zoom: 0.3 });
  });

  test('max node size from settings reaches the CSS variables and caps estimates', async () => {
    const settings = { ...LTR_SETTINGS, maxNodeWidth: 500, maxNodeHeight: 300 };
    const { view } = await openWith('long-content', { settings: () => settings });
    expect(view.contentEl.style.getPropertyValue('--mind-mapper-node-max-width')).toBe('500px');
    expect(view.contentEl.style.getPropertyValue('--mind-mapper-node-max-height')).toBe('300px');
    expect(nodeBox(view, 'Long content/#2').width).toBe(500);
    settings.maxNodeWidth = 400;
    view.refresh();
    expect(view.contentEl.style.getPropertyValue('--mind-mapper-node-max-width')).toBe('400px');
    expect(nodeBox(view, 'Long content/#2').width).toBe(400);
  });
});

describe('colour themes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function theme(view: MindMapView): string[] {
    const canvas = view.contentEl.querySelector('.mind-mapper-canvas');
    return [...(canvas?.classList ?? [])].filter((c) => c.startsWith('mind-mapper-theme-'));
  }

  function attr(view: MindMapView, id: string, name: string): string | null | undefined {
    return view.contentEl.querySelector(`[data-node-id="${id}"]`)?.getAttribute(name);
  }

  function level(view: MindMapView, id: string): string | null | undefined {
    return attr(view, id, 'data-level');
  }

  test('nodes carry their level and branch: root none, headings 1, their paragraphs 2', async () => {
    const { view } = await openWith('fm-theme', { settings: () => LTR_SETTINGS });
    expect(level(view, 'Theme')).toBeNull();
    expect(level(view, 'Theme/Alpha')).toBe('1');
    expect(level(view, 'Theme/Alpha/#1')).toBe('2');
    expect(attr(view, 'Theme', 'data-branch')).toBeNull();
    expect(attr(view, 'Theme/Alpha', 'data-branch')).toBe('1');
    expect(attr(view, 'Theme/Alpha/#1', 'data-branch')).toBe('1');
    expect(attr(view, 'Theme/Beta', 'data-branch')).toBe('2');
  });

  test('the setting gives the theme of notes without mind-mapper-theme (default rainbow); a change applies live', async () => {
    const settings = { ...LTR_SETTINGS };
    const { view } = await openWith('live-before', { settings: () => settings });
    expect(theme(view)).toEqual(['mind-mapper-theme-rainbow']);
    settings.defaultTheme = 'ocean';
    view.refresh();
    expect(theme(view)).toEqual(['mind-mapper-theme-ocean']);
  });

  test('applyTheme switches the theme without a re-layout', async () => {
    const settings = { ...LTR_SETTINGS };
    const { view } = await openWith('live-before', { settings: () => settings });
    const setLayout = vi.spyOn(DomMapRenderer.prototype, 'setLayout');
    settings.defaultTheme = 'accent';
    view.applyTheme();
    expect(theme(view)).toEqual(['mind-mapper-theme-accent']);
    await vi.advanceTimersByTimeAsync(300);
    expect(setLayout).not.toHaveBeenCalled();
    setLayout.mockRestore();
  });

  test('mind-mapper-theme overrides the setting, also after a setting change', async () => {
    const settings: MindMapSettings = { ...LTR_SETTINGS, defaultTheme: 'accent' };
    const { view } = await openWith('fm-theme', { settings: () => settings });
    expect(theme(view)).toEqual(['mind-mapper-theme-rainbow']);
    settings.defaultTheme = 'forest';
    view.refresh();
    expect(theme(view)).toEqual(['mind-mapper-theme-rainbow']);
  });

  test('editing or removing mind-mapper-theme switches the theme live', async () => {
    const settings = { ...LTR_SETTINGS, defaultTheme: 'forest' as const };
    const { view, ws } = await openWith('live-before', { settings: () => settings });
    expect(theme(view)).toEqual(['mind-mapper-theme-forest']);
    change(ws, 'Note.md', 'fm-theme');
    await vi.advanceTimersByTimeAsync(300);
    expect(theme(view)).toEqual(['mind-mapper-theme-rainbow']);
    change(ws, 'Note.md', 'live-before');
    await vi.advanceTimersByTimeAsync(300);
    expect(theme(view)).toEqual(['mind-mapper-theme-forest']);
  });

  test('an unknown mind-mapper-theme falls back to the setting with a notice', async () => {
    const warnOnce = vi.fn();
    const settings = { ...LTR_SETTINGS, defaultTheme: 'ocean' as const };
    const { view } = await openWith('fm-theme-invalid (warning expected)', {
      warnOnce,
      settings: () => settings,
    });
    expect(theme(view)).toEqual(['mind-mapper-theme-ocean']);
    expect(warnOnce).toHaveBeenCalledWith(
      'Note.md\0mind-mapper-theme\0neon',
      'Mind Mapper: unknown mind-mapper-theme "neon" in Note.md, using ocean',
    );
  });
});

describe('layout and colour theme of this view (overrides)', () => {
  let frames: MockInstance[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    MockMenu.lastShown = null;
    // jsdom's frames run on real time: tie them to the fake timers (a frame is one tick).
    frames = [
      vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation(
          (callback) => setTimeout(() => callback(performance.now()), 1) as unknown as number,
        ),
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => clearTimeout(id)),
    ];
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const spy of frames) spy.mockRestore();
  });

  function theme(view: MindMapView): string[] {
    const canvas = view.contentEl.querySelector('.mind-mapper-canvas');
    return [...(canvas?.classList ?? [])].filter((c) => c.startsWith('mind-mapper-theme-'));
  }

  function control(view: MindMapView, label: string): HTMLElement {
    const el = view.contentEl.querySelector<HTMLElement>(
      `.mind-mapper-controls button[aria-label="${label}"]`,
    );
    if (!el) throw new Error(`no control ${label}`);
    return el;
  }

  const active = (view: MindMapView, label: string) =>
    control(view, label).classList.contains('is-active');

  function checkedIn(menu: MockMenu | null): string[] {
    return (menu?.items ?? []).filter((i) => i.checked).map((i) => i.title);
  }

  /** Children below the root: top-to-bottom. */
  function grows(view: MindMapView, root: string, child: string): string {
    const r = nodeBox(view, root);
    const c = nodeBox(view, child);
    if (c.y >= r.y + r.height) return 'down';
    if (c.y + c.height <= r.y) return 'up';
    return c.x > r.x ? 'right' : 'left';
  }

  test('without an override the note decides; the buttons are not highlighted and the menus check its values', async () => {
    const { view } = await openWith('fm-layout', { settings: () => LTR_SETTINGS });
    expect(grows(view, 'Root', 'Root/A')).toBe('down');
    expect(view.getState()).toMatchObject({ file: 'Note.md', layout: null, theme: null });
    expect(active(view, 'Layout')).toBe(false);
    expect(active(view, 'Color theme')).toBe(false);
    control(view, 'Layout').click();
    expect(checkedIn(MockMenu.lastShown)).toEqual(['Top → bottom']);
    control(view, 'Color theme').click();
    expect(checkedIn(MockMenu.lastShown)).toEqual(['Rainbow']);
  });

  test('choosing a layout re-lays out and fits; the note is not touched', async () => {
    const { view, ws } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    const text = ws.vault.texts.get('Note.md');
    view.setTransform({ x: -500, y: 900, zoom: 0.3 });
    view.chooseLayout('top-to-bottom');
    await vi.advanceTimersByTimeAsync(20);
    expect(grows(view, 'Project', 'Project/Tasks')).toBe('down');
    expect(view.getTransform()).not.toEqual({ x: -500, y: 900, zoom: 0.3 });
    const root = screenOf(view, 'Project');
    expect(root.x).toBeGreaterThanOrEqual(0);
    expect(root.x).toBeLessThan(800);
    expect(root.y).toBeGreaterThanOrEqual(0);
    expect(root.y).toBeLessThan(600);
    expect(active(view, 'Layout')).toBe(true);
    expect(active(view, 'Color theme')).toBe(false);
    control(view, 'Layout').click();
    expect(checkedIn(MockMenu.lastShown)).toEqual(['Top → bottom']);
    expect(ws.vault.texts.get('Note.md')).toBe(text);
  });

  test('the chosen layout wins over frontmatter edits and the setting; "Use the note\'s layout" goes back', async () => {
    const settings = { ...LTR_SETTINGS };
    const { view, ws } = await openWith('live-before', { settings: () => settings });
    view.chooseLayout('right-to-left');
    await vi.advanceTimersByTimeAsync(20);
    // The note gets mind-mapper-layout: top-to-bottom.
    change(ws, 'Note.md', 'fm-layout');
    await vi.advanceTimersByTimeAsync(300);
    expect(grows(view, 'Root', 'Root/A')).toBe('left');
    settings.defaultLayout = 'bottom-to-top';
    view.refresh();
    await vi.advanceTimersByTimeAsync(20);
    expect(grows(view, 'Root', 'Root/A')).toBe('left');
    expect(active(view, 'Layout')).toBe(true);

    view.setTransform({ x: -500, y: 900, zoom: 0.3 });
    view.chooseLayout(null);
    await vi.advanceTimersByTimeAsync(20);
    expect(grows(view, 'Root', 'Root/A')).toBe('down');
    expect(view.getTransform()).not.toEqual({ x: -500, y: 900, zoom: 0.3 });
    expect(active(view, 'Layout')).toBe(false);
    expect(view.getState()).toMatchObject({ layout: null });
    // Without an override frontmatter edits apply again.
    change(ws, 'Note.md', 'live-before');
    await vi.advanceTimersByTimeAsync(320);
    expect(grows(view, 'Live', 'Live/Beta')).toBe('up');
  });

  test('choosing a colour theme applies it without a re-layout; it wins over frontmatter edits until reset', async () => {
    const settings: MindMapSettings = { ...LTR_SETTINGS, defaultTheme: 'forest' };
    const { view, ws } = await openWith('fm-theme', { settings: () => settings });
    expect(theme(view)).toEqual(['mind-mapper-theme-rainbow']);
    const setLayout = vi.spyOn(DomMapRenderer.prototype, 'setLayout');
    const transform = view.getTransform();
    view.chooseTheme('ocean');
    await vi.advanceTimersByTimeAsync(300);
    expect(setLayout).not.toHaveBeenCalled();
    setLayout.mockRestore();
    expect(view.getTransform()).toEqual(transform);
    expect(theme(view)).toEqual(['mind-mapper-theme-ocean']);
    expect(active(view, 'Color theme')).toBe(true);
    expect(active(view, 'Layout')).toBe(false);
    expect(view.getState()).toMatchObject({ theme: 'ocean', layout: null });

    // Frontmatter edits and setting changes do not replace it.
    change(ws, 'Note.md', 'live-before');
    await vi.advanceTimersByTimeAsync(300);
    expect(theme(view)).toEqual(['mind-mapper-theme-ocean']);
    settings.defaultTheme = 'accent';
    view.applyTheme();
    expect(theme(view)).toEqual(['mind-mapper-theme-ocean']);

    view.chooseTheme(null);
    expect(theme(view)).toEqual(['mind-mapper-theme-accent']);
    expect(active(view, 'Color theme')).toBe(false);
    change(ws, 'Note.md', 'fm-theme');
    await vi.advanceTimersByTimeAsync(300);
    expect(theme(view)).toEqual(['mind-mapper-theme-rainbow']);
  });

  test('the overrides are saved in the view state and restored from it; an older state has none', async () => {
    const { view, ws } = await openWith('fm-theme', { settings: () => LTR_SETTINGS });
    const requestSaveLayout = vi.spyOn(ws, 'requestSaveLayout');
    view.chooseLayout('top-to-bottom');
    expect(requestSaveLayout).toHaveBeenCalledTimes(1);
    view.chooseTheme('accent');
    expect(requestSaveLayout).toHaveBeenCalledTimes(2);
    const saved = view.getState();
    expect(saved).toMatchObject({ file: 'Note.md', layout: 'top-to-bottom', theme: 'accent' });

    // Restart: a new view gets the saved state.
    const leaf = { app: ws.app, setViewState: vi.fn(() => Promise.resolve()) };
    const restored = new MindMapView(leaf as unknown as WorkspaceLeaf, {
      settings: () => LTR_SETTINGS,
    });
    await setSize(restored, 800, 600);
    await restored.setState(JSON.parse(JSON.stringify(saved)), { history: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(grows(restored, 'Theme', 'Theme/Alpha')).toBe('down');
    expect(theme(restored)).toEqual(['mind-mapper-theme-accent']);
    expect(active(restored, 'Layout')).toBe(true);
    expect(active(restored, 'Color theme')).toBe(true);
    expect(restored.getState()).toMatchObject(saved);

    // A state from before this feature (only `file`): the note's layout and theme.
    await restored.setState({ file: 'Note.md' }, { history: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(grows(restored, 'Theme', 'Theme/Alpha')).toBe('right');
    expect(theme(restored)).toEqual(['mind-mapper-theme-rainbow']);
    expect(active(restored, 'Layout')).toBe(false);
    expect(active(restored, 'Color theme')).toBe(false);
    expect(restored.getState()).toMatchObject({ layout: null, theme: null });
  });

  test('a rename keeps the overrides', async () => {
    const { view, ws } = await openWorked();
    view.chooseLayout('top-to-bottom');
    view.chooseTheme('none');
    const setViewState = vi.spyOn(view.leaf, 'setViewState');
    rename(ws, 'Note.md', 'Renamed.md', 'worked-example');
    await vi.advanceTimersByTimeAsync(0);
    expect(setViewState).toHaveBeenCalledWith({
      type: 'mind-mapper-view',
      state: { file: 'Renamed.md', layout: 'top-to-bottom', theme: 'none', drill: [] },
    });
    expect(view.getState()).toMatchObject({
      file: 'Renamed.md',
      layout: 'top-to-bottom',
      theme: 'none',
    });
    expect(theme(view)).toEqual(['mind-mapper-theme-none']);
  });

  test('next layout and next theme cycle from the shown value and wrap around', async () => {
    const { view } = await openWith('fm-layout', { settings: () => LTR_SETTINGS });
    view.nextLayout();
    expect(view.getState()).toMatchObject({ layout: 'bottom-to-top' });
    view.nextLayout();
    expect(view.getState()).toMatchObject({ layout: 'kanban' });
    view.nextLayout();
    expect(view.getState()).toMatchObject({ layout: 'circle-clockwise' });
    view.nextLayout();
    expect(view.getState()).toMatchObject({ layout: 'circle-counter-clockwise' });
    // Default theme rainbow.
    view.nextTheme();
    expect(theme(view)).toEqual(['mind-mapper-theme-ocean']);
    view.chooseTheme('accent');
    view.nextTheme();
    expect(theme(view)).toEqual(['mind-mapper-theme-none']);
    expect(view.getState()).toMatchObject({ theme: 'none' });
  });

  test('choosing the layout that is already shown does not re-fit, but sets the highlight; so does "Use the note\'s layout" when it equals the override', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    const moved = { x: -500, y: 900, zoom: 0.3 };
    view.setTransform(moved);
    const setLayout = vi.spyOn(DomMapRenderer.prototype, 'setLayout');
    // The note's layout (left-to-right) as an override: nothing to lay out, but highlighted.
    view.chooseLayout('left-to-right');
    await vi.advanceTimersByTimeAsync(300);
    expect(setLayout).not.toHaveBeenCalled();
    expect(view.getTransform()).toEqual(moved);
    expect(active(view, 'Layout')).toBe(true);
    expect(view.getState()).toMatchObject({ layout: 'left-to-right' });
    // Back to the note's layout, which is the same one: highlight off, no re-fit.
    view.chooseLayout(null);
    await vi.advanceTimersByTimeAsync(300);
    expect(setLayout).not.toHaveBeenCalled();
    expect(view.getTransform()).toEqual(moved);
    expect(active(view, 'Layout')).toBe(false);
    expect(view.getState()).toMatchObject({ layout: null });
    // A different override twice in a row: the second choice changes nothing.
    view.chooseLayout('top-to-bottom');
    await vi.advanceTimersByTimeAsync(300);
    expect(setLayout).toHaveBeenCalledTimes(1);
    const fitted = view.getTransform();
    view.setTransform(moved);
    view.chooseLayout('top-to-bottom');
    await vi.advanceTimersByTimeAsync(300);
    expect(setLayout).toHaveBeenCalledTimes(1);
    expect(view.getTransform()).toEqual(moved);
    expect(fitted).not.toEqual(moved);
    setLayout.mockRestore();
  });

  test('next layout re-lays out and fits', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    const moved = { x: -500, y: 900, zoom: 0.3 };
    view.setTransform(moved);
    view.nextLayout();
    await vi.advanceTimersByTimeAsync(300);
    // From left-to-right to right-to-left.
    expect(view.getState()).toMatchObject({ layout: 'right-to-left' });
    expect(centerX(view, 'Project/Tasks')).toBeLessThan(centerX(view, 'Project'));
    expect(view.getTransform()).not.toEqual(moved);
    const root = screenOf(view, 'Project');
    expect(root.x).toBeGreaterThanOrEqual(0);
    expect(root.x).toBeLessThan(800);
    expect(root.y).toBeGreaterThanOrEqual(0);
    expect(root.y).toBeLessThan(600);
  });

  test('an override restored into a hidden tab fits once the tab is shown', async () => {
    const { ws } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    const leaf = { app: ws.app, setViewState: vi.fn(() => Promise.resolve()) };
    const restored = new MindMapView(leaf as unknown as WorkspaceLeaf, {
      settings: () => LTR_SETTINGS,
    });
    await setSize(restored, 0, 0);
    await restored.setState({ file: 'Note.md', layout: 'top-to-bottom' }, { history: false });
    await vi.advanceTimersByTimeAsync(300);
    // Loaded while hidden: no node DOM until the tab has a size.
    expect(nodeIds(restored)).toEqual([]);
    expect(restored.getTransform()).toEqual(IDENTITY);
    setElSize(restored.contentEl.querySelector('.mind-mapper-canvas'), 800, 600);
    restored.onResize();
    await vi.advanceTimersByTimeAsync(300);
    expect(grows(restored, 'Project', 'Project/Tasks')).toBe('down');
    expect(restored.getTransform()).not.toEqual(IDENTITY);
    // Fits once: a later resize keeps the viewport.
    restored.setTransform({ x: 5, y: 6, zoom: 1 });
    restored.onResize();
    expect(restored.getTransform()).toEqual({ x: 5, y: 6, zoom: 1 });
  });

  test('"Next layout" many times within one frame lays out once per frame; the last choice wins', async () => {
    const { view, ws } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    const reference = await openWith('worked-example', {
      settings: () => ({ ...LTR_SETTINGS, defaultLayout: 'circle-counter-clockwise' }),
    });
    const requestSaveLayout = vi.spyOn(ws, 'requestSaveLayout');
    const setLayout = vi.spyOn(DomMapRenderer.prototype, 'setLayout');
    view.setTransform({ x: -500, y: 900, zoom: 0.3 });
    for (let i = 0; i < 6; i++) view.nextLayout();
    // The choice is stored at once, the re-layout waits for the frame.
    expect(view.getState()).toMatchObject({ layout: 'circle-counter-clockwise' });
    expect(requestSaveLayout).toHaveBeenCalledTimes(6);
    expect(active(view, 'Layout')).toBe(true);
    expect(setLayout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(setLayout).toHaveBeenCalledTimes(1);
    expect(view.getState()).toMatchObject({ layout: 'circle-counter-clockwise' });
    // Same geometry as a map that was opened with the last choice.
    for (const id of ['Project', 'Project/Tasks', 'Project/Notes'])
      expect(nodeBox(view, id)).toEqual(nodeBox(reference.view, id));
    const root = screenOf(view, 'Project');
    expect(root.x).toBeGreaterThanOrEqual(0);
    expect(root.x).toBeLessThan(800);
    // A second burst in a later frame lays out once more.
    view.nextLayout();
    view.nextLayout();
    await vi.advanceTimersByTimeAsync(20);
    expect(setLayout).toHaveBeenCalledTimes(2);
    expect(view.getState()).toMatchObject({ layout: 'right-to-left' });
    setLayout.mockRestore();
  });

  test('a burst that ends on the shown layout lays out nothing; a closed view stays quiet', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    const setLayout = vi.spyOn(DomMapRenderer.prototype, 'setLayout');
    view.chooseLayout('top-to-bottom');
    view.chooseLayout(null);
    await vi.advanceTimersByTimeAsync(20);
    expect(setLayout).not.toHaveBeenCalled();
    view.nextLayout();
    await view.onClose();
    await vi.advanceTimersByTimeAsync(20);
    expect(setLayout).not.toHaveBeenCalled();
    setLayout.mockRestore();
  });

  test('the menus open at their buttons (commands "Change layout…" and "Change color theme…")', async () => {
    const { view } = await openWith('fm-layout', { settings: () => LTR_SETTINGS });
    view.showLayoutMenu();
    expect(checkedIn(MockMenu.lastShown)).toEqual(['Top → bottom']);
    view.showThemeMenu();
    expect(checkedIn(MockMenu.lastShown)).toEqual(['Rainbow']);
    void MockMenu.lastShown?.items.find((i) => i.title === 'Forest')?.clickHandler?.();
    expect(theme(view)).toEqual(['mind-mapper-theme-forest']);
  });

  test('in German the buttons and menus are German', async () => {
    useGerman();
    const { view } = await openWith('fm-layout', { settings: () => LTR_SETTINGS });
    control(view, 'Layout').click();
    expect(checkedIn(MockMenu.lastShown)).toEqual(['Oben → unten']);
    control(view, 'Farbschema').click();
    expect(checkedIn(MockMenu.lastShown)).toEqual(['Regenbogen']);
  });
});

describe('max node size changes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('changing the max node size re-measures: measured sizes and clip state stay', async () => {
    const settings = { ...LTR_SETTINGS };
    const { view } = await openWith('worked-example', { settings: () => settings });
    report(view, 'Project/#1', 280, 100);
    report(view, 'Project/Tasks/#1', 250, 900);
    await vi.advanceTimersByTimeAsync(100);
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 298, height: 114 });
    const clipped = () =>
      view.contentEl
        .querySelector('[data-node-id="Project/Tasks/#1"]')
        ?.classList.contains('is-clipped-y');
    expect(clipped()).toBe(true);
    settings.maxNodeWidth = 400;
    view.refresh();
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 298, height: 114 });
    expect(clipped()).toBe(true);
  });
});

describe('cross-links', () => {
  test('cross-links of the crosslinks fixture are drawn and follow collapse', async () => {
    const ws = new FakeWorkspace();
    const leaf = { app: ws.app, setViewState: vi.fn(() => Promise.resolve()) };
    const view = new MindMapView(leaf as unknown as WorkspaceLeaf, {
      settings: () => LTR_SETTINGS,
    });
    ws.addNote('crosslinks.md', 'crosslinks');
    await setSize(view, 800, 600);
    await view.setState(...state('crosslinks.md'));
    const count = () => view.contentEl.querySelectorAll('path.mind-mapper-crosslink').length;
    expect(count()).toBe(6);
    view.collapseAll();
    expect(count()).toBe(3);
    view.expandAll();
    expect(count()).toBe(6);
  });
});

describe('clicking a link line', () => {
  afterEach(() => document.body.empty());

  const canvasOf = (view: MindMapView): HTMLElement => {
    const el = view.contentEl.querySelector<HTMLElement>('.mind-mapper-canvas');
    if (!el) throw new Error('no canvas');
    return el;
  };

  function hitOf(view: MindMapView, fromId: string, toId: string): HTMLElement {
    const el = view.contentEl.querySelector<HTMLElement>(
      `.mind-mapper-crosslink-hit[data-from-id="${fromId}"][data-to-id="${toId}"]`,
    );
    if (!el) throw new Error(`no link line ${fromId} -> ${toId}`);
    return el;
  }

  function press(el: Element, type: string, x: number, y: number): void {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
        pointerId: 1,
      }),
    );
  }

  /** A press and release without movement (the release goes to the capturing canvas). */
  function tap(view: MindMapView, el: Element): void {
    press(el, 'pointerdown', 5, 5);
    press(canvasOf(view), 'pointerup', 5, 5);
  }

  function linkEnds(view: MindMapView): (string | undefined)[] {
    return [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node.is-link-end')]
      .map((el) => el.dataset.nodeId)
      .sort();
  }

  function highlightedLines(view: MindMapView): number {
    return view.contentEl.querySelectorAll('path.mind-mapper-crosslink.is-highlighted').length;
  }

  test('a tap on a line rings both end nodes and emphasises the line; it is no node selection', async () => {
    const { view } = await openWith('crosslinks', { settings: () => LTR_SETTINGS });
    contentOf(view, 'Links/Beta').click();
    expect(view.selectedId).toBe('Links/Beta');
    tap(view, hitOf(view, 'Links/Gamma/#1', 'Links/Beta/Inner'));
    expect(linkEnds(view)).toEqual(['Links/Beta/Inner', 'Links/Gamma/#1']);
    expect(highlightedLines(view)).toBe(1);
    expect(view.selectedId).toBeNull();
    expect(selectedIds(view)).toEqual([]);
  });

  test('a tap on the empty canvas, a node or another line ends the highlight', async () => {
    const { view } = await openWith('crosslinks', { settings: () => LTR_SETTINGS });
    tap(view, hitOf(view, 'Links/Gamma/#1', 'Links/Beta/Inner'));
    tap(view, canvasOf(view));
    expect(linkEnds(view)).toEqual([]);
    expect(highlightedLines(view)).toBe(0);

    tap(view, hitOf(view, 'Links/Gamma/#1', 'Links/Beta/Inner'));
    contentOf(view, 'Links/Beta').click();
    expect(linkEnds(view)).toEqual([]);
    expect(highlightedLines(view)).toBe(0);
    expect(view.selectedId).toBe('Links/Beta');

    tap(view, hitOf(view, 'Links/Gamma/#1', 'Links/Beta/Inner'));
    tap(view, hitOf(view, 'Links/Gamma/#2', 'Links/Gamma'));
    expect(linkEnds(view)).toEqual(['Links/Gamma', 'Links/Gamma/#2']);
    expect(highlightedLines(view)).toBe(1);
  });

  test('a drag that starts on a line pans and highlights nothing', async () => {
    const { view } = await openWith('crosslinks', { settings: () => LTR_SETTINGS });
    const before = view.getTransform();
    press(hitOf(view, 'Links/Gamma/#1', 'Links/Beta/Inner'), 'pointerdown', 5, 5);
    press(canvasOf(view), 'pointermove', 45, 25);
    press(canvasOf(view), 'pointerup', 45, 25);
    expect(view.getTransform()).toEqual({ ...before, x: before.x + 40, y: before.y + 20 });
    expect(linkEnds(view)).toEqual([]);
    expect(highlightedLines(view)).toBe(0);
  });

  test('selecting a node highlights none of its links or linked nodes', async () => {
    const { view } = await openWith('crosslinks', { settings: () => LTR_SETTINGS });
    contentOf(view, 'Links/Alpha').click();
    expect(selectedIds(view)).toEqual(['Links/Alpha']);
    expect(linkEnds(view)).toEqual([]);
    expect(highlightedLines(view)).toBe(0);
  });

  test('a line to a collapsed node rings its nearest visible ancestor', async () => {
    const { view } = await openWith('crosslinks', { settings: () => LTR_SETTINGS });
    view.toggleCollapse('Links/Beta');
    tap(view, hitOf(view, 'Links/Gamma/#1', 'Links/Beta'));
    expect(linkEnds(view)).toEqual(['Links/Beta', 'Links/Gamma/#1']);
  });

  test('works in full screen', async () => {
    const { view } = await openWith('crosslinks', { settings: () => LTR_SETTINGS });
    document.body.appendChild(view.containerEl);
    view.toggleFullScreen();
    tap(view, hitOf(view, 'Links/Gamma/#2', 'Links/Gamma'));
    expect(view.isFullScreen).toBe(true);
    expect(linkEnds(view)).toEqual(['Links/Gamma', 'Links/Gamma/#2']);
  });

  test('a double click on a line jumps to the line the link is written on and does not fit', async () => {
    const { view, ws } = await openWith('crosslinks', { settings: () => LTR_SETTINGS });
    document.body.appendChild(view.containerEl);
    const noteLeaf = ws.addLeaf({ type: 'markdown', state: { file: 'Note.md' } });
    noteLeaf.view = { getViewType: () => 'empty' };
    const openFile = vi.fn(() => Promise.resolve());
    Object.assign(noteLeaf, { openFile });
    view.toggleFullScreen();
    const moved = { x: -700, y: 40, zoom: 2 };
    view.setTransform(moved);
    const hit = hitOf(view, 'Links/Gamma/#1', 'Links/Beta/Inner');
    tap(view, hit);
    tap(view, hit);
    hit.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    // full screen exits first, which restores the transform from before it
    expect(view.isFullScreen).toBe(false);
    await vi.waitFor(() =>
      expect(openFile).toHaveBeenCalledWith(expect.anything(), {
        active: true,
        eState: { line: 14 },
      }),
    );
    view.setTransform(moved);
    tap(view, hit);
    tap(view, hit);
    hit.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(view.getTransform()).toEqual(moved);
  });
});

function escHandlers(view: MindMapView): MockScope['handlers'] {
  return ((view.scope as unknown as MockScope | null)?.handlers ?? []).filter(
    (h) => h.key === 'Escape',
  );
}

describe('dividers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const dividerCount = (view: MindMapView) =>
    view.contentEl.querySelectorAll('path.mind-mapper-divider').length;

  test('dividers of the thematic-breaks note are drawn; a collapsed parent hides its own', async () => {
    const { view } = await openWith('thematic-breaks', {});
    expect(dividerCount(view)).toBe(7);
    view.toggleCollapse('Dividers/Paragraph directly above dashes');
    expect(dividerCount(view)).toBe(6);
    view.toggleCollapse('Dividers/Paragraph directly above dashes');
    expect(dividerCount(view)).toBe(7);
  });
});

describe('double click on the empty canvas', () => {
  afterEach(() => document.body.empty());

  /** Two presses without movement plus the dblclick the browser sends after them. */
  function doubleClick(view: MindMapView, el: HTMLElement): void {
    const canvas = view.contentEl.querySelector<HTMLElement>('.mind-mapper-canvas');
    for (let i = 0; i < 2; i++) {
      for (const type of ['pointerdown', 'pointerup']) {
        (type === 'pointerdown' ? el : canvas)?.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            button: 0,
            buttons: type === 'pointerdown' ? 1 : 0,
            clientX: 5,
            clientY: 5,
            pointerId: 1,
          }),
        );
      }
    }
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }

  function canvasOf(view: MindMapView): HTMLElement {
    const el = view.contentEl.querySelector<HTMLElement>('.mind-mapper-canvas');
    if (!el) throw new Error('no canvas');
    return el;
  }

  test('fits the map like the "Fit to view" control', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    const fitted = view.getTransform();
    view.setTransform({ x: -700, y: 40, zoom: 2 });
    doubleClick(view, canvasOf(view));
    expect(view.getTransform()).toEqual(fitted);
  });

  test('also in full screen', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    document.body.appendChild(view.containerEl);
    view.toggleFullScreen();
    const fitted = view.getTransform();
    view.setTransform({ x: -700, y: 40, zoom: 2 });
    doubleClick(view, canvasOf(view));
    expect(view.isFullScreen).toBe(true);
    expect(view.getTransform()).toEqual(fitted);
  });

  test('a double click on a node does not fit', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    const moved = { x: -700, y: 40, zoom: 2 };
    view.setTransform(moved);
    doubleClick(view, contentOf(view, 'Project/Tasks'));
    expect(view.getTransform()).toEqual(moved);
  });
});

describe('back to root and full screen', () => {
  afterEach(() => document.body.empty());

  test('back to root selects the root and centres it, zoom unchanged', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    view.setTransform({ x: -700, y: 40, zoom: 0.6 });
    view.backToRoot();
    expect(view.selectedId).toBe('Project');
    const box = nodeBox(view, 'Project');
    const t = view.getTransform();
    expect(t.zoom).toBe(0.6);
    expect((box.x + box.width / 2) * t.zoom + t.x).toBeCloseTo(400);
    expect((box.y + box.height / 2) * t.zoom + t.y).toBeCloseTo(300);
  });

  test('entering fits; exiting restores the previous transform; Esc only while in full screen', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    document.body.appendChild(view.containerEl);
    view.setTransform({ x: -700, y: 40, zoom: 0.6 });
    expect(escHandlers(view)).toHaveLength(0);
    view.toggleFullScreen();
    expect(view.isFullScreen).toBe(true);
    expect(document.body.querySelector('.mind-mapper-full-screen')).not.toBeNull();
    expect(view.getTransform()).not.toEqual({ x: -700, y: 40, zoom: 0.6 });
    const [esc] = escHandlers(view);
    expect(esc).toBeDefined();
    // Esc in the zoom input only restores the input.
    const input = document.body.querySelector<HTMLInputElement>('.mind-mapper-zoom-input');
    const inInput = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    input?.dispatchEvent(inInput);
    esc?.func(inInput);
    expect(view.isFullScreen).toBe(true);
    esc?.func(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(view.isFullScreen).toBe(false);
    expect(view.getTransform()).toEqual({ x: -700, y: 40, zoom: 0.6 });
    expect(escHandlers(view)).toHaveLength(0);
    expect(view.contentEl.parentElement).toBe(view.containerEl);
  });

  test('closing the view in full screen removes the overlay', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    document.body.appendChild(view.containerEl);
    view.toggleFullScreen();
    await view.onClose();
    expect(document.body.querySelector('.mind-mapper-full-screen')).toBeNull();
  });

  test('a link click in full screen exits first', async () => {
    const { view } = await openWith('embeds', { settings: () => LTR_SETTINGS });
    document.body.appendChild(view.containerEl);
    Object.assign(view.app.workspace, {
      openLinkText: vi.fn(() => Promise.resolve()),
      setActiveLeaf: vi.fn(),
    });
    view.toggleFullScreen();
    const link = view.contentEl.querySelector('.mind-mapper-node-content')?.createEl('a', {
      cls: 'internal-link',
      attr: { 'data-href': 'lists' },
    });
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(view.isFullScreen).toBe(false);
  });

  test('double click jump exits full screen first', async () => {
    const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
    document.body.appendChild(view.containerEl);
    view.toggleFullScreen();
    contentOf(view, 'Project/Tasks').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(view.isFullScreen).toBe(false);
  });
});

test('another leaf becoming active (quick switcher, search, hover link) exits full screen', async () => {
  const { view, ws } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
  document.body.appendChild(view.containerEl);
  view.toggleFullScreen();
  ws.trigger('active-leaf-change', view.leaf);
  expect(view.isFullScreen).toBe(true);
  ws.trigger('active-leaf-change', ws.addLeaf({ type: 'markdown' }).asLeaf());
  expect(view.isFullScreen).toBe(false);
  expect(document.body.querySelector('.mind-mapper-full-screen')).toBeNull();
  document.body.empty();
});

test('Esc that nothing handled is marked handled while the map is the active view (keeps its tab)', async () => {
  const ws = new FakeWorkspace();
  ws.addNote('Note.md', 'worked-example');
  const { view } = newView(ws);
  await view.onOpen();
  const press = (init: KeyboardEventInit = {}): boolean => {
    const evt = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      ...init,
    });
    document.body.dispatchEvent(evt);
    return evt.defaultPrevented;
  };
  // Another view is active: Obsidian's own Esc handling stays untouched.
  expect(press()).toBe(false);
  ws.activeView = view;
  // After a menu closed itself on Esc (its handler does not mark the key handled) or bare.
  expect(press()).toBe(true);
  expect(press({ key: 'Enter' })).toBe(false);
  await view.onClose();
  view.unload();
  expect(press()).toBe(false);
});

/**
 * Obsidian's Scope.handleKey: the first matching handler decides, except that a catch-all (no key,
 * no modifiers) returning nothing lets the key go on.
 */
function handleKey(view: MindMapView, evt: KeyboardEvent): unknown {
  for (const h of (view.scope as unknown as MockScope).handlers) {
    if (h.key !== null && h.key.toLowerCase() !== evt.key.toLowerCase()) continue;
    const result = h.func(evt);
    if (result !== undefined || h.key !== null || h.modifiers !== null) return result;
  }
  return undefined;
}

test('Esc on a map in a popout is marked handled by the view scope (the relayed key, #44)', async () => {
  const ws = new FakeWorkspace();
  ws.addNote('Note.md', 'worked-example');
  const { view } = newView(ws);
  await view.onOpen();
  ws.activeView = view;
  const escape = (win: Window) => {
    const Keyboard = (win as Window & typeof globalThis).KeyboardEvent;
    return new Keyboard('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  };
  // In the main window the document listener marks it; the scope leaves it alone.
  const inMain = escape(window);
  expect(handleKey(view, inMain)).toBeUndefined();
  expect(inMain.defaultPrevented).toBe(false);

  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const popout = frame.contentWindow!;
  (
    globalThis as unknown as { migrateToWindow: (el: HTMLElement, win: Window) => void }
  ).migrateToWindow(view.containerEl, popout);
  // In a popout: marked handled, and the key goes on (nothing returned).
  const inPopout = escape(window);
  expect(handleKey(view, inPopout)).toBeUndefined();
  expect(inPopout.defaultPrevented).toBe(true);
  // A later Esc handler (full screen registers one) still runs after it.
  const later = vi.fn(() => false);
  view.scope!.register([], 'Escape', later);
  expect(handleKey(view, escape(window))).toBe(false);
  expect(later).toHaveBeenCalledOnce();
  // Another view is active: untouched.
  ws.activeView = null;
  const other = escape(window);
  handleKey(view, other);
  expect(other.defaultPrevented).toBe(false);

  await view.onClose();
  document.body.empty();
});

test('a map moved to another window observes its contents with an observer of that window (#44)', async () => {
  const start = FakeRO.instances.length;
  const { view } = await openWith('worked-example', { settings: () => LTR_SETTINGS });
  document.body.appendChild(view.containerEl);
  const before = FakeRO.instances.slice(start);
  expect(before).toHaveLength(1);
  const contents = [...before[0]!.observed];
  expect(contents.length).toBeGreaterThan(0);

  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  class PopoutObserver extends (FakeRO as unknown as typeof ResizeObserver) {}
  Object.assign(frame.contentWindow!, { ResizeObserver: PopoutObserver });
  (
    globalThis as unknown as { migrateToWindow: (el: HTMLElement, win: Window) => void }
  ).migrateToWindow(view.containerEl, frame.contentWindow!);

  // The old window's observer is released, one of the new window observes the same contents.
  expect(before[0]!.connected).toBe(false);
  const after = FakeRO.instances.slice(start + 1);
  expect(after).toHaveLength(1);
  expect(after[0]).toBeInstanceOf(PopoutObserver);
  expect([...after[0]!.observed]).toEqual(contents);
  await view.onClose();
  document.body.empty();
});

/** Headings-only note: `# Big`, `groups` H2s with `perGroup` H3s each (1 + groups * (1 + perGroup) nodes). */
function bigNote(groups: number, perGroup: number): { text: string; cache: CachedMetadata } {
  const lines: string[] = [];
  const headings: NonNullable<CachedMetadata['headings']> = [];
  const sections: NonNullable<CachedMetadata['sections']> = [];
  let offset = 0;
  const add = (level: number, heading: string): void => {
    const line = lines.length;
    const text = `${'#'.repeat(level)} ${heading}`;
    const position = {
      start: { line, col: 0, offset },
      end: { line, col: text.length, offset: offset + text.length },
    };
    headings.push({ heading, level, position });
    sections.push({ type: 'heading', position });
    lines.push(text);
    offset += text.length + 1;
  };
  add(1, 'Big');
  for (let g = 0; g < groups; g++) {
    add(2, `Group ${g}`);
    for (let i = 0; i < perGroup; i++) add(3, `Item ${g}.${i}`);
  }
  return { text: lines.join('\n'), cache: { headings, sections } };
}

function domNodes(view: MindMapView): number {
  return view.contentEl.querySelectorAll('.mind-mapper-node').length;
}

async function openBig(): Promise<{ view: MindMapView; ws: FakeWorkspace }> {
  const ws = new FakeWorkspace();
  const leaf = { app: ws.app, setViewState: vi.fn(() => Promise.resolve()) };
  const view = new MindMapView(leaf as unknown as WorkspaceLeaf, { settings: () => LTR_SETTINGS });
  const { text, cache } = bigNote(40, 49);
  ws.vault.texts.set('Big.md', text);
  ws.metadataCache.caches.set('Big.md', cache);
  await setSize(view, 800, 600);
  await view.setState(...state('Big.md'));
  await vi.advanceTimersByTimeAsync(20);
  return { view, ws };
}

describe('culling at scale', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('a fitted 2,000-node map is a skeleton; at 100 % only nodes in view have DOM', async () => {
    const { view } = await openBig();
    expect(view.getTransform().zoom).toBeLessThan(0.2);
    // at the minimum zoom 245 nodes are in view: skeleton, no node DOM
    expect(domNodes(view)).toBe(0);
    expect(view.contentEl.querySelector('path.mind-mapper-skeleton')).not.toBeNull();
    expect(view.contentEl.querySelectorAll('path.mind-mapper-edge')).toHaveLength(2000);
    view.resetZoom();
    await vi.advanceTimersByTimeAsync(20);
    expect(domNodes(view)).toBeGreaterThan(0);
    expect(domNodes(view)).toBeLessThanOrEqual(400);
    expect(view.contentEl.querySelector('path.mind-mapper-skeleton')).toBeNull();
  });

  test('nodes rendered by panning are measured', async () => {
    const { view } = await openBig();
    view.setTransform({ x: 0, y: 0, zoom: 1 });
    await vi.advanceTimersByTimeAsync(20);
    const before = new Set(
      [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node')].map(
        (el) => el.dataset.nodeId,
      ),
    );
    view.setTransform({ x: -300, y: -3000, zoom: 1 });
    await vi.advanceTimersByTimeAsync(20);
    const fresh = [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node')]
      .map((el) => el.dataset.nodeId ?? '')
      .find((id) => !before.has(id));
    expect(fresh).toBeDefined();
    report(view, fresh ?? '', 250, 90);
    await vi.advanceTimersByTimeAsync(100);
    expect(nodeBox(view, fresh ?? '')).toMatchObject({ width: 268, height: 104 });
  });

  test('measuring nodes rendered by panning keeps the centre node in place, even with an off-screen selection', async () => {
    const { view } = await openBig();
    view.setTransform({ x: 0, y: 0, zoom: 1 });
    await vi.advanceTimersByTimeAsync(20);
    contentOf(view, 'Big').click();
    expect(view.selectedId).toBe('Big');
    view.setTransform({ x: -300, y: -3000, zoom: 1 });
    await vi.advanceTimersByTimeAsync(20);
    const shown = [...view.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-node')].map(
      (el) => el.dataset.nodeId ?? '',
    );
    const t = view.getTransform();
    const screenCenter = (id: string) => {
      const b = nodeBox(view, id);
      return { x: (b.x + b.width / 2) * t.zoom + t.x, y: (b.y + b.height / 2) * t.zoom + t.y };
    };
    const dist = (id: string) => {
      const c = screenCenter(id);
      return (c.x - 400) ** 2 + (c.y - 300) ** 2;
    };
    const centre = shown.reduce((best, id) => (dist(id) < dist(best) ? id : best));
    const centreBox = nodeBox(view, centre);
    const above = shown
      .filter((id) => {
        const b = nodeBox(view, id);
        return b.x === centreBox.x && b.y < centreBox.y;
      })
      .reduce((best, id) => (nodeBox(view, id).y > nodeBox(view, best).y ? id : best));
    const before = screenOf(view, centre);
    report(view, above, 250, 200);
    await vi.advanceTimersByTimeAsync(100);
    const after = screenOf(view, centre);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test('live update and collapse on a culled map keep the DOM bounded and edges complete', async () => {
    const { view, ws } = await openBig();
    view.resetZoom();
    await vi.advanceTimersByTimeAsync(20);
    const bigger = bigNote(41, 49);
    ws.metadataCache.caches.set('Big.md', bigger.cache);
    ws.metadataCache.trigger('Big.md', bigger.text, bigger.cache);
    await vi.advanceTimersByTimeAsync(320);
    expect(view.contentEl.querySelectorAll('path.mind-mapper-edge')).toHaveLength(2050);
    expect(domNodes(view)).toBeLessThanOrEqual(400);
    view.collapseAll();
    await vi.advanceTimersByTimeAsync(20);
    expect(view.contentEl.querySelectorAll('path.mind-mapper-edge')).toHaveLength(41);
    expect(domNodes(view)).toBeLessThanOrEqual(42);
  });
});

test('the first layout after a loading message is culled (the canvas is shown before it is laid out)', async () => {
  vi.useFakeTimers();
  const ws = new FakeWorkspace();
  const leaf = { app: ws.app, setViewState: vi.fn(() => Promise.resolve()) };
  const view = new MindMapView(leaf as unknown as WorkspaceLeaf, { settings: () => LTR_SETTINGS });
  const { text, cache } = bigNote(40, 49);
  ws.vault.texts.set('Big.md', text);
  await view.onOpen();
  const canvas = view.contentEl.querySelector<HTMLElement>('.mind-mapper-canvas');
  if (!canvas) throw new Error('no canvas');
  // like a browser: a hidden element has no size
  for (const [key, value] of [
    ['clientWidth', 800],
    ['clientHeight', 600],
  ] as const) {
    Object.defineProperty(canvas, key, {
      configurable: true,
      get: () => (canvas.hidden ? 0 : value),
    });
  }
  await view.setState(...state('Big.md'));
  expect(placeholderText(view)).toBe('Loading…');
  ws.metadataCache.caches.set('Big.md', cache);
  ws.metadataCache.trigger('Big.md', text, cache);
  expect(domNodes(view)).toBeLessThanOrEqual(400);
  vi.useRealTimers();
});

describe('start collapsed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const COLLAPSED = ['Live', 'Live/#1', 'Live/Beta', 'Live/Delta'];
  const EXPANDED = [...COLLAPSED, 'Live/Beta/#1', 'Live/Delta/#1'];

  function collapseLabel(view: MindMapView): string | null | undefined {
    return view.contentEl
      .querySelector('.mind-mapper-controls button:nth-child(5)')
      ?.getAttribute('aria-label');
  }

  function shown(view: MindMapView): (string | undefined)[] {
    return nodeIds(view).sort();
  }

  async function edit(ws: FakeWorkspace, fixtureName: string): Promise<void> {
    change(ws, 'Note.md', fixtureName);
    await vi.advanceTimersByTimeAsync(300);
  }

  test('mind-mapper-collapsed: true opens with root and first level, the button shows Expand all', async () => {
    const { view } = await openWith('fm-collapsed', { settings: () => LTR_SETTINGS });
    expect(shown(view)).toEqual(COLLAPSED.sort());
    expect(collapseLabel(view)).toBe('Expand all');
  });

  test('the setting starts a note without the key collapsed', async () => {
    const settings = { ...LTR_SETTINGS, startCollapsed: true };
    const { view } = await openWith('live-before', { settings: () => settings });
    expect(shown(view)).toEqual(COLLAPSED.sort());
  });

  test('mind-mapper-collapsed: false overrides the setting', async () => {
    const settings = { ...LTR_SETTINGS, startCollapsed: true };
    const { view } = await openWith('fm-collapsed-false', { settings: () => settings });
    expect(shown(view)).toEqual(EXPANDED.sort());
    expect(collapseLabel(view)).toBe('Collapse all');
  });

  test('flipping the key while open expands all (true to false) and collapses all (false to true)', async () => {
    const { view, ws } = await openWith('fm-collapsed', { settings: () => LTR_SETTINGS });
    await edit(ws, 'fm-collapsed-false');
    expect(shown(view)).toEqual(EXPANDED.sort());
    view.toggleCollapse('Live/Beta');
    await edit(ws, 'fm-collapsed');
    expect(shown(view)).toEqual(COLLAPSED.sort());
    // removing the key falls back to the setting (false): a flip as well
    await edit(ws, 'live-before');
    expect(shown(view)).toEqual(EXPANDED.sort());
  });

  test('a live edit that keeps the value does not undo the user clicks', async () => {
    const { view, ws } = await openWith('fm-collapsed', { settings: () => LTR_SETTINGS });
    view.toggleCollapse('Live/Delta');
    await edit(ws, 'fm-collapsed');
    expect(nodeIds(view)).toContain('Live/Delta/#1');
    expect(nodeIds(view)).not.toContain('Live/Beta/#1');
    view.expandAll();
    await edit(ws, 'fm-collapsed');
    expect(shown(view)).toEqual(EXPANDED.sort());
  });

  test('a collapsed start is collapse-all mode: a new branch stays collapsed, one expanded by hand stays expanded', async () => {
    const { view, ws } = await openWith('fm-collapsed', { settings: () => LTR_SETTINGS });
    view.toggleCollapse('Live/Delta');
    await edit(ws, 'fm-collapsed-renamed');
    expect(nodeIds(view)).toContain('Live/Gamma');
    expect(nodeIds(view)).not.toContain('Live/Gamma/#1');
    expect(nodeIds(view)).toContain('Live/Delta/#1');
  });

  test('changing the setting flips notes without the key once; notes with the key keep theirs', async () => {
    const settings = { ...LTR_SETTINGS };
    const { view } = await openWith('live-before', { settings: () => settings });
    const keyed = await openWith('fm-collapsed-false', { settings: () => settings });
    settings.startCollapsed = true;
    view.refresh();
    keyed.view.refresh();
    expect(shown(view)).toEqual(COLLAPSED.sort());
    expect(shown(keyed.view)).toEqual(EXPANDED.sort());
    view.toggleCollapse('Live/Beta');
    settings.levelGap = 80;
    view.refresh();
    expect(nodeIds(view)).toContain('Live/Beta/#1');
    settings.startCollapsed = false;
    view.refresh();
    expect(shown(view)).toEqual(EXPANDED.sort());
  });

  test.each([
    [false, EXPANDED],
    [true, COLLAPSED],
  ])(
    'an invalid mind-mapper-collapsed falls back to the setting %j with a notice',
    async (startCollapsed, expected) => {
      const warnOnce = vi.fn();
      const settings = { ...LTR_SETTINGS, startCollapsed };
      const { view } = await openWith('fm-collapsed-invalid (warning expected)', {
        warnOnce,
        settings: () => settings,
      });
      expect(shown(view)).toEqual([...expected].sort());
      expect(warnOnce).toHaveBeenCalledWith(
        'Note.md\0mind-mapper-collapsed\0yes',
        `Mind Mapper: mind-mapper-collapsed "yes" in Note.md is not true or false, using ${startCollapsed}`,
      );
    },
  );

  test('switching the view to another note applies the value of that note', async () => {
    const { view, ws } = await openWith('fm-collapsed', { settings: () => LTR_SETTINGS });
    ws.addNote('Other.md', 'live-before');
    await view.setState(...state('Other.md'));
    expect(shown(view)).toEqual(EXPANDED.sort());
    await view.setState(...state('Note.md'));
    expect(shown(view)).toEqual(COLLAPSED.sort());
  });

  test('switching from an expanded collapsed-start note to another collapsed-start note opens it collapsed', async () => {
    const { view, ws } = newView();
    ws.addNote('A.md', 'fm-collapsed');
    ws.addNote('B.md', 'fm-collapsed');
    await setSize(view, 800, 600);
    await view.setState(...state('A.md'));
    view.expandAll();
    expect(shown(view)).toEqual(EXPANDED.sort());
    await view.setState(...state('B.md'));
    expect(shown(view)).toEqual(COLLAPSED.sort());
  });

  test('renaming a collapsed-start note keeps the branch expanded by hand', async () => {
    const { view, ws } = newView();
    ws.addNote('Note.md', 'fm-collapsed');
    await setSize(view, 800, 600);
    await view.setState(...state('Note.md'));
    view.toggleCollapse('Live/Delta');
    rename(ws, 'Note.md', 'Renamed.md', 'fm-collapsed');
    await vi.advanceTimersByTimeAsync(0);
    expect(view.file).toBe('Renamed.md');
    expect(nodeIds(view)).toContain('Live/Delta/#1');
    expect(nodeIds(view)).not.toContain('Live/Beta/#1');
  });

  test('an invalid value with the setting on, edited to true, is no flip: the clicks stay', async () => {
    const settings = { ...LTR_SETTINGS, startCollapsed: true };
    const { view, ws } = await openWith('fm-collapsed-invalid (warning expected)', {
      warnOnce: () => {},
      settings: () => settings,
    });
    expect(shown(view)).toEqual(COLLAPSED.sort());
    view.expandAll();
    await edit(ws, 'fm-collapsed');
    expect(shown(view)).toEqual(EXPANDED.sort());
  });
});

describe('collapse that hides the selected node', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('collapse all moves the selection to the nearest visible ancestor and keeps it in place', async () => {
    const { view } = await openWorked();
    contentOf(view, 'Project/Tasks/#2').click();
    centerOn(view, 'Project/Tasks/#2');
    const before = screenOf(view, 'Project/Tasks');
    view.collapseAll();
    expect(view.selectedId).toBe('Project/Tasks');
    expect(selectedIds(view)).toEqual(['Project/Tasks']);
    const after = screenOf(view, 'Project/Tasks');
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test('collapsing a branch moves the selection from a hidden descendant to the branch', async () => {
    const { view } = await openWorked();
    contentOf(view, 'Project/Tasks/#1').click();
    const before = screenOf(view, 'Project/Tasks');
    toggleOf(view, 'Project/Tasks').click();
    expect(view.selectedId).toBe('Project/Tasks');
    expect(selectedIds(view)).toEqual(['Project/Tasks']);
    const after = screenOf(view, 'Project/Tasks');
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test('a start-collapsed flip by a live edit moves the selection and keeps it in place', async () => {
    const { view, ws } = await openWith('fm-collapsed-false', { settings: () => LTR_SETTINGS });
    contentOf(view, 'Live/Delta/#1').click();
    centerOn(view, 'Live/Delta/#1');
    const before = screenOf(view, 'Live/Delta');
    change(ws, 'Note.md', 'fm-collapsed');
    await vi.advanceTimersByTimeAsync(300);
    expect(nodeIds(view)).not.toContain('Live/Delta/#1');
    expect(view.selectedId).toBe('Live/Delta');
    expect(selectedIds(view)).toEqual(['Live/Delta']);
    const after = screenOf(view, 'Live/Delta');
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });
});

test('in German the title, placeholders and empty-note hint are German', async () => {
  useGerman();
  const { view } = newView();
  await view.onOpen();
  expect(view.getDisplayText()).toBe('Mindmap');
  expect(placeholderText(view)).toBe('Keine Notiz ausgewählt');
  await view.setState(...state('gone/Old.md'));
  expect(placeholderText(view)).toBe('Notiz nicht gefunden: gone/Old.md');
  expect(view.contentEl.querySelector('.mind-mapper-hint')?.textContent).toBe(
    'Diese Notiz hat noch keinen Inhalt',
  );
  expect(
    view.contentEl.querySelector('.mind-mapper-controls [aria-label="Vergrößern"]'),
  ).not.toBeNull();
});

test('the placeholder and the empty-note hint carry their data-mm-id (issue #33)', async () => {
  const { view } = newView();
  await view.onOpen();
  const mmId = (cls: string) => view.contentEl.querySelector(cls)?.getAttribute('data-mm-id');
  expect(mmId('.mind-mapper-placeholder')).toBe('map.placeholder');
  expect(mmId('.mind-mapper-hint')).toBe('map.empty-hint');
});
