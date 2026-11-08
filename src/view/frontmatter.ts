import { LAYOUT_NAMES, type MapLayoutName } from '../layout/types';

export type MapOptionKey = 'mind_map_title' | 'mind_map_layout';

export interface MapOptions {
  /** `mind_map_title`, else null (default title). */
  title: string | null;
  layout: MapLayoutName;
  /** Values that were ignored; shown once per note and value (spec "Frontmatter"). */
  invalid: { key: MapOptionKey; value: string }[];
}

/**
 * Spec "Frontmatter": `mind_map_layout` outside the list falls back to the plugin setting,
 * `mind_map_title` that is not text falls back to the default. Absent or empty keys fall back
 * without a warning.
 */
export function readMapOptions(
  frontmatter: Record<string, unknown> | undefined,
  defaultLayout: MapLayoutName,
): MapOptions {
  const invalid: MapOptions['invalid'] = [];
  const rawTitle = frontmatter?.mind_map_title;
  const rawLayout = frontmatter?.mind_map_layout;

  let title: string | null = null;
  if (typeof rawTitle === 'string') {
    title = rawTitle.trim() || null;
  } else if (rawTitle !== undefined && rawTitle !== null) {
    invalid.push({ key: 'mind_map_title', value: shown(rawTitle) });
  }

  let layout = defaultLayout;
  if (LAYOUT_NAMES.includes(rawLayout as MapLayoutName)) {
    layout = rawLayout as MapLayoutName;
  } else if (rawLayout !== undefined && rawLayout !== null) {
    invalid.push({ key: 'mind_map_layout', value: shown(rawLayout) });
  }

  return { title, layout, invalid };
}

/** A YAML value as the user wrote it: lists comma separated, maps as JSON. */
function shown(value: unknown): string {
  if (Array.isArray(value)) return value.map(shown).join(',');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

/** Notice text for an ignored frontmatter value. */
export function invalidOptionMessage(
  key: MapOptionKey,
  value: string,
  path: string,
  layout: MapLayoutName,
): string {
  return key === 'mind_map_layout'
    ? `Mind Mapper: unknown mind_map_layout "${value}" in ${path}, using ${layout}`
    : `Mind Mapper: mind_map_title in ${path} is not text, using the default title`;
}
