import { t } from '../i18n';
import { LAYOUT_NAMES, type MapLayoutName } from '../layout/types';
import { TAG_POSITIONS, type TagPosition } from '../tagPositions';
import { type MapThemeName, THEME_NAMES } from '../themeNames';

export type MapOptionKey =
  | 'mind-mapper-title'
  | 'mind-mapper-layout'
  | 'mind-mapper-collapsed'
  | 'mind-mapper-theme'
  | 'mind-mapper-tags';

export interface MapOptions {
  /** `mind-mapper-title`, else null (default title). */
  title: string | null;
  layout: MapLayoutName;
  /** `mind-mapper-collapsed`: the map starts like after "Collapse all". */
  collapsed: boolean;
  /** `mind-mapper-theme`, else the "Default theme" setting. */
  theme: MapThemeName;
  /** `mind-mapper-tags`, else the "Tag position" setting (issue #103). */
  tags: TagPosition;
  /** Values that were ignored; shown once per note and value (spec "Frontmatter"). */
  invalid: { key: MapOptionKey; value: string }[];
}

/**
 * Spec "Frontmatter": `mind-mapper-layout`, `mind-mapper-theme` and `mind-mapper-tags` outside
 * their lists and `mind-mapper-collapsed` that is not a YAML boolean fall back to the plugin
 * settings, `mind-mapper-title` that is not text falls back to the default. Absent or empty keys
 * fall back without a warning.
 */
export function readMapOptions(
  frontmatter: Record<string, unknown> | undefined,
  defaultLayout: MapLayoutName,
  startCollapsed: boolean,
  defaultTheme: MapThemeName = 'none',
  defaultTags: TagPosition = 'outside',
): MapOptions {
  const invalid: MapOptions['invalid'] = [];
  const rawTitle = frontmatter?.['mind-mapper-title'];
  const rawLayout = frontmatter?.['mind-mapper-layout'];
  const rawCollapsed = frontmatter?.['mind-mapper-collapsed'];
  const rawTheme = frontmatter?.['mind-mapper-theme'];
  const rawTags = frontmatter?.['mind-mapper-tags'];

  let title: string | null = null;
  if (typeof rawTitle === 'string') {
    title = rawTitle.trim() || null;
  } else if (rawTitle !== undefined && rawTitle !== null) {
    invalid.push({ key: 'mind-mapper-title', value: shown(rawTitle) });
  }

  let layout = defaultLayout;
  if (LAYOUT_NAMES.includes(rawLayout as MapLayoutName)) {
    layout = rawLayout as MapLayoutName;
  } else if (rawLayout !== undefined && rawLayout !== null) {
    invalid.push({ key: 'mind-mapper-layout', value: shown(rawLayout) });
  }

  let collapsed = startCollapsed;
  if (typeof rawCollapsed === 'boolean') {
    collapsed = rawCollapsed;
  } else if (rawCollapsed !== undefined && rawCollapsed !== null) {
    invalid.push({ key: 'mind-mapper-collapsed', value: shown(rawCollapsed) });
  }

  let theme = defaultTheme;
  if (THEME_NAMES.includes(rawTheme as MapThemeName)) {
    theme = rawTheme as MapThemeName;
  } else if (rawTheme !== undefined && rawTheme !== null) {
    invalid.push({ key: 'mind-mapper-theme', value: shown(rawTheme) });
  }

  let tags = defaultTags;
  if (TAG_POSITIONS.includes(rawTags as TagPosition)) {
    tags = rawTags as TagPosition;
  } else if (rawTags !== undefined && rawTags !== null) {
    invalid.push({ key: 'mind-mapper-tags', value: shown(rawTags) });
  }

  return { title, layout, collapsed, theme, tags, invalid };
}

/** A YAML value as the user wrote it: lists comma separated, maps as JSON. */
function shown(value: unknown): string {
  if (Array.isArray(value)) return value.map(shown).join(',');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

/** Notice text for an ignored frontmatter value; `options` gives the value used instead. */
export function invalidOptionMessage(
  key: MapOptionKey,
  value: string,
  path: string,
  options: MapOptions,
): string {
  switch (key) {
    case 'mind-mapper-layout':
      return t('invalidLayout', { value, path, layout: options.layout });
    case 'mind-mapper-collapsed':
      return t('invalidCollapsed', { value, path, collapsed: String(options.collapsed) });
    case 'mind-mapper-title':
      return t('invalidTitle', { path });
    case 'mind-mapper-theme':
      return t('invalidTheme', { value, path, theme: options.theme });
    case 'mind-mapper-tags':
      return t('invalidTags', { value, path, tags: options.tags });
  }
}
