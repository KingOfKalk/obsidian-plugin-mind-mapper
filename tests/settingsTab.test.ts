import type { WorkspaceLeaf } from 'obsidian';
import MindMapperPlugin from '../src/main';
import { MindMapSettingTab } from '../src/settingsTab';
import { MindMapView } from '../src/view/MindMapView';
import { FakeWorkspace, fakeApp, fakeManifest } from './helpers';
import { Setting, type Plugin as MockPlugin } from './mocks/obsidian';

async function setup(data: unknown = null) {
  const ws = new FakeWorkspace();
  const plugin = new MindMapperPlugin(fakeApp(ws), fakeManifest());
  (plugin as unknown as MockPlugin).data = data;
  await plugin.onload();
  return { ws, plugin, mock: plugin as unknown as MockPlugin };
}

function row(name: string): Setting {
  const found = Setting.rows.find((s) => s.name === name);
  if (!found) throw new Error(`no setting ${name}`);
  return found;
}

function display(mock: MockPlugin): void {
  Setting.rows = [];
  const tab = mock.settingTabs[0] as unknown as MindMapSettingTab;
  tab.display();
}

test('plugin loads saved settings (sanitized) and registers the tab', async () => {
  const { plugin, mock } = await setup({ defaultLayout: 'left-to-right', levelGap: 9999 });
  expect(plugin.settings.defaultLayout).toBe('left-to-right');
  expect(plugin.settings.levelGap).toBe(400);
  expect(mock.settingTabs).toHaveLength(1);
  expect(mock.settingTabs[0]).toBeInstanceOf(MindMapSettingTab);
});

test('the tab shows one row per setting with its range', async () => {
  const { mock } = await setup();
  display(mock);
  expect(Setting.rows.map((s) => s.name)).toEqual([
    'Default layout',
    'Max node width',
    'Max node height',
    'Sibling gap',
    'Level gap',
  ]);
  expect(row('Default layout').dropdown?.options.size).toBe(6);
  expect(row('Default layout').dropdown?.value).toBe('circle-clockwise');
  expect(row('Max node width').desc).toContain('160');
  expect(row('Max node width').desc).toContain('800');
  expect(row('Max node width').text?.value).toBe('320');
});

test('changing the default layout in the tab saves it and refreshes open maps', async () => {
  const { ws, plugin, mock } = await setup();
  const view = new MindMapView({ app: ws.app } as unknown as WorkspaceLeaf);
  const leaf = ws.addLeaf({ type: 'mind-mapper-view' });
  leaf.view = view;
  const refresh = vi.spyOn(view, 'refresh').mockImplementation(() => {});
  display(mock);
  await row('Default layout').dropdown?.changeHandler?.('right-to-left');
  expect(plugin.settings.defaultLayout).toBe('right-to-left');
  expect(mock.data).toMatchObject({ defaultLayout: 'right-to-left' });
  expect(refresh).toHaveBeenCalledTimes(1);
});

/** Types into a number field and commits it (blur / Enter fire `change`). */
async function commit(name: string, value: string): Promise<void> {
  const text = row(name).text;
  if (!text) throw new Error(`no text field ${name}`);
  text.inputEl.value = value;
  text.inputEl.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(text.value).not.toBe('pending'));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('a max width of 5000 is clamped to 800 and the field shows 800; non-numbers are ignored', async () => {
  const { plugin, mock } = await setup();
  display(mock);
  await commit('Max node width', '5000');
  expect(plugin.settings.maxNodeWidth).toBe(800);
  expect(row('Max node width').text?.value).toBe('800');
  await commit('Max node width', 'abc');
  await commit('Max node width', '');
  expect(plugin.settings.maxNodeWidth).toBe(800);
  await commit('Level gap', '80');
  expect(plugin.settings.levelGap).toBe(80);
});

test('typing in a number field does not save until it is committed', async () => {
  const { plugin, mock } = await setup();
  const save = vi.spyOn(plugin, 'saveData');
  display(mock);
  const text = row('Max node width').text;
  await text?.changeHandler?.('4');
  text?.inputEl.dispatchEvent(new Event('input'));
  expect(save).not.toHaveBeenCalled();
  expect(plugin.settings.maxNodeWidth).toBe(320);
});
