import { LAYOUT_NAMES, type MapLayoutName } from './layout/types';
import { type MapThemeName, THEME_NAMES } from './render/themes';

export interface MindMapSettings {
  defaultLayout: MapLayoutName;
  /** Maps start like after "Collapse all"; frontmatter `mind-mapper-collapsed` overrides it. */
  startCollapsed: boolean;
  /** Colour theme for notes without `mind-mapper-theme`. */
  defaultTheme: MapThemeName;
  maxNodeWidth: number;
  maxNodeHeight: number;
  siblingGap: number;
  levelGap: number;
  /** Upper zoom limit of "Fit to view" in percent: small maps are enlarged up to it. */
  fitMaxZoom: number;
}

export const DEFAULT_SETTINGS: MindMapSettings = {
  defaultLayout: 'circle-clockwise',
  startCollapsed: false,
  defaultTheme: 'rainbow',
  maxNodeWidth: 320,
  maxNodeHeight: 240,
  siblingGap: 12,
  levelGap: 60,
  fitMaxZoom: 200,
};

export type NumericSetting =
  'maxNodeWidth' | 'maxNodeHeight' | 'siblingGap' | 'levelGap' | 'fitMaxZoom';

/** Allowed ranges (px; percent for `fitMaxZoom`); input outside is clamped. */
export const SETTING_RANGES: Record<NumericSetting, { min: number; max: number }> = {
  maxNodeWidth: { min: 160, max: 800 },
  maxNodeHeight: { min: 120, max: 800 },
  siblingGap: { min: 0, max: 200 },
  levelGap: { min: 20, max: 400 },
  fitMaxZoom: { min: 100, max: 400 },
};

/** Settings from `data.json` (any shape, e.g. older or hand-edited): unknown keys dropped, values checked. */
export function sanitizeSettings(raw: unknown): MindMapSettings {
  const data = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const layout = data.defaultLayout;
  return {
    defaultLayout: LAYOUT_NAMES.includes(layout as MapLayoutName)
      ? (layout as MapLayoutName)
      : DEFAULT_SETTINGS.defaultLayout,
    startCollapsed:
      typeof data.startCollapsed === 'boolean'
        ? data.startCollapsed
        : DEFAULT_SETTINGS.startCollapsed,
    defaultTheme: THEME_NAMES.includes(data.defaultTheme as MapThemeName)
      ? (data.defaultTheme as MapThemeName)
      : DEFAULT_SETTINGS.defaultTheme,
    maxNodeWidth: numberSetting(data.maxNodeWidth, 'maxNodeWidth'),
    maxNodeHeight: numberSetting(data.maxNodeHeight, 'maxNodeHeight'),
    siblingGap: numberSetting(data.siblingGap, 'siblingGap'),
    levelGap: numberSetting(data.levelGap, 'levelGap'),
    fitMaxZoom: numberSetting(data.fitMaxZoom, 'fitMaxZoom'),
  };
}

function numberSetting(value: unknown, key: NumericSetting): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS[key];
  const { min, max } = SETTING_RANGES[key];
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
