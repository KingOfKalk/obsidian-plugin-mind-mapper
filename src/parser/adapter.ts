import type { CachedMetadata, SectionCache } from 'obsidian';
import type { ParserInput } from './types';

/** Maps Obsidian's metadata cache plus the note text to the plain parser input. */
export function toParserInput(cache: CachedMetadata | null, text: string): ParserInput {
  const headings = (cache?.headings ?? []).map((h) => ({
    text: h.heading,
    level: h.level,
    line: h.position.start.line,
  }));
  const firstContent = (cache?.sections ?? []).find((section) => isContent(section, text));
  return { headings, firstContentLine: firstContent?.position.start.line ?? null };
}

/** Spec: content is any section except frontmatter, comments and blank lines (blank lines have no section). */
function isContent(section: SectionCache, text: string): boolean {
  if (section.type === 'yaml') return false;
  // Obsidian reports a `%% comment %%` block as a paragraph section.
  if (section.type === 'paragraph') {
    const source = text.slice(section.position.start.offset, section.position.end.offset).trim();
    if (source.length >= 4 && source.startsWith('%%') && source.endsWith('%%')) return false;
  }
  return true;
}
