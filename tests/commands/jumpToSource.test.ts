import type { App, WorkspaceLeaf } from 'obsidian';
import { jumpToSource } from '../../src/commands/jumpToSource';
import { LeafRecency } from '../../src/view/leafRecency';
import { fakeFile } from '../helpers';

interface TestLeaf {
  view: {
    getViewType(): string;
    file: { path: string } | null;
    getMode(): string;
    editor: { setCursor: ReturnType<typeof vi.fn>; scrollIntoView: ReturnType<typeof vi.fn> };
  };
  openFile: ReturnType<typeof vi.fn>;
}

function noteLeaf(path: string | null, type = 'markdown'): TestLeaf {
  return {
    view: {
      getViewType: () => type,
      file: path ? { path } : null,
      getMode: () => 'source',
      editor: { setCursor: vi.fn(), scrollIntoView: vi.fn() },
    },
    openFile: vi.fn(() => Promise.resolve()),
  };
}

function setup(leaves: TestLeaf[]) {
  const split = noteLeaf(null);
  const workspace = {
    getLeavesOfType: (type: string) => leaves.filter((l) => l.view.getViewType() === type),
    createLeafBySplit: vi.fn(() => split),
    getLeaf: vi.fn(() => split),
    revealLeaf: vi.fn(() => Promise.resolve()),
  };
  const app = {
    workspace,
    vault: { getFileByPath: (path: string) => (path === 'Note.md' ? fakeFile(path) : null) },
  } as unknown as App;
  return { app, workspace, split };
}

const asLeaf = (l: TestLeaf) => l as unknown as WorkspaceLeaf;

test('jumpToSource reveals the most recent leaf of the note and sets the cursor line', async () => {
  const older = noteLeaf('Note.md');
  const recent = noteLeaf('Note.md');
  const { app, workspace } = setup([older, recent]);
  const recency = new LeafRecency();
  recency.touch(asLeaf(older));
  recency.touch(asLeaf(recent));
  await jumpToSource(app, recency, null, 'Note.md', 4);
  expect(recent.openFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'Note.md' }), {
    active: true,
    eState: { line: 4 },
  });
  expect(workspace.revealLeaf).toHaveBeenCalledWith(recent);
  expect(recent.view.editor.setCursor).toHaveBeenCalledWith({ line: 4, ch: 0 });
  expect(older.openFile).not.toHaveBeenCalled();
  expect(workspace.createLeafBySplit).not.toHaveBeenCalled();
});

test('jumpToSource opens a vertical split next to the map when the note is not open', async () => {
  const map = noteLeaf('Note.md', 'mind-mapper-view');
  const { app, workspace, split } = setup([map, noteLeaf('Other.md')]);
  await jumpToSource(app, new LeafRecency(), asLeaf(map), 'Note.md', 2);
  expect(workspace.createLeafBySplit).toHaveBeenCalledWith(map, 'vertical');
  expect(split.openFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'Note.md' }), {
    active: true,
    eState: { line: 2 },
  });
  expect(map.openFile).not.toHaveBeenCalled();
});

test('jumpToSource never uses the map leaf', async () => {
  // a map leaf that (wrongly) reports the markdown type and the note's file
  const map = noteLeaf('Note.md');
  const { app, split } = setup([map]);
  const recency = new LeafRecency();
  recency.touch(asLeaf(map));
  await jumpToSource(app, recency, asLeaf(map), 'Note.md', 0);
  expect(map.openFile).not.toHaveBeenCalled();
  expect(split.openFile).toHaveBeenCalled();
});

test('jumpToSource of the virtual root (line null) opens the note at the top', async () => {
  const note = noteLeaf('Note.md');
  const { app } = setup([note]);
  await jumpToSource(app, new LeafRecency(), null, 'Note.md', null);
  expect(note.openFile).toHaveBeenCalledWith(expect.anything(), {
    active: true,
    eState: { line: 0 },
  });
});
