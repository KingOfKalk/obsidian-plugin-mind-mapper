export function escapeSegment(text: string): string {
  return text.replace(/[\\/[#]/g, (char) => `\\${char}`);
}

/** Heading child. `occurrence` is 1-based among siblings with the same text. */
export function childId(parentId: string, text: string, occurrence: number): string {
  const segment = escapeSegment(text) + (occurrence > 1 ? `[${occurrence}]` : '');
  return join(parentId, segment);
}

/** Non-heading child. `ordinal` is 1-based among the parent's non-heading children. */
export function ordinalId(parentId: string, ordinal: number): string {
  return join(parentId, `#${ordinal}`);
}

function join(parentId: string, segment: string): string {
  return parentId === '' ? segment : `${parentId}/${segment}`;
}
