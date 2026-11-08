import { walk } from '../parser/treeWalk';
import type { MindMapTree } from '../parser/types';

/** Collapsed node IDs of one map view, in memory for the session (spec "Node identity"). */
export class CollapseState {
  private readonly ids = new Set<string>();

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
    for (const child of tree.root.children) {
      walk(child, (node) => {
        if (node.children.length > 0) this.ids.add(node.id);
      });
    }
  }

  expandAll(): void {
    this.ids.clear();
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
