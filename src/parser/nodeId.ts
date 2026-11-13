export function escapeSegment(text: string): string {
  return text.replace(/[\\/[#]/g, (char) => `\\${char}`);
}

/**
 * Segment for an empty heading (`## `). `escapeSegment` never yields an unescaped `[`, so no
 * heading text, occurrence index or ordinal can produce it, and it is never the virtual root's `''`.
 */
const EMPTY_HEADING = '[]';

/** ID segment for a heading's text (also the ID of an H1 root). */
export function headingSegment(text: string): string {
  return text === '' ? EMPTY_HEADING : escapeSegment(text);
}

/** Heading child. `occurrence` is 1-based among siblings with the same text. */
export function childId(parentId: string, text: string, occurrence: number): string {
  const segment = headingSegment(text) + (occurrence > 1 ? `[${occurrence}]` : '');
  return join(parentId, segment);
}

/** Non-heading child. `ordinal` is 1-based among the parent's non-heading children. */
export function ordinalId(parentId: string, ordinal: number): string {
  return join(parentId, `#${ordinal}`);
}

function join(parentId: string, segment: string): string {
  return parentId === '' ? segment : `${parentId}/${segment}`;
}
