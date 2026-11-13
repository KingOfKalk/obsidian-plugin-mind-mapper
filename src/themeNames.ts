/**
 * Spec "Color themes": each first-level branch gets a color of the theme's palette; `none` is the
 * same look in grays. Shared by settings, frontmatter, labels and the renderer.
 */
export type MapThemeName = 'none' | 'rainbow' | 'ocean' | 'forest' | 'accent';

export const THEME_NAMES: readonly MapThemeName[] = [
  'none',
  'rainbow',
  'ocean',
  'forest',
  'accent',
];
