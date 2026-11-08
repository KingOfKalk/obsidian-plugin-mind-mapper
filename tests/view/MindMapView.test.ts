import { MarkdownRenderer, type WorkspaceLeaf } from 'obsidian';
import { estimateSize } from '../../src/layout/nodeSize';
import { DEFAULT_LAYOUT, layoutTree } from '../../src/layout/tidyTree';
import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import { fitToBounds, IDENTITY } from '../../src/render/viewport';
import { NodeContentModal } from '../../src/render/NodeContentModal';
import { MindMapView } from '../../src/view/MindMapView';
import { loadFixture } from '../fixtures';
import { FakeWorkspace } from '../helpers';
import { type Component as MockComponent, Modal as MockModal } from '../mocks/obsidian';

function newView(ws = new FakeWorkspace()): { view: MindMapView; ws: FakeWorkspace } {
  const leaf = { app: ws.app } as unknown as WorkspaceLeaf;
  return { view: new MindMapView(leaf), ws };
}

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
    ['offsetWidth', Math.min(width, 304)],
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
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 16 * 8 + 16, height: 36 });
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
    expect(nodeBox(view, 'Project/#1').height).toBe(36);
    await vi.advanceTimersByTimeAsync(99);
    expect(nodeBox(view, 'Project/#1').height).toBe(36);
    await vi.advanceTimersByTimeAsync(1);
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 316, height: 212 });
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
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 216, height: 112 });
  });

  test('measured sizes are reused when the same markdown is shown again', async () => {
    const { view, ws } = await openWorked();
    report(view, 'Project/#1', 280, 50);
    await vi.advanceTimersByTimeAsync(100);
    ws.addNote('Other.md', 'skipped-levels');
    await view.setState(...state('Other.md'));
    await view.setState(...state('Note.md'));
    expect(nodeBox(view, 'Project/#1')).toMatchObject({ width: 296, height: 62 });
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
    expect(nodeBox(view, 'Project/#1').height).toBe(36);
    expect(view.getTransform()).toEqual({ x: 10, y: 300, zoom: 1 });
    setElSize(canvas, 800, 600);
    view.onResize();
    expect(nodeBox(view, 'Project/#1').height).toBe(212);
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
