import type { Workspace } from 'obsidian';
import { isMindMapSource, openMindMap } from '../../src/commands/openMindMap';
import { FakeWorkspace, fakeFile } from '../helpers';

function asWorkspace(ws: FakeWorkspace): Workspace {
  return ws as unknown as Workspace;
}

test.each([
  ['Note.md', true],
  ['Board.canvas', false],
  ['Doc.pdf', false],
  ['img.png', false],
])('isMindMapSource(%s) -> %s', (path, expected) => {
  expect(isMindMapSource(fakeFile(path))).toBe(expected);
});

test('isMindMapSource(null) -> false', () => {
  expect(isMindMapSource(null)).toBe(false);
});

test('opens a new vertical split with the file state', async () => {
  const ws = new FakeWorkspace();
  const leaf = await openMindMap(asWorkspace(ws), fakeFile('a/Note.md'));
  expect(ws.getLeaf).toHaveBeenCalledWith('split', 'vertical');
  expect(ws.leaves).toHaveLength(1);
  expect(ws.leaves[0]?.setViewState).toHaveBeenCalledWith({
    type: 'mind-mapper-view',
    active: true,
    state: { file: 'a/Note.md' },
  });
  expect(ws.revealLeaf).toHaveBeenCalledWith(leaf);
});

test('reveals an existing map for the same file instead of splitting', async () => {
  const ws = new FakeWorkspace();
  const existing = ws.addLeaf({ type: 'mind-mapper-view', state: { file: 'a/Note.md' } });
  const leaf = await openMindMap(asWorkspace(ws), fakeFile('a/Note.md'));
  expect(ws.getLeaf).not.toHaveBeenCalled();
  expect(leaf).toBe(existing.asLeaf());
  expect(ws.revealLeaf).toHaveBeenCalledWith(existing.asLeaf());
});

test('map for a different file does not count', async () => {
  const ws = new FakeWorkspace();
  ws.addLeaf({ type: 'mind-mapper-view', state: { file: 'b/Other.md' } });
  await openMindMap(asWorkspace(ws), fakeFile('a/Note.md'));
  expect(ws.getLeaf).toHaveBeenCalledWith('split', 'vertical');
  expect(ws.leaves).toHaveLength(2);
});
