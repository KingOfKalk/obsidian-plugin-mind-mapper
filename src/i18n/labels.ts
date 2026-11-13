import type { MapLayoutName } from '../layout/types';
import type { MapThemeName } from '../themeNames';
import type { MessageKey } from './en';

/** Menu labels of the layouts; the values are the frontmatter names and stay untranslated. */
export const LAYOUT_LABELS: Readonly<Record<MapLayoutName, MessageKey>> = {
  'circle-clockwise': 'layoutCircleClockwise',
  'circle-counter-clockwise': 'layoutCircleCounterClockwise',
  'left-to-right': 'layoutLeftToRight',
  'right-to-left': 'layoutRightToLeft',
  'top-to-bottom': 'layoutTopToBottom',
  'bottom-to-top': 'layoutBottomToTop',
  kanban: 'layoutKanban',
};

/** Dropdown and menu labels of the color themes. */
export const THEME_LABELS: Readonly<Record<MapThemeName, MessageKey>> = {
  none: 'themeNone',
  rainbow: 'themeRainbow',
  ocean: 'themeOcean',
  forest: 'themeForest',
  accent: 'themeAccent',
};
