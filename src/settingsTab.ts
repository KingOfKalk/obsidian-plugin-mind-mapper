import { type App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { t } from './i18n';
import type { MessageKey } from './i18n/en';
import { LAYOUT_NAMES } from './layout/types';
import type MindMapperPlugin from './main';
import { type NumericSetting, SETTING_RANGES } from './settings';

const NUMBER_ROWS: { key: NumericSetting; name: MessageKey; desc: MessageKey }[] = [
  { key: 'maxNodeWidth', name: 'maxNodeWidthName', desc: 'maxNodeWidthDesc' },
  { key: 'maxNodeHeight', name: 'maxNodeHeightName', desc: 'maxNodeHeightDesc' },
  { key: 'siblingGap', name: 'siblingGapName', desc: 'siblingGapDesc' },
  { key: 'levelGap', name: 'levelGapName', desc: 'levelGapDesc' },
];

/** Declarative settings: Obsidian renders the rows and indexes their names and descriptions for search. */
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
      ...NUMBER_ROWS.map(({ key, name, desc }) => this.numberDefinition(key, t(name), t(desc))),
    ];
  }

  /** Saves through the plugin, so values are sanitized and open maps re-laid out. */
  override setControlValue(key: string, value: unknown): Promise<void> {
    return this.mindMapper.updateSettings({ [key]: value });
  }

  /**
   * Rendered by hand, not as a `number` control: that one rejects out-of-range input with an
   * error, while these clamp it to the range and show the clamped value.
   */
  private numberDefinition(key: NumericSetting, name: string, desc: string): SettingDefinitionItem {
    const { min, max } = SETTING_RANGES[key];
    return {
      name,
      desc: t('pixelRange', { desc, min, max }),
      render: (setting) => {
        setting.addText((text) => {
          text.inputEl.type = 'number';
          text.inputEl.min = String(min);
          text.inputEl.max = String(max);
          text.setValue(String(this.mindMapper.settings[key]));
          // Commit on blur / Enter, not per keystroke: every commit saves and re-lays out all maps.
          text.inputEl.addEventListener('change', () => {
            const value = text.inputEl.value;
            const parsed = Number(value);
            if (value.trim() !== '' && Number.isFinite(parsed)) {
              // Block body: `setValue` returns the component, and Obsidian components are
              // thenables (`then(cb)` calls `cb(this)`), so returning it would resolve the
              // promise with itself forever and freeze Obsidian.
              void this.mindMapper.updateSettings({ [key]: parsed }).then(() => {
                text.setValue(String(this.mindMapper.settings[key]));
              });
            } else {
              text.setValue(String(this.mindMapper.settings[key]));
            }
          });
        });
      },
    };
  }
}
