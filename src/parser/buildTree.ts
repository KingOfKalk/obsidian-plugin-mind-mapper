import { childId, headingSegment, ordinalId } from './nodeId';
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

/** `title` (frontmatter `mind-mapper-title`) replaces the root's label, never its ID. */
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
      ? headingNode(headingSegment(onlyH1.text), onlyH1, 'root')
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

  const listItems = sortedListItems(input.listItems ?? []);
  const builder = new ChildBuilder();
  const stack: MindMapNode[] = [root];
  const current = (): MindMapNode => stack[stack.length - 1] ?? root;
  // A divider waits for the next node, wherever it lands (spec "Dividers").
  let dividerPending = false;
  /** Marks `first` if a divider is pending and it is not its parent's first child. */
  const takeDivider = (parent: MindMapNode, first: MindMapNode): void => {
    if (dividerPending && parent.children.length > 0) first.dividerBefore = true;
    dividerPending = false;
  };

  for (const item of orderedItems(input)) {
    if ('heading' in item) {
      const heading = item.heading;
      if (h1IsRoot && heading === onlyH1) {
        dividerPending = false;
        continue;
      }
      while (stack.length > 1 && current().level >= heading.level) stack.pop();
      const parent = current();
      const child = headingNode(builder.headingId(parent, heading.text), heading, 'heading');
      takeDivider(parent, child);
      parent.children.push(child);
      stack.push(child);
    } else if (item.section.type === 'thematicBreak') {
      dividerPending = true;
    } else {
      const children = sectionNodes(item.section, input, listItems, current(), builder);
      const first = children[0];
      if (first) takeDivider(current(), first);
      current().children.push(...children);
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
  listItems: ListItemInput[],
  parent: MindMapNode,
  builder: ChildBuilder,
): MindMapNode[] {
  if (SKIPPED_TYPES.has(section.type)) return [];
  const text = input.text ?? '';
  const source = text.slice(section.startOffset, section.endOffset);
  if (source.trim() === '') return [];
  if (section.type === 'paragraph' && isCommentSource(source)) return [];
  if (section.type === 'list') return listNodes(section, input, listItems, parent, builder);

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
      endLine: section.endLine,
    }),
  ];
}

/**
 * One node per list item of a `list` section; nested items attach to their parent item.
 * Only items inside list sections count (items inside quotes and callouts belong to that block).
 * Returns the top-level item nodes. Linear in the section's items: `listItems` is sorted by line,
 * so the section's items, and the items nested in each item, are contiguous runs.
 */
function listNodes(
  section: SectionInput,
  input: ParserInput,
  listItems: ListItemInput[],
  parent: MindMapNode,
  builder: ChildBuilder,
): MindMapNode[] {
  const from = firstAtOrAfter(listItems, section.startLine);
  let to = from;
  while (to < listItems.length && (listItems[to]?.startLine ?? Infinity) <= section.endLine) to++;
  const items = listItems.slice(from, to);

  const byLine = new Map<number, MindMapNode>();
  const topLevel: MindMapNode[] = [];
  /** Items whose range may still contain later items, outermost first. */
  const open: ListItemInput[] = [];
  for (const [i, item] of items.entries()) {
    while (open.length > 0 && (open[open.length - 1]?.endLine ?? Infinity) < item.startLine) {
      open.pop();
    }
    const parentItem = byLine.get(parentLineOf(item, open) ?? -1);
    let end = i + 1;
    while (end < items.length && contains(item, items[end])) end++;
    const itemNode = node({
      id: builder.ordinalId(parentItem ?? parent),
      kind: 'list-item',
      markdown: itemMarkdown(input.text ?? '', item, input.embeds ?? [], items.slice(i + 1, end)),
      sectionType: null,
      level: 0,
      line: item.startLine,
      endLine: item.endLine,
    });
    byLine.set(item.startLine, itemNode);
    if (parentItem) parentItem.children.push(itemNode);
    else topLevel.push(itemNode);
    open.push(item);
  }
  return topLevel;
}

/**
 * List items sorted by line (stable), one per line: Obsidian reports an item nested by block
 * syntax on the same line (`- 1986. text`, `- + x`) as a second item; that text belongs to the
 * outer item.
 */
function sortedListItems(items: ListItemInput[]): ListItemInput[] {
  const sorted = [...items].sort((a, b) => a.startLine - b.startLine);
  return sorted.filter((item, i) => i === 0 || item.startLine !== sorted[i - 1]?.startLine);
}

/** Index of the first item starting at or after `line` (binary search). */
function firstAtOrAfter(items: ListItemInput[], line: number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((items[mid]?.startLine ?? Infinity) < line) low = mid + 1;
    else high = mid;
  }
  return low;
}

function contains(outer: ListItemInput, inner: ListItemInput | undefined): boolean {
  return (
    inner !== undefined && inner.startLine > outer.startLine && inner.startLine <= outer.endLine
  );
}

/**
 * Parent item line. Obsidian reports a nested item followed by lazy continuation of its parent
 * (`- a`, `  - b`, blank, `  more of a`) as top-level; then the innermost containing item wins:
 * the last of the `open` items (earlier items, ending at or after this one's start), if any.
 */
function parentLineOf(item: ListItemInput, open: ListItemInput[]): number | null {
  if (item.parentLine >= 0) return item.parentLine;
  const container = open[open.length - 1];
  return container && contains(container, item) ? container.startLine : null;
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
    endLine: heading.line,
  });
}

function node(fields: Omit<MindMapNode, 'label' | 'children'>): MindMapNode {
  return { ...fields, label: fields.markdown.slice(0, LABEL_LENGTH), children: [] };
}
