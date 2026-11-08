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

/** Lines to node IDs; unmapped ends, self links and duplicates are dropped. */
export function crossLinks(tree: MindMapTree, inputs: CrossLinkInput[]): CrossLink[] {
  return unique(
    inputs.map((input) => ({
      fromId: nodeAtLine(tree, input.fromLine)?.id,
      toId: nodeAtLine(tree, input.toLine)?.id,
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
  return unique(links.map((link) => ({ fromId: shown(link.fromId), toId: shown(link.toId) })));
}

function unique(links: { fromId: string | undefined; toId: string | undefined }[]): CrossLink[] {
  const seen = new Set<string>();
  const result: CrossLink[] = [];
  for (const { fromId, toId } of links) {
    if (fromId === undefined || toId === undefined || fromId === toId) continue;
    const key = `${fromId}\n${toId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ fromId, toId });
  }
  return result;
}
