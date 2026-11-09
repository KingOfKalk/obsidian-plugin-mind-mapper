import { walk } from '../parser/treeWalk';
import type { MindMapNode, MindMapTree } from '../parser/types';

/** A same-note link: from the line it is written on to the line of its target heading or block. */
export interface CrossLinkInput {
  fromLine: number;
  toLine: number;
}

export interface CrossLink {
  fromId: string;
  toId: string;
  /** Line the link is written on (double click on its line jumps there). */
  line: number;
}

/** The node with the smallest line span containing `line`, or null (blank line, skipped content). */
export function nodeAtLine(tree: MindMapTree, line: number): MindMapNode | null {
  let best: MindMapNode | null = null;
  let bestSpan = Infinity;
  walk(tree.root, (node) => {
    if (node.line === null || node.endLine === undefined) return;
    if (line < node.line || line > node.endLine) return;
    const span = node.endLine - node.line;
    if (span < bestSpan) {
      best = node;
      bestSpan = span;
    }
  });
  return best;
}

/**
 * `nodeAtLine` as a lookup table built once per tree (cross-links are mapped on every edit).
 * Larger spans are written first, so the innermost node wins; among equal spans the first in
 * pre-order wins, like `nodeAtLine`.
 */
export function lineIndex(tree: MindMapTree): (line: number) => MindMapNode | null {
  const nodes: { node: MindMapNode; start: number; end: number }[] = [];
  walk(tree.root, (node) => {
    if (node.line !== null && node.endLine !== undefined) {
      nodes.push({ node, start: node.line, end: node.endLine });
    }
  });
  nodes.reverse();
  nodes.sort((a, b) => b.end - b.start - (a.end - a.start));
  const byLine = new Map<number, MindMapNode>();
  for (const { node, start, end } of nodes) {
    for (let line = start; line <= end; line++) byLine.set(line, node);
  }
  return (line) => byLine.get(line) ?? null;
}

/** Lines to node IDs; unmapped ends, self links and duplicates are dropped. */
export function crossLinks(tree: MindMapTree, inputs: CrossLinkInput[]): CrossLink[] {
  if (inputs.length === 0) return [];
  const at = lineIndex(tree);
  return unique(
    inputs.map((input) => ({
      fromId: at(input.fromLine)?.id,
      toId: at(input.toLine)?.id,
      line: input.fromLine,
    })),
  );
}

/**
 * Spec "Links": a collapsed source or target draws the line to the nearest visible ancestor.
 * Links whose ends meet in one node are not drawn.
 */
export function visibleCrossLinks(
  tree: MindMapTree,
  links: CrossLink[],
  visible: ReadonlySet<string>,
): CrossLink[] {
  const parents = new Map<string, string>();
  walk(tree.root, (node) => {
    for (const child of node.children) parents.set(child.id, node.id);
  });
  const shown = (id: string): string | undefined => {
    let current: string | undefined = id;
    while (current !== undefined && !visible.has(current)) current = parents.get(current);
    return current;
  };
  return unique(
    links.map((link) => ({ fromId: shown(link.fromId), toId: shown(link.toId), line: link.line })),
  );
}

/** Duplicates (same ends) keep the first link's line. */
function unique(
  links: { fromId: string | undefined; toId: string | undefined; line: number }[],
): CrossLink[] {
  const seen = new Set<string>();
  const result: CrossLink[] = [];
  for (const { fromId, toId, line } of links) {
    if (fromId === undefined || toId === undefined || fromId === toId) continue;
    const key = `${fromId}\n${toId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ fromId, toId, line });
  }
  return result;
}
