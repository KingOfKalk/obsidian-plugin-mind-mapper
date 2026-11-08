import type { TFile, Workspace, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MIND_MAP } from '../constants';
import { parseViewState } from '../view/viewState';

export function isMindMapSource(file: TFile | null): file is TFile {
  return file?.extension === 'md';
}

/** Matches by stored view state, so deferred leaves (view not loaded yet) are found too. */
export function findMindMapLeaf(workspace: Workspace, path: string): WorkspaceLeaf | null {
  return (
    workspace
      .getLeavesOfType(VIEW_TYPE_MIND_MAP)
      .find((leaf) => parseViewState(leaf.getViewState().state).file === path) ?? null
  );
}

export async function openMindMap(workspace: Workspace, file: TFile): Promise<WorkspaceLeaf> {
  let leaf = findMindMapLeaf(workspace, file.path);
  if (!leaf) {
    leaf = workspace.getLeaf('split', 'vertical');
    await leaf.setViewState({
      type: VIEW_TYPE_MIND_MAP,
      active: true,
      state: { file: file.path },
    });
  }
  await workspace.revealLeaf(leaf);
  return leaf;
}
