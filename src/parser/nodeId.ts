export function escapeSegment(text: string): string {
  return text.replace(/[\\/[]/g, (char) => `\\${char}`);
}

/** `occurrence` is 1-based among siblings with the same text. */
export function childId(parentId: string, text: string, occurrence: number): string {
  const segment = escapeSegment(text) + (occurrence > 1 ? `[${occurrence}]` : '');
  return parentId === '' ? segment : `${parentId}/${segment}`;
}
