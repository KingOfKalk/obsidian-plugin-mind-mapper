/**
 * Spec "Tags setting" (issues #103, #105): how tags look and where they go. `text`: highlighted,
 * clickable text in place, one search per level of a nested tag (issue #105); `outside`: pills,
 * the trailing tags in a row below the node's box, at the edge opposite its text; `inside`: pills,
 * the trailing tags in the box, at that edge (issue #92). Shared by settings, frontmatter, labels
 * and the renderer.
 */
export type TagPosition = 'text' | 'outside' | 'inside';

export const TAG_POSITIONS: readonly TagPosition[] = ['text', 'outside', 'inside'];

export const DEFAULT_TAG_POSITION: TagPosition = 'text';

/** Class of the map canvas (and of the content overlay) for a tags mode; styles.css keys on it. */
export function tagPositionClass(position: TagPosition): string {
  return `mind-mapper-tags-${position}`;
}
