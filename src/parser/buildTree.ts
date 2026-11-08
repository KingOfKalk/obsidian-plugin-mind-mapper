import { childId, escapeSegment, ordinalId } from './nodeId';
import { itemMarkdown } from './listItems';
import { escapeBlockStart, isCommentSource, sliceMarkdown } from './nodeMarkdown';
import type {
  HeadingInput,
  ListItemInput,
  MindMapNode,
  MindMapTree,
  ParserInput,
  SectionInput,
} from './types';

/** Section types that never become nodes (spec "Skip"). */
const SKIPPED_TYPES = new Set(['yaml', 'comment', 'thematicBreak', 'html', 'footnoteDefinition']);
const LABEL_LENGTH = 200;

type Item = { line: number; heading: HeadingInput } | { line: number; section: SectionInput };

/** `title` (frontmatter `mind_map_title`) replaces the root's label, never its ID. */
export function buildTree(
  input: ParserInput,
  fileName: string,
  title: string | null = null,
): MindMapTree {
  const h1s = input.headings.filter((h) => h.level === 1);
  const onlyH1 = h1s.length === 1 ? h1s[0] : undefined;
  const h1IsRoot =
    onlyH1 !== undefined &&
    (input.firstContentLine === null || input.firstContentLine >= onlyH1.line);

  const root: MindMapNode =
    h1IsRoot && onlyH1
      ? headingNode(escapeSegment(onlyH1.text), onlyH1, 'root')
      : node({
          id: '',
          kind: 'root',
          markdown: escapeBlockStart(fileName),
          sectionType: null,
          level: 0,
          line: null,
        });

  if (title !== null) {
    root.markdown = escapeBlockStart(title);
    root.label = root.markdown.slice(0, LABEL_LENGTH);
  }

  const builder = new ChildBuilder();
  const stack: MindMapNode[] = [root];
  const current = (): MindMapNode => stack[stack.length - 1] ?? root;

  for (const item of orderedItems(input)) {
    if ('heading' in item) {
      const heading = item.heading;
      if (h1IsRoot && heading === onlyH1) continue;
      while (stack.length > 1 && current().level >= heading.level) stack.pop();
      const parent = current();
      const child = headingNode(builder.headingId(parent, heading.text), heading, 'heading');
      parent.children.push(child);
      stack.push(child);
    } else {
      for (const child of sectionNodes(item.section, input, current(), builder)) {
        current().children.push(child);
      }
    }
  }
  return { root };
}

/** Headings and non-heading sections in source order. */
function orderedItems(input: ParserInput): Item[] {
  const items: Item[] = [
    ...input.headings.map((heading) => ({ line: heading.line, heading })),
    ...(input.sections ?? [])
      .filter((s) => s.type !== 'heading')
      .map((section) => ({ line: section.startLine, section })),
  ];
  return items.sort((a, b) => a.line - b.line);
}

function sectionNodes(
  section: SectionInput,
  input: ParserInput,
  parent: MindMapNode,
  builder: ChildBuilder,
): MindMapNode[] {
  if (SKIPPED_TYPES.has(section.type)) return [];
  const text = input.text ?? '';
  const source = text.slice(section.startOffset, section.endOffset);
  if (source.trim() === '') return [];
  if (section.type === 'paragraph' && isCommentSource(source)) return [];
  if (section.type === 'list') return listNodes(section, input, parent, builder);

  const markdown = sliceMarkdown(text, section.startOffset, section.endOffset, input.embeds ?? []);
  const isParagraph = section.type === 'paragraph';
  return [
    node({
      id: builder.ordinalId(parent),
      kind: isParagraph ? 'paragraph' : 'block',
      markdown,
      sectionType: isParagraph ? null : section.type,
      level: 0,
      line: section.startLine,
    }),
  ];
}

/**
 * One node per list item of a `list` section; nested items attach to their parent item.
 * Only items inside list sections count (items inside quotes and callouts belong to that block).
 * Returns the top-level item nodes.
 */
function listNodes(
  section: SectionInput,
  input: ParserInput,
  parent: MindMapNode,
  builder: ChildBuilder,
): MindMapNode[] {
  const items = uniqueByLine(
    (input.listItems ?? []).filter(
      (item) => item.startLine >= section.startLine && item.startLine <= section.endLine,
    ),
  );
  const byLine = new Map<number, MindMapNode>();
  const topLevel: MindMapNode[] = [];
  for (const item of items) {
    const parentItem = byLine.get(parentLineOf(item, items) ?? -1);
    const nested = items.filter((other) => contains(item, other));
    const itemNode = node({
      id: builder.ordinalId(parentItem ?? parent),
      kind: 'list-item',
      markdown: itemMarkdown(input.text ?? '', item, input.embeds ?? [], nested),
      sectionType: null,
      level: 0,
      line: item.startLine,
    });
    byLine.set(item.startLine, itemNode);
    if (parentItem) parentItem.children.push(itemNode);
    else topLevel.push(itemNode);
  }
  return topLevel;
}

/**
 * Obsidian reports an item nested by block syntax on the same line (`- 1986. text`, `- + x`) as a
 * second item; that text belongs to the outer item.
 */
function uniqueByLine(items: ListItemInput[]): ListItemInput[] {
  const seen = new Set<number>();
  return items.filter((item) => !seen.has(item.startLine) && seen.add(item.startLine));
}

function contains(outer: ListItemInput, inner: ListItemInput): boolean {
  return inner.startLine > outer.startLine && inner.startLine <= outer.endLine;
}

/**
 * Parent item line. Obsidian reports a nested item followed by lazy continuation of its parent
 * (`- a`, `  - b`, blank, `  more of a`) as top-level; then the innermost containing item wins.
 */
function parentLineOf(item: ListItemInput, items: ListItemInput[]): number | null {
  if (item.parentLine >= 0) return item.parentLine;
  const containers = items.filter((other) => contains(other, item));
  return containers.length > 0 ? (containers[containers.length - 1]?.startLine ?? null) : null;
}

/** Hands out heading IDs (occurrence-indexed) and ordinal IDs per parent. */
class ChildBuilder {
  private readonly occurrences = new Map<MindMapNode, Map<string, number>>();
  private readonly ordinals = new Map<MindMapNode, number>();

  headingId(parent: MindMapNode, text: string): string {
    const seen = this.occurrences.get(parent) ?? new Map<string, number>();
    this.occurrences.set(parent, seen);
    const occurrence = (seen.get(text) ?? 0) + 1;
    seen.set(text, occurrence);
    return childId(parent.id, text, occurrence);
  }

  ordinalId(parent: MindMapNode): string {
    const ordinal = (this.ordinals.get(parent) ?? 0) + 1;
    this.ordinals.set(parent, ordinal);
    return ordinalId(parent.id, ordinal);
  }
}

function headingNode(id: string, heading: HeadingInput, kind: 'root' | 'heading'): MindMapNode {
  return node({
    id,
    kind,
    markdown: escapeBlockStart(heading.text),
    sectionType: null,
    level: heading.level,
    line: heading.line,
  });
}

function node(fields: Omit<MindMapNode, 'label' | 'children'>): MindMapNode {
  return { ...fields, label: fields.markdown.slice(0, LABEL_LENGTH), children: [] };
}
