import { LAYOUT_NAMES, type MapLayoutName } from './layout/types';

export interface MindMapSettings {
  defaultLayout: MapLayoutName;
  /** Maps start like after "Collapse all"; frontmatter `mind-mapper-collapsed` overrides it. */
  startCollapsed: boolean;
  maxNodeWidth: number;
  maxNodeHeight: number;
  siblingGap: number;
  levelGap: number;
}

export const DEFAULT_SETTINGS: MindMapSettings = {
  defaultLayout: 'circle-clockwise',
  startCollapsed: false,
  maxNodeWidth: 320,
  maxNodeHeight: 240,
  siblingGap: 12,
  levelGap: 60,
};

export type NumericSetting = 'maxNodeWidth' | 'maxNodeHeight' | 'siblingGap' | 'levelGap';

/** Allowed ranges in px; input outside is clamped. */
export const SETTING_RANGES: Record<NumericSetting, { min: number; max: number }> = {
  maxNodeWidth: { min: 160, max: 800 },
  maxNodeHeight: { min: 120, max: 800 },
  siblingGap: { min: 0, max: 200 },
  levelGap: { min: 20, max: 400 },
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
    maxNodeWidth: numberSetting(data.maxNodeWidth, 'maxNodeWidth'),
    maxNodeHeight: numberSetting(data.maxNodeHeight, 'maxNodeHeight'),
    siblingGap: numberSetting(data.siblingGap, 'siblingGap'),
    levelGap: numberSetting(data.levelGap, 'levelGap'),
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
