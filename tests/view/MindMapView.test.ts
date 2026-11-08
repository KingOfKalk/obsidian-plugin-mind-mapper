import type { WorkspaceLeaf } from 'obsidian';
import { DEFAULT_LAYOUT, layoutTree } from '../../src/layout/tidyTree';
import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import { fitToBounds, IDENTITY } from '../../src/render/viewport';
import { MindMapView } from '../../src/view/MindMapView';
import { loadFixture } from '../fixtures';
import { FakeWorkspace } from '../helpers';

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

test('renders the worked example as three nodes and two edges', async () => {
  const { view, ws } = newView();
  ws.addNote('Worked example.md', 'worked-example');
  await view.onOpen();
  await view.setState(...state('Worked example.md'));
  expect(placeholderText(view)).toBeNull();
  expect(nodeIds(view)).toEqual(['Project', 'Project/Tasks', 'Project/Notes']);
  expect(view.contentEl.querySelectorAll('path.mind-mapper-edge')).toHaveLength(2);
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
  await vi.waitFor(() => expect(nodeIds(view)).toHaveLength(3));
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
    nodeSize: () => ({ width: DEFAULT_LAYOUT.nodeWidth, height: DEFAULT_LAYOUT.nodeHeight }),
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
