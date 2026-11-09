import { type CachedMetadata, MarkdownRenderer, type WorkspaceLeaf } from 'obsidian';
import { estimateSize } from '../../src/layout/nodeSize';
import { DEFAULT_LAYOUT, layoutTree } from '../../src/layout/tidyTree';
import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import { fitToBounds, IDENTITY } from '../../src/render/viewport';
import { NodeContentModal } from '../../src/render/NodeContentModal';
import { DEFAULT_SETTINGS, type MindMapSettings } from '../../src/settings';
import { MindMapView, type ViewServices } from '../../src/view/MindMapView';
import { loadFixture } from '../fixtures';
import { FakeWorkspace, fakeFile } from '../helpers';
import {
  type Component as MockComponent,
  Modal as MockModal,
  type Scope as MockScope,
} from '../mocks/obsidian';

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
  return view.contentEl.querySelector('[aria-label="Reset zoom to 100%"]')?.textContent;
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
  await view.onOpen();
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
    siblingGap: DEFAULT_LAYOUT.siblingGap,
    levelGap: DEFAULT_LAYOUT.levelGap,
    nodeSize: estimateSize,
  });
  return fitToBounds(layout.bounds, { width, height });
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
  expect(view.getTransform().zoom).toBeCloseTo(1.2);
  expect(resetLabel(view)).toBe('120%');
  view.zoomOut();
  view.zoomOut();
  expect(view.getTransform().zoom).toBeCloseTo(1 / 1.2);
  view.fitToView();
  expect(view.getTransform()).toEqual(expectedFit('worked-example', 'Note', 800, 600));
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
  await view.onOpen();
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
  await view.onOpen();
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
  await view.onOpen();
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
    expect(view.getTransform()).toEqual(fitToBounds(bounds, { width: 800, height: 600 }));
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
    change(ws, 'Live.md', 'live-after');
    await vi.advanceTimersByTimeAsync(300);
    // a later re-measure must not fit either: the live update ended the automatic fit
    report(view, 'Live/#1', 300, 200);
    await vi.advanceTimersByTimeAsync(100);
    expect(view.getTransform().zoom).toBe(1);
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
    expect(setViewState).toHaveBeenCalledWith({
      type: 'mind-mapper-view',
      state: { file: 'Folder/Renamed.md' },
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

  test('mind-mapper-title replaces the root label, the root id stays', async () => {
    const { view } = await openWith('fm-layout', {});
    expect(contentOf(view, 'Root').textContent).toBe('Custom title');
  });

  test('an invalid mind-mapper-layout falls back to the setting and is reported on every load', async () => {
    const warnOnce = vi.fn();
    const { view, ws } = await openWith('fm-invalid', {
      warnOnce,
      settings: () => LTR_SETTINGS,
    });
    expect(centerX(view, 'Root/B')).toBeGreaterThan(centerX(view, 'Root'));
    expect(warnOnce).toHaveBeenCalledWith(
      'Note.md\0mind-mapper-layout\0spiral',
      'Mind Mapper: unknown mind-mapper-layout "spiral" in Note.md, using left-to-right',
    );
    change(ws, 'Note.md', 'fm-invalid');
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

function escHandlers(view: MindMapView): MockScope['handlers'] {
  return ((view.scope as unknown as MockScope | null)?.handlers ?? []).filter(
    (h) => h.key === 'Escape',
  );
}

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
