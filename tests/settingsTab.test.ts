import type { WorkspaceLeaf } from 'obsidian';
import MindMapperPlugin from '../src/main';
import { MindMapSettingTab } from '../src/settingsTab';
import { MindMapView } from '../src/view/MindMapView';
import { FakeWorkspace, fakeApp, fakeManifest, useGerman } from './helpers';
import { LAYOUT_NAMES } from '../src/layout/types';
import {
  type MockSettingDefinition,
  type Plugin as MockPlugin,
  type PluginSettingTab as MockPluginSettingTab,
  Setting,
  renderSettingDefinitions,
} from './mocks/obsidian';

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

function tab(mock: MockPlugin): MockPluginSettingTab {
  const found = mock.settingTabs[0];
  if (!found) throw new Error('no setting tab');
  return found;
}

function definition(mock: MockPlugin, name: string): MockSettingDefinition {
  const found = tab(mock)
    .getSettingDefinitions()
    .find((d) => d.name === name);
  if (!found) throw new Error(`no definition ${name}`);
  return found;
}

/** Renders the tab the way Obsidian's settings modal does (declarative definitions). */
function display(mock: MockPlugin): void {
  Setting.rows = [];
  renderSettingDefinitions(tab(mock));
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
    'Start collapsed',
    'Max node width',
    'Max node height',
    'Sibling gap',
    'Level gap',
  ]);
  expect(row('Default layout').dropdown?.options.size).toBe(6);
  expect(row('Default layout').dropdown?.value).toBe('circle-clockwise');
  expect(row('Start collapsed').toggle?.value).toBe(false);
  expect(row('Max node width').desc).toContain('160');
  expect(row('Max node width').desc).toContain('800');
  expect(row('Max node width').text?.value).toBe('320');
});

test('every setting is a definition, so Obsidian settings search finds it by name and range', async () => {
  const { mock } = await setup();
  expect(
    tab(mock)
      .getSettingDefinitions()
      .map((d) => d.name),
  ).toEqual([
    'Default layout',
    'Start collapsed',
    'Max node width',
    'Max node height',
    'Sibling gap',
    'Level gap',
  ]);
  expect(definition(mock, 'Start collapsed').desc).toBe(
    'Open maps with only the root and the first level visible, for notes without mind-mapper-collapsed in their frontmatter.',
  );
  expect(definition(mock, 'Default layout').desc).toBe(
    'For notes without mind-mapper-layout in their frontmatter.',
  );
  expect(definition(mock, 'Max node width').desc).toBe(
    'Wider content is clipped with a fade. 160–800 px.',
  );
  expect(definition(mock, 'Level gap').desc).toBe(
    'Space between a node and its children. 20–400 px.',
  );
});

test('the default layout is a dropdown control bound to defaultLayout', async () => {
  const { mock } = await setup();
  const control = definition(mock, 'Default layout').control;
  expect(control).toMatchObject({ type: 'dropdown', key: 'defaultLayout' });
  expect(Object.keys(control?.options ?? {})).toEqual(LAYOUT_NAMES);
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

test('start collapsed is a toggle control bound to startCollapsed', async () => {
  const { mock } = await setup();
  expect(definition(mock, 'Start collapsed').control).toEqual({
    type: 'toggle',
    key: 'startCollapsed',
  });
});

test('switching start collapsed in the tab saves it and refreshes open maps', async () => {
  const { ws, plugin, mock } = await setup({ startCollapsed: true });
  const view = new MindMapView({ app: ws.app } as unknown as WorkspaceLeaf);
  const leaf = ws.addLeaf({ type: 'mind-mapper-view' });
  leaf.view = view;
  const refresh = vi.spyOn(view, 'refresh').mockImplementation(() => {});
  display(mock);
  expect(row('Start collapsed').toggle?.value).toBe(true);
  await row('Start collapsed').toggle?.changeHandler?.(false);
  expect(plugin.settings.startCollapsed).toBe(false);
  expect(mock.data).toMatchObject({ startCollapsed: false });
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

test('committing a number field settles: the component is never resolved as a promise value', async () => {
  // Obsidian components are thenables; resolving a promise with one loops forever and froze
  // Obsidian when a number was committed.
  const { mock } = await setup();
  display(mock);
  await commit('Max node width', '5000');
  expect(row('Max node width').text?.value).toBe('800');
  expect(row('Max node width').text?.thenCalls).toBe(0);
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

test('in German the rows have German names and descriptions; layout values stay', async () => {
  useGerman();
  const { mock } = await setup();
  display(mock);
  expect(Setting.rows.map((s) => s.name)).toEqual([
    'Standard-Layout',
    'Eingeklappt starten',
    'Maximale Knotenbreite',
    'Maximale Knotenhöhe',
    'Abstand zwischen Geschwistern',
    'Ebenenabstand',
  ]);
  expect(row('Maximale Knotenbreite').desc).toBe(
    'Breiterer Inhalt wird mit einem Verlauf abgeschnitten. 160–800 px.',
  );
  expect([...(row('Standard-Layout').dropdown?.options.keys() ?? [])]).toEqual([...LAYOUT_NAMES]);
});
