import { escapeBlockStart, sliceMarkdown } from './nodeMarkdown';
import type { EmbedInput, ListItemInput } from './types';

/** `marker`, whitespace after it, optional `[x] ` task box. */
const ITEM_START = /^([-*+]|\d+[.)])([ \t]+)(\[(.)\][ \t]+)?/;
const TAB_WIDTH = 4;

/**
 * Markdown of one list item node: its own line plus continuation content, without nested items
 * (`nested`: items inside this item's range; Obsidian includes them when continuation follows).
 * Bullet markers are dropped, ordered numbers kept, tasks rendered as `- [x] text`; continuation
 * lines are dedented by the item's content indent in columns (tabs to the next multiple of 4).
 */
export function itemMarkdown(
  text: string,
  item: ListItemInput,
  embeds: EmbedInput[],
  nested: ListItemInput[] = [],
): string {
  const lineStart = text.lastIndexOf('\n', item.startOffset - 1) + 1;
  const indent = columnsAfter(text.slice(lineStart, item.startOffset), 0);
  const covered = (line: number): boolean =>
    nested.some((child) => line >= child.startLine && line <= child.endLine);

  const lines = sliceMarkdown(text, item.startOffset, item.endOffset, embeds)
    .split('\n')
    .filter((_, i) => i === 0 || !covered(item.startLine + i));
  while (lines.length > 1 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
  const [first = '', ...rest] = lines;

  const match = ITEM_START.exec(first);
  if (!match) return lines.join('\n');
  const [whole, marker = '', spacing = ''] = match;
  const content = escapeBlockStart(first.slice(whole.length));
  const contentIndent = columnsAfter(spacing, indent + marker.length);

  const isOrdered = /^\d/.test(marker);
  const task = item.task ?? match[4];
  const head =
    task !== undefined
      ? `${isOrdered ? marker : '-'} [${task}] ${content}`
      : isOrdered
        ? `${marker} ${content}`
        : content;

  return [head, ...rest.map((line) => dedent(line, contentIndent))].join('\n');
}

/** Column reached after `whitespace`, starting at column `start`. */
function columnsAfter(whitespace: string, start: number): number {
  let column = start;
  for (const char of whitespace) {
    column = char === '\t' ? (Math.floor(column / TAB_WIDTH) + 1) * TAB_WIDTH : column + 1;
  }
  return column;
}

/** Removes leading whitespace until `width` columns are consumed (a tab consumes to its stop). */
function dedent(line: string, width: number): string {
  let column = 0;
  let i = 0;
  while (i < line.length && column < width && (line[i] === ' ' || line[i] === '\t')) {
    column = columnsAfter(line[i] ?? '', column);
    i++;
  }
  return line.slice(i);
}
