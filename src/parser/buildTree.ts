import { childId, escapeSegment } from './nodeId';
import type { HeadingInput, MindMapNode, MindMapTree, ParserInput } from './types';

export function buildTree(input: ParserInput, fileName: string): MindMapTree {
  const h1s = input.headings.filter((h) => h.level === 1);
  const onlyH1 = h1s.length === 1 ? h1s[0] : undefined;
  const h1IsRoot =
    onlyH1 !== undefined &&
    (input.firstContentLine === null || input.firstContentLine >= onlyH1.line);

  const root: MindMapNode =
    h1IsRoot && onlyH1
      ? headingNode(escapeSegment(onlyH1.text), onlyH1, 'root')
      : { id: '', kind: 'root', label: fileName, level: 0, line: null, children: [] };

  const occurrences = new Map<MindMapNode, Map<string, number>>();
  const stack: MindMapNode[] = [root];
  for (const heading of input.headings) {
    if (h1IsRoot && heading === onlyH1) continue;
    while (stack.length > 1 && (stack[stack.length - 1]?.level ?? 0) >= heading.level) stack.pop();
    const parent = stack[stack.length - 1] ?? root;
    const seen = occurrences.get(parent) ?? new Map<string, number>();
    occurrences.set(parent, seen);
    const occurrence = (seen.get(heading.text) ?? 0) + 1;
    seen.set(heading.text, occurrence);
    const node = headingNode(childId(parent.id, heading.text, occurrence), heading, 'heading');
    parent.children.push(node);
    stack.push(node);
  }
  return { root };
}

function headingNode(id: string, heading: HeadingInput, kind: MindMapNode['kind']): MindMapNode {
  return { id, kind, label: heading.text, level: heading.level, line: heading.line, children: [] };
}
