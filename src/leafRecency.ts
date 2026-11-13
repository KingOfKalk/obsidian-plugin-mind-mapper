import { MarkdownView, type Workspace, type WorkspaceLeaf } from 'obsidian';

/**
 * Order in which leaves were last active, fed by `active-leaf-change` (the public API has no
 * per-leaf activity time). A counter, not a clock: ties cannot happen.
 */
export class LeafRecency {
  private readonly order = new WeakMap<WorkspaceLeaf, number>();
  private counter = 0;

  touch(leaf: WorkspaceLeaf | null): void {
    if (leaf) this.order.set(leaf, ++this.counter);
  }

  /** The most recently active leaf; never active ones count as oldest, the first one wins ties. */
  mostRecent(leaves: WorkspaceLeaf[]): WorkspaceLeaf | null {
    let best: WorkspaceLeaf | null = null;
    let bestOrder = -1;
    for (const leaf of leaves) {
      const order = this.order.get(leaf) ?? 0;
      if (order > bestOrder) {
        best = leaf;
        bestOrder = order;
      }
    }
    return best;
  }
}

/** Most recently active markdown leaf other than the map, optionally showing the note at `path`. */
export function pickNoteLeaf(
  workspace: Workspace,
  recency: LeafRecency,
  opts: { mapLeaf: WorkspaceLeaf | null; path?: string },
): WorkspaceLeaf | null {
  const candidates = workspace
    .getLeavesOfType('markdown')
    .filter((leaf) => leaf !== opts.mapLeaf)
    .filter((leaf) => opts.path === undefined || leafFile(leaf) === opts.path);
  return recency.mostRecent(candidates);
}

/** File of a note leaf; a restored tab that is not loaded yet only has it in its view state. */
function leafFile(leaf: WorkspaceLeaf): string | undefined {
  if (leaf.view instanceof MarkdownView && leaf.view.file) return leaf.view.file.path;
  const state = leaf.getViewState().state as { file?: unknown } | undefined;
  return typeof state?.file === 'string' ? state.file : undefined;
}
