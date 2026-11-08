import type { MindMapNode } from '../parser/types';
import { fnv1a } from '../util/hash';
import { type Clip, NODE_LIMITS } from './nodeSize';
import type { Size } from './types';

interface Measured {
  size: Size;
  clip: Clip;
}

/**
 * Measured node sizes keyed by the render cache key (content hash + max width, spec
 * "Node identity"), so they survive ID shifts and reopening the same content.
 */
export class SizeCache {
  private readonly entries = new Map<string, Measured>();

  get(node: MindMapNode): Measured | undefined {
    return this.entries.get(cacheKey(node));
  }

  /** Keeps only the entries of these nodes (e.g. the current tree after a live update). */
  retain(nodes: Iterable<MindMapNode>): void {
    const keep = new Set<string>();
    for (const node of nodes) keep.add(cacheKey(node));
    for (const key of [...this.entries.keys()]) if (!keep.has(key)) this.entries.delete(key);
  }

  /** Returns true if the stored size or clip state changed (sub-pixel differences ignored). */
  set(node: MindMapNode, measured: Measured): boolean {
    const key = cacheKey(node);
    const previous = this.entries.get(key);
    this.entries.set(key, measured);
    return (
      !previous ||
      previous.clip.x !== measured.clip.x ||
      previous.clip.y !== measured.clip.y ||
      Math.abs(previous.size.width - measured.size.width) >= 0.5 ||
      Math.abs(previous.size.height - measured.size.height) >= 0.5
    );
  }
}

export function cacheKey(node: MindMapNode): string {
  return `${fnv1a(node.markdown)}:${NODE_LIMITS.maxWidth}`;
}
