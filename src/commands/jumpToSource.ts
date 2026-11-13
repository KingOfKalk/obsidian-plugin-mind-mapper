import { type App, MarkdownView, type WorkspaceLeaf } from 'obsidian';
import { type LeafRecency, pickNoteLeaf } from '../leafRecency';

/**
 * Spec "Jump to source target": the most recently active leaf showing the note, else a vertical
 * split next to the map; never the map leaf. Puts the cursor on `line` (top for the virtual root).
 */
export async function jumpToSource(
  app: App,
  recency: LeafRecency,
  mapLeaf: WorkspaceLeaf | null,
  path: string,
  line: number | null,
): Promise<void> {
  const file = app.vault.getFileByPath(path);
  if (!file) return;
  const { workspace } = app;
  const target =
    pickNoteLeaf(workspace, recency, { mapLeaf, path }) ??
    (mapLeaf
      ? workspace.createLeafBySplit(mapLeaf, 'vertical')
      : workspace.getLeaf('split', 'vertical'));
  const cursorLine = line ?? 0;
  await target.openFile(file, { active: true, eState: { line: cursorLine } });
  await workspace.revealLeaf(target);
  const view = target.view;
  if (view instanceof MarkdownView && view.getMode() === 'source') {
    const pos = { line: cursorLine, ch: 0 };
    view.editor.setCursor(pos);
    view.editor.scrollIntoView({ from: pos, to: pos }, true);
  }
}
