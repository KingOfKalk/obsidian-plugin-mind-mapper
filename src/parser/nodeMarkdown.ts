import type { EmbedInput } from './types';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif'];

const TRAILING_BLOCK_ID = /\s+\^[A-Za-z0-9-]+\s*$/;

export function isImageLink(link: string): boolean {
  const path = link.split(/[#|]/)[0] ?? '';
  const dot = path.lastIndexOf('.');
  return dot >= 0 && IMAGE_EXTENSIONS.includes(path.slice(dot + 1).toLowerCase());
}

/**
 * Markdown of a node: the source range, with non-image embeds turned into plain links
 * (no transclusion in nodes) and a trailing block ID (`^id`) removed.
 */
export function sliceMarkdown(
  text: string,
  start: number,
  end: number,
  embeds: EmbedInput[],
): string {
  let markdown = text.slice(start, end);
  const inside = embeds
    .filter((e) => e.startOffset >= start && e.endOffset <= end && !isImageLink(e.link))
    .sort((a, b) => b.startOffset - a.startOffset);
  for (const embed of inside) {
    const at = embed.startOffset - start;
    if (markdown[at] === '!') markdown = markdown.slice(0, at) + markdown.slice(at + 1);
  }
  return markdown.replace(TRAILING_BLOCK_ID, '');
}

/** Obsidian reports a `%% comment %%` block as a paragraph section. */
export function isCommentSource(source: string): boolean {
  const trimmed = source.trim();
  return trimmed.length >= 4 && trimmed.startsWith('%%') && trimmed.endsWith('%%');
}

/**
 * Escapes block syntax at the start of a single-line text (`1. `, `- `, `+ `, `* `, `> `, `# `),
 * so heading texts and list item content render as text, not as a nested list, quote or heading.
 */
export function escapeBlockStart(text: string): string {
  return text.replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2').replace(/^([-+*>]|#{1,6})(?=\s|$)/, '\\$1');
}
