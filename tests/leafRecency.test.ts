import type { Workspace, WorkspaceLeaf } from 'obsidian';
import { LeafRecency, pickNoteLeaf } from '../src/leafRecency';
import { fakeFile } from './helpers';
import { MarkdownView } from './mocks/obsidian';

/** A `markdown` leaf shows a real `MarkdownView`; other types a plain view object. */
function leaf(type: string, path?: string): WorkspaceLeaf {
  const file = path ? fakeFile(path) : null;
  const view =
    type === 'markdown'
      ? Object.assign(new MarkdownView(), { file })
      : { getViewType: () => type, file };
  return {
    view,
    getViewState: () => ({ type, state: path ? { file: path } : {} }),
  } as unknown as WorkspaceLeaf;
}

/** A restored tab not shown yet: no loaded view, only the stored view state. */
function deferredLeaf(type: string, path: string): WorkspaceLeaf {
  return {
    view: { getViewType: () => type },
    getViewState: () => ({ type, state: { file: path } }),
  } as unknown as WorkspaceLeaf;
}

function workspaceWith(leaves: WorkspaceLeaf[]): Workspace {
  return {
    getLeavesOfType: (type: string) => leaves.filter((l) => l.view.getViewType() === type),
  } as unknown as Workspace;
}

test('mostRecent prefers the last touched leaf', () => {
  const recency = new LeafRecency();
  const [a, b, c] = [leaf('markdown'), leaf('markdown'), leaf('markdown')];
  expect(recency.mostRecent([a, b, c])).toBe(a);
  recency.touch(c);
  recency.touch(b);
  expect(recency.mostRecent([a, b, c])).toBe(b);
  recency.touch(c);
  expect(recency.mostRecent([a, b, c])).toBe(c);
  recency.touch(null);
  expect(recency.mostRecent([])).toBeNull();
});

test('pickNoteLeaf skips the map leaf and leaves of other files', () => {
  const recency = new LeafRecency();
  const map = leaf('markdown', 'Note.md');
  const other = leaf('markdown', 'Other.md');
  const note = leaf('markdown', 'Note.md');
  const ws = workspaceWith([map, other, note, leaf('mind-mapper-view', 'Note.md')]);
  recency.touch(note);
  recency.touch(other);
  recency.touch(map);
  expect(pickNoteLeaf(ws, recency, { mapLeaf: map, path: 'Note.md' })).toBe(note);
  expect(pickNoteLeaf(ws, recency, { mapLeaf: map })).toBe(other);
  expect(pickNoteLeaf(ws, recency, { mapLeaf: map, path: 'Missing.md' })).toBeNull();
});

test('pickNoteLeaf finds a tab of the note that is not loaded yet', () => {
  const recency = new LeafRecency();
  const tab = deferredLeaf('markdown', 'Note.md');
  const ws = workspaceWith([leaf('markdown', 'Other.md'), tab]);
  expect(pickNoteLeaf(ws, recency, { mapLeaf: null, path: 'Note.md' })).toBe(tab);
});

test('pickNoteLeaf reads the loaded file only from a Markdown view', () => {
  // reports the markdown type and a file, but is not a MarkdownView and has no file in its state
  const odd = {
    view: { getViewType: () => 'markdown', file: { path: 'Note.md' } },
    getViewState: () => ({ type: 'markdown', state: {} }),
  } as unknown as WorkspaceLeaf;
  const ws = workspaceWith([odd]);
  expect(pickNoteLeaf(ws, new LeafRecency(), { mapLeaf: null, path: 'Note.md' })).toBeNull();
});
