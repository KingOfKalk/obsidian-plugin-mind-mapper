import { LAYOUT_NAMES, type MapLayoutName } from '../layout/types';

export type MapOptionKey = 'mind-mapper-title' | 'mind-mapper-layout' | 'mind-mapper-collapsed';

export interface MapOptions {
  /** `mind-mapper-title`, else null (default title). */
  title: string | null;
  layout: MapLayoutName;
  /** `mind-mapper-collapsed`: the map starts like after "Collapse all". */
  collapsed: boolean;
  /** Values that were ignored; shown once per note and value (spec "Frontmatter"). */
  invalid: { key: MapOptionKey; value: string }[];
}

/**
 * Spec "Frontmatter": `mind-mapper-layout` outside the list and `mind-mapper-collapsed` that is
 * not a YAML boolean fall back to the plugin settings, `mind-mapper-title` that is not text falls
 * back to the default. Absent or empty keys fall back without a warning.
 */
export function readMapOptions(
  frontmatter: Record<string, unknown> | undefined,
  defaultLayout: MapLayoutName,
  startCollapsed: boolean,
): MapOptions {
  const invalid: MapOptions['invalid'] = [];
  const rawTitle = frontmatter?.['mind-mapper-title'];
  const rawLayout = frontmatter?.['mind-mapper-layout'];
  const rawCollapsed = frontmatter?.['mind-mapper-collapsed'];

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

  return { title, layout, collapsed, invalid };
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
      return `Mind Mapper: unknown mind-mapper-layout "${value}" in ${path}, using ${options.layout}`;
    case 'mind-mapper-collapsed':
      return `Mind Mapper: mind-mapper-collapsed "${value}" in ${path} is not true or false, using ${options.collapsed}`;
    case 'mind-mapper-title':
      return `Mind Mapper: mind-mapper-title in ${path} is not text, using the default title`;
  }
}
