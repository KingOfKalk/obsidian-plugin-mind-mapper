/**
 * Spec "Tags" (issue #103): where the trailing tags of a node go. `outside`: in a row below the
 * node's box, at the edge opposite its text; `inside`: in the box, at that edge (issue #92).
 * Shared by settings, frontmatter, labels and the renderer.
 */
export type TagPosition = 'outside' | 'inside';

export const TAG_POSITIONS: readonly TagPosition[] = ['outside', 'inside'];
