import { walk } from '../parser/treeWalk';
import type { MindMapTree } from '../parser/types';

/** Collapsed node IDs of one map view, in memory for the session (spec "Node identity"). */
export class CollapseState {
  private readonly ids = new Set<string>();
  /** Collapse-all mode (spec "Collapse all mode"): from `collapseAll` until `expandAll`. */
  private allMode = false;

  get size(): number {
    return this.ids.size;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  toggle(id: string): void {
    if (!this.ids.delete(id)) this.ids.add(id);
  }

  /** Collapses every node with children except the root: root and first level stay visible. */
  collapseAll(tree: MindMapTree): void {
    this.allMode = true;
    for (const child of tree.root.children) {
      walk(child, (node) => {
        if (node.children.length > 0) this.ids.add(node.id);
      });
    }
  }

  /** Another note: nothing collapsed, collapse-all mode off. */
  reset(): void {
    this.expandAll();
  }

  expandAll(): void {
    this.allMode = false;
    this.ids.clear();
  }

  /**
   * After a live change: prunes, and in collapse-all mode collapses every node that newly has
   * children (new or moved ID, or no children before). Branches expanded by hand stay expanded.
   * `previous` is null when no tree was shown (first load, after "Note was deleted").
   */
  update(previous: MindMapTree | null, next: MindMapTree): void {
    this.prune(next);
    if (!this.allMode) return;
    // The previous root never counts: it was never collapsible (e.g. text typed above the H1).
    const hadChildren = new Set<string>();
    for (const child of previous?.root.children ?? []) {
      walk(child, (node) => {
        if (node.children.length > 0) hadChildren.add(node.id);
      });
    }
    for (const child of next.root.children) {
      walk(child, (node) => {
        if (node.children.length > 0 && !hadChildren.has(node.id)) this.ids.add(node.id);
      });
    }
  }

  /** Drops IDs that are gone from the tree or no longer have children. */
  prune(tree: MindMapTree): void {
    const keep = new Set<string>();
    walk(tree.root, (node) => {
      if (node.children.length > 0 && this.ids.has(node.id)) keep.add(node.id);
    });
    for (const id of [...this.ids]) if (!keep.has(id)) this.ids.delete(id);
  }
}
