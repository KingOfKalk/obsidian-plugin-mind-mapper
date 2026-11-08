import type { CachedMetadata, SectionCache } from 'obsidian';
import { isCommentSource } from './nodeMarkdown';
import type { ParserInput } from './types';

/** Maps Obsidian's metadata cache plus the note text to the plain parser input. */
export function toParserInput(cache: CachedMetadata | null, text: string): ParserInput {
  const headings = (cache?.headings ?? []).map((h) => ({
    text: h.heading,
    level: h.level,
    line: h.position.start.line,
  }));
  const sections = (cache?.sections ?? []).map((s) => ({
    type: s.type,
    startLine: s.position.start.line,
    endLine: s.position.end.line,
    startOffset: s.position.start.offset,
    endOffset: s.position.end.offset,
  }));
  const listItems = (cache?.listItems ?? []).map((item) => ({
    startLine: item.position.start.line,
    endLine: item.position.end.line,
    startOffset: item.position.start.offset,
    endOffset: item.position.end.offset,
    parentLine: item.parent,
    task: item.task ?? null,
  }));
  const embeds = (cache?.embeds ?? []).map((e) => ({
    startOffset: e.position.start.offset,
    endOffset: e.position.end.offset,
    link: e.link,
  }));
  const firstContent = (cache?.sections ?? []).find((section) => isContent(section, text));
  return {
    headings,
    firstContentLine: firstContent?.position.start.line ?? null,
    text,
    sections,
    listItems,
    embeds,
  };
}

/** Spec: content is any section except frontmatter, comments and blank lines (blank lines have no section). */
function isContent(section: SectionCache, text: string): boolean {
  if (section.type === 'yaml' || section.type === 'comment') return false;
  if (section.type !== 'paragraph') return true;
  return !isCommentSource(text.slice(section.position.start.offset, section.position.end.offset));
}
