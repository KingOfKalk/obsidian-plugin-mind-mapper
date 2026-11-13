import type { MindMapNode } from '../parser/types';
import type { TagPosition } from '../tagPositions';
import type { Clip, NodeLimits } from './nodeSize';
import type { Size } from './types';

export interface Measured {
  size: Size;
  clip: Clip;
  /** The tag row below the box (tag position `outside`, issue #103); null or absent: none. */
  tags?: Size | null;
}

/**
 * Measured node sizes keyed by content (the markdown itself, so no two contents share an entry)
 * plus what changes the rendered size (spec "Node identity"), so they survive ID shifts and
 * reopening the same content. Lookups hash nothing themselves: the markdown strings come from the
 * tree and the engine keeps their hash.
 */
export class SizeCache {
  /** Variant (root styling, max node size) -> markdown -> measured. */
  private entries = new Map<string, Map<string, Measured>>();

  constructor(
    private readonly limits: () => NodeLimits,
    private readonly tagPosition: () => TagPosition = () => 'outside',
  ) {}

  get(node: MindMapNode): Measured | undefined {
    return this.entries.get(this.variant(node))?.get(node.markdown);
  }

  /** Keeps only the entries of these nodes (e.g. the current tree after a live update). */
  retain(nodes: Iterable<MindMapNode>): void {
    const kept = new Map<string, Map<string, Measured>>();
    for (const node of nodes) {
      const key = this.variant(node);
      const measured = this.entries.get(key)?.get(node.markdown);
      if (!measured) continue;
      let byMarkdown = kept.get(key);
      if (!byMarkdown) kept.set(key, (byMarkdown = new Map<string, Measured>()));
      byMarkdown.set(node.markdown, measured);
    }
    this.entries = kept;
  }

  /** Returns true if the stored size or clip state changed (sub-pixel differences ignored). */
  set(node: MindMapNode, measured: Measured): boolean {
    const key = this.variant(node);
    let byMarkdown = this.entries.get(key);
    if (!byMarkdown) this.entries.set(key, (byMarkdown = new Map<string, Measured>()));
    const previous = byMarkdown.get(node.markdown);
    byMarkdown.set(node.markdown, measured);
    return (
      !previous ||
      previous.clip.x !== measured.clip.x ||
      previous.clip.y !== measured.clip.y ||
      Math.abs(previous.size.width - measured.size.width) >= 0.5 ||
      Math.abs(previous.size.height - measured.size.height) >= 0.5 ||
      rowChanged(previous.tags ?? null, measured.tags ?? null)
    );
  }

  /**
   * What changes the rendered size besides the content: root styling, the max node size and the
   * tag position (outside, trailing tags leave the box).
   */
  private variant(node: MindMapNode): string {
    const kind = node.kind === 'root' ? 'root' : 'node';
    const { maxWidth, maxHeight } = this.limits();
    return `${kind}:${maxWidth}x${maxHeight}:${this.tagPosition()}`;
  }
}

function rowChanged(a: Size | null, b: Size | null): boolean {
  if (!a || !b) return a !== b;
  return Math.abs(a.width - b.width) >= 0.5 || Math.abs(a.height - b.height) >= 0.5;
}
