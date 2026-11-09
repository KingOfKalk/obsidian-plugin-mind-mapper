import {
  type App,
  PluginSettingTab,
  type SettingDefinition,
  type SettingDefinitionItem,
} from 'obsidian';
import { t } from './i18n';
import type { MessageKey } from './i18n/en';
import { THEME_LABELS } from './i18n/labels';
import { LAYOUT_NAMES } from './layout/types';
import type MindMapperPlugin from './main';
import { THEME_NAMES } from './render/themes';
import { DEFAULT_SETTINGS, type NumericSetting, SETTING_RANGES } from './settings';

const REPOSITORY_URL = 'https://github.com/KingOfKalk/obsidian-plugin-mind-mapper';

/** Slider steps (px; percent for the fit zoom): every range bound and default is on the step grid, so the slider reaches it. */
const SLIDER_STEPS: Record<NumericSetting, number> = {
  maxNodeWidth: 10,
  maxNodeHeight: 10,
  siblingGap: 2,
  levelGap: 10,
  fitMaxZoom: 25,
};

/**
 * Declarative settings: Obsidian renders the groups and rows and indexes their names and
 * descriptions for search. All values are saved through `setControlValue`.
 */
export class MindMapSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly mindMapper: MindMapperPlugin,
  ) {
    super(app, mindMapper);
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: 'group',
        heading: t('mapHeading'),
        items: [
          {
            name: t('defaultLayoutName'),
            desc: t('defaultLayoutDesc'),
            control: {
              type: 'dropdown',
              key: 'defaultLayout',
              options: Object.fromEntries(LAYOUT_NAMES.map((name) => [name, name])),
            },
          },
          {
            name: t('startCollapsedName'),
            desc: t('startCollapsedDesc'),
            control: { type: 'toggle', key: 'startCollapsed' },
          },
          {
            name: t('defaultThemeName'),
            desc: t('defaultThemeDesc'),
            control: {
              type: 'dropdown',
              key: 'defaultTheme',
              options: Object.fromEntries(THEME_NAMES.map((name) => [name, t(THEME_LABELS[name])])),
            },
          },
          slider('fitMaxZoom', 'fitMaxZoomName', 'fitMaxZoomDesc', 'zoomPercent', 'percent'),
        ],
      },
      {
        type: 'group',
        heading: t('nodesHeading'),
        items: [
          slider('maxNodeWidth', 'maxNodeWidthName', 'maxNodeWidthDesc'),
          slider('maxNodeHeight', 'maxNodeHeightName', 'maxNodeHeightDesc'),
        ],
      },
      {
        type: 'group',
        heading: t('spacingHeading'),
        items: [
          slider('siblingGap', 'siblingGapName', 'siblingGapDesc'),
          slider('levelGap', 'levelGapName', 'levelGapDesc'),
        ],
      },
      {
        type: 'group',
        heading: t('aboutHeading'),
        items: [
          { name: t('versionName'), desc: this.mindMapper.manifest.version },
          {
            name: t('sourceCodeName'),
            // Obsidian opens an external link in the browser.
            desc: createFragment((el) => {
              el.createEl('a', {
                text: REPOSITORY_URL.replace('https://', ''),
                href: REPOSITORY_URL,
              });
            }),
          },
        ],
      },
    ];
  }

  /** Saves through the plugin, so values are sanitized and open maps re-laid out. */
  override setControlValue(key: string, value: unknown): Promise<void> {
    return this.mindMapper.updateSettings({ [key]: value });
  }
}

/** Obsidian's built-in slider: shows the value (px by default) and a "Restore default" button. */
function slider(
  key: NumericSetting,
  name: MessageKey,
  desc: MessageKey,
  format: MessageKey = 'pixels',
  param: 'value' | 'percent' = 'value',
): SettingDefinition {
  const { min, max } = SETTING_RANGES[key];
  return {
    name: t(name),
    desc: t(desc),
    control: {
      type: 'slider',
      key,
      min,
      max,
      step: SLIDER_STEPS[key],
      defaultValue: DEFAULT_SETTINGS[key],
      displayFormat: (value) => t(format, { [param]: value }),
    },
  };
}
