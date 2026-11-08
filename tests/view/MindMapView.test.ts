import type { WorkspaceLeaf } from 'obsidian';
import { MindMapView } from '../../src/view/MindMapView';
import { fakeApp } from '../helpers';

function newView(): MindMapView {
  const leaf = { app: fakeApp() } as unknown as WorkspaceLeaf;
  return new MindMapView(leaf);
}

function placeholderText(view: MindMapView): string | null | undefined {
  return view.contentEl.querySelector('.mind-mapper-placeholder')?.textContent;
}

test('new view has no file, title "Mind map", placeholder "No note selected"', async () => {
  const view = newView();
  await view.onOpen();
  expect(view.file).toBeNull();
  expect(view.getDisplayText()).toBe('Mind map');
  expect(placeholderText(view)).toBe('No note selected');
});

test('setState({file}) round-trips through getState and sets title', async () => {
  const view = newView();
  await view.setState({ file: 'Notizen/Über Ärger 🚀.md' }, { history: false });
  expect(view.getState().file).toBe('Notizen/Über Ärger 🚀.md');
  expect(view.getDisplayText()).toBe('Über Ärger 🚀');
  expect(placeholderText(view)).toBe('Mind map: Notizen/Über Ärger 🚀.md');
});

test('setState with malformed state falls back to no file', async () => {
  const view = newView();
  await view.setState({ file: 'a.md' }, { history: false });
  await view.setState({ file: 42 }, { history: false });
  expect(view.file).toBeNull();
  expect(placeholderText(view)).toBe('No note selected');
});

test('getViewType and getIcon', () => {
  const view = newView();
  expect(view.getViewType()).toBe('mind-mapper-view');
  expect(view.getIcon()).toBe('network');
});
