import { type App, PluginSettingTab, Setting } from 'obsidian';
import { LAYOUT_NAMES, type MapLayoutName } from './layout/types';
import type MindMapperPlugin from './main';
import { type NumericSetting, SETTING_RANGES } from './settings';

const NUMBER_ROWS: { key: NumericSetting; name: string; desc: string }[] = [
  { key: 'maxNodeWidth', name: 'Max node width', desc: 'Wider content is clipped with a fade.' },
  { key: 'maxNodeHeight', name: 'Max node height', desc: 'Taller content is clipped with a fade.' },
  { key: 'siblingGap', name: 'Sibling gap', desc: 'Space between neighbouring branches.' },
  { key: 'levelGap', name: 'Level gap', desc: 'Space between a node and its children.' },
];

export class MindMapSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly mindMapper: MindMapperPlugin,
  ) {
    super(app, mindMapper);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.mindMapper.settings;

    new Setting(containerEl)
      .setName('Default layout')
      .setDesc('For notes without mind-mapper-layout in their frontmatter.')
      .addDropdown((dropdown) => {
        for (const name of LAYOUT_NAMES) dropdown.addOption(name, name);
        dropdown
          .setValue(settings.defaultLayout)
          .onChange((value) =>
            this.mindMapper.updateSettings({ defaultLayout: value as MapLayoutName }),
          );
      });

    for (const { key, name, desc } of NUMBER_ROWS) {
      const { min, max } = SETTING_RANGES[key];
      new Setting(containerEl)
        .setName(name)
        .setDesc(`${desc} ${min}–${max} px.`)
        .addText((text) => {
          text.inputEl.type = 'number';
          text.inputEl.min = String(min);
          text.inputEl.max = String(max);
          text.setValue(String(settings[key]));
          // Commit on blur / Enter, not per keystroke: every commit saves and re-lays out all maps.
          text.inputEl.addEventListener('change', () => {
            const value = text.inputEl.value;
            const parsed = Number(value);
            if (value.trim() !== '' && Number.isFinite(parsed)) {
              void this.mindMapper
                .updateSettings({ [key]: parsed })
                .then(() => text.setValue(String(this.mindMapper.settings[key])));
            } else {
              text.setValue(String(this.mindMapper.settings[key]));
            }
          });
        });
    }
  }
}
