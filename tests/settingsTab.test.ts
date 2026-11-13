import type { WorkspaceLeaf } from 'obsidian';
import MindMapperPlugin from '../src/main';
import { DEFAULT_SETTINGS } from '../src/settings';
import { MindMapSettingTab } from '../src/settingsTab';
import { MindMapView } from '../src/view/MindMapView';
import { FakeWorkspace, fakeApp, fakeManifest, useGerman } from './helpers';
import { LAYOUT_NAMES } from '../src/layout/types';
import {
  type MockSettingDefinition,
  type MockSettingGroup,
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

/** Every definition, groups flattened. */
function definitions(mock: MockPlugin): MockSettingDefinition[] {
  return tab(mock)
    .getSettingDefinitions()
    .flatMap((item) => ('type' in item ? (item.items ?? []) : [item]));
}

function definition(mock: MockPlugin, name: string): MockSettingDefinition {
  const found = definitions(mock).find((d) => d.name === name);
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

test('the tab shows the settings in groups under headings', async () => {
  const { mock } = await setup();
  const items = tab(mock).getSettingDefinitions();
  expect(items.every((item) => 'type' in item && item.type === 'group')).toBe(true);
  expect(
    (items as MockSettingGroup[]).map((group) => [
      group.heading,
      (group.items ?? []).map((d) => d.name),
    ]),
  ).toEqual([
    ['Map', ['Default layout', 'Start collapsed', 'Default theme', 'Max zoom for fit']],
    ['Nodes', ['Max node width', 'Max node height']],
    ['Spacing', ['Sibling gap', 'Level gap']],
    ['About', ['Version', 'Source code', 'Report an issue']],
  ]);
});

test('the rendered tab shows each row in its group with the current value', async () => {
  const { mock } = await setup({ maxNodeWidth: 400 });
  display(mock);
  expect(Setting.rows.map((s) => [s.group, s.name])).toEqual([
    ['Map', 'Default layout'],
    ['Map', 'Start collapsed'],
    ['Map', 'Default theme'],
    ['Map', 'Max zoom for fit'],
    ['Nodes', 'Max node width'],
    ['Nodes', 'Max node height'],
    ['Spacing', 'Sibling gap'],
    ['Spacing', 'Level gap'],
    ['About', 'Version'],
    ['About', 'Source code'],
    ['About', 'Report an issue'],
  ]);
  expect(row('Default layout').dropdown?.options.size).toBe(7);
  expect(row('Default layout').dropdown?.value).toBe('circle-clockwise');
  expect(row('Start collapsed').toggle?.value).toBe(false);
  expect(row('Default theme').dropdown?.value).toBe('rainbow');
  expect(row('Max node width').slider?.value).toBe(400);
  expect(row('Max node width').slider?.getValuePretty()).toBe('400 px');
  expect(row('Level gap').slider?.getValuePretty()).toBe('60 px');
  expect(row('Max zoom for fit').slider?.value).toBe(150);
  expect(row('Max zoom for fit').slider?.getValuePretty()).toBe('150%');
});

test('every setting has a name and description, so Obsidian settings search finds it', async () => {
  const { mock } = await setup();
  expect(definition(mock, 'Start collapsed').desc).toBe(
    'Open maps with only the root and the first level visible, for notes without mind-mapper-collapsed in their frontmatter.',
  );
  expect(definition(mock, 'Default layout').desc).toBe(
    'For notes without mind-mapper-layout in their frontmatter.',
  );
  expect(definition(mock, 'Default theme').desc).toBe(
    'Colors each first-level branch and everything below it, for notes without mind-mapper-theme in their frontmatter.',
  );
  // The slider shows the value and its bounds; the description no longer repeats the range.
  expect(definition(mock, 'Max node width').desc).toBe('Wider content is clipped with a fade.');
  expect(definition(mock, 'Level gap').desc).toBe('Space between a node and its children.');
  expect(definition(mock, 'Max zoom for fit').desc).toBe(
    'Fit to view enlarges small maps up to this zoom. Open maps use it the next time they fit.',
  );
});

test('Max zoom for fit is a built-in slider from 100% to 400% in 25% steps', async () => {
  const { mock } = await setup();
  const def = definition(mock, 'Max zoom for fit');
  expect(def.render).toBeUndefined();
  expect(def.control).toMatchObject({
    type: 'slider',
    key: 'fitMaxZoom',
    min: 100,
    max: 400,
    step: 25,
    defaultValue: 150,
  });
  expect(def.control?.displayFormat?.(250)).toBe('250%');
});

test('moving the fit zoom slider saves the value but does not re-lay out open maps', async () => {
  const { ws, plugin, mock } = await setup();
  const view = new MindMapView({ app: ws.app } as unknown as WorkspaceLeaf);
  ws.addLeaf({ type: 'mind-mapper-view' }).view = view;
  const refresh = vi.spyOn(view, 'refresh').mockImplementation(() => {});
  display(mock);
  await slider('Max zoom for fit').changeHandler?.(300);
  expect(plugin.settings.fitMaxZoom).toBe(300);
  expect(mock.data).toMatchObject({ fitMaxZoom: 300 });
  expect(refresh).not.toHaveBeenCalled();
});

test.each([
  ['Max node width', 'maxNodeWidth', 160, 800, 10, 320],
  ['Max node height', 'maxNodeHeight', 120, 800, 10, 240],
  ['Sibling gap', 'siblingGap', 0, 200, 2, 12],
  ['Level gap', 'levelGap', 20, 400, 10, 60],
])('%s is a built-in slider: range, step, default and a px value', async (...args) => {
  const [name, key, min, max, step, defaultValue] = args;
  const { mock } = await setup();
  const def = definition(mock, name);
  expect(def.render).toBeUndefined();
  expect(def.control).toMatchObject({ type: 'slider', key, min, max, step, defaultValue });
  expect(def.control?.displayFormat?.(defaultValue)).toBe(`${defaultValue} px`);
  // Every bound and the default sit on the step grid, so the slider can reach them.
  for (const value of [min, max, defaultValue]) expect((value - min) % step).toBe(0);
});

test('the default layout is a dropdown bound to defaultLayout: layout names as values, translated labels', async () => {
  const { mock } = await setup();
  const control = definition(mock, 'Default layout').control;
  expect(control).toMatchObject({ type: 'dropdown', key: 'defaultLayout' });
  expect(Object.keys(control?.options ?? {})).toEqual(LAYOUT_NAMES);
  expect(control?.options).toEqual({
    'circle-clockwise': 'Balanced clockwise',
    'circle-counter-clockwise': 'Balanced counter-clockwise',
    'left-to-right': 'Left → right',
    'right-to-left': 'Right → left',
    'top-to-bottom': 'Top → bottom',
    'bottom-to-top': 'Bottom → top',
    kanban: 'Kanban',
  });
});

test('in German the layout labels are German, the values stay', async () => {
  useGerman();
  const { mock } = await setup();
  expect(definition(mock, 'Standard-Layout').control?.options).toEqual({
    'circle-clockwise': 'Ausgewogen im Uhrzeigersinn',
    'circle-counter-clockwise': 'Ausgewogen gegen den Uhrzeigersinn',
    'left-to-right': 'Links → rechts',
    'right-to-left': 'Rechts → links',
    'top-to-bottom': 'Oben → unten',
    'bottom-to-top': 'Unten → oben',
    kanban: 'Kanban',
  });
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

test('the default theme is a dropdown bound to defaultTheme: theme names as values, translated labels', async () => {
  const { mock } = await setup();
  expect(definition(mock, 'Default theme').control).toEqual({
    type: 'dropdown',
    key: 'defaultTheme',
    options: {
      none: 'None',
      rainbow: 'Rainbow',
      ocean: 'Ocean',
      forest: 'Forest',
      accent: 'Accent color',
    },
  });
});

test('in German the theme labels are German, the values stay', async () => {
  useGerman();
  const { mock } = await setup();
  expect(definition(mock, 'Standard-Farbschema').control?.options).toEqual({
    none: 'Keins',
    rainbow: 'Regenbogen',
    ocean: 'Ozean',
    forest: 'Wald',
    accent: 'Akzentfarbe',
  });
});

test('choosing a default theme in the tab saves it and re-applies only the theme of open maps', async () => {
  const { ws, plugin, mock } = await setup();
  const view = new MindMapView({ app: ws.app } as unknown as WorkspaceLeaf);
  const leaf = ws.addLeaf({ type: 'mind-mapper-view' });
  leaf.view = view;
  const refresh = vi.spyOn(view, 'refresh').mockImplementation(() => {});
  const applyTheme = vi.spyOn(view, 'applyTheme').mockImplementation(() => {});
  display(mock);
  await row('Default theme').dropdown?.changeHandler?.('forest');
  expect(plugin.settings.defaultTheme).toBe('forest');
  expect(mock.data).toMatchObject({ defaultTheme: 'forest' });
  // Spec "Color themes": pure CSS, no re-measure and no re-layout.
  expect(applyTheme).toHaveBeenCalledTimes(1);
  expect(refresh).not.toHaveBeenCalled();
  // Any other change still refreshes.
  await plugin.updateSettings({ defaultTheme: 'ocean', levelGap: 80 });
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('settings changed outside this window (Sync, another window) reach open maps without saving', async () => {
  const { ws, plugin, mock } = await setup();
  const view = new MindMapView({ app: ws.app } as unknown as WorkspaceLeaf);
  const leaf = ws.addLeaf({ type: 'mind-mapper-view' });
  leaf.view = view;
  const refresh = vi.spyOn(view, 'refresh').mockImplementation(() => {});
  const applyTheme = vi.spyOn(view, 'applyTheme').mockImplementation(() => {});
  const save = vi.spyOn(mock, 'saveData');
  mock.data = { ...plugin.settings, defaultTheme: 'forest' };
  await plugin.onExternalSettingsChange();
  expect(plugin.settings.defaultTheme).toBe('forest');
  expect(applyTheme).toHaveBeenCalledTimes(1);
  expect(refresh).not.toHaveBeenCalled();
  mock.data = { ...plugin.settings, levelGap: 80, siblingGap: 'nonsense' };
  await plugin.onExternalSettingsChange();
  expect(plugin.settings.levelGap).toBe(80);
  // validated like on load
  expect(plugin.settings.siblingGap).toBe(DEFAULT_SETTINGS.siblingGap);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
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

function slider(name: string) {
  const found = row(name).slider;
  if (!found) throw new Error(`no slider ${name}`);
  return found;
}

test('moving a slider saves the value and re-lays out open maps', async () => {
  const { ws, plugin, mock } = await setup();
  const view = new MindMapView({ app: ws.app } as unknown as WorkspaceLeaf);
  const leaf = ws.addLeaf({ type: 'mind-mapper-view' });
  leaf.view = view;
  const refresh = vi.spyOn(view, 'refresh').mockImplementation(() => {});
  display(mock);
  await slider('Level gap').changeHandler?.(80);
  expect(plugin.settings.levelGap).toBe(80);
  expect(mock.data).toMatchObject({ levelGap: 80 });
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('a slider value outside the range is clamped when saved', async () => {
  const { plugin, mock } = await setup();
  display(mock);
  await slider('Max node width').changeHandler?.(5000);
  expect(plugin.settings.maxNodeWidth).toBe(800);
});

test('the restore-default button of a slider saves the default again', async () => {
  const { plugin, mock } = await setup({ siblingGap: 40 });
  display(mock);
  const reset = row('Sibling gap').extraButtons[0];
  expect(reset?.icon).toBe('lucide-rotate-ccw');
  reset?.clickHandler?.();
  await vi.waitFor(() => expect(plugin.settings.siblingGap).toBe(12));
  expect(mock.data).toMatchObject({ siblingGap: 12 });
});

test('saving a slider settles: no component is resolved as a promise value', async () => {
  // Obsidian components are thenables; resolving a promise with one loops forever and once froze
  // Obsidian when a number setting was committed.
  const { plugin, mock } = await setup();
  display(mock);
  await slider('Max node width').changeHandler?.(500);
  expect(plugin.settings.maxNodeWidth).toBe(500);
  expect(slider('Max node width').thenCalls).toBe(0);
});

test('the About group shows the plugin version and links to the repository', async () => {
  const { mock } = await setup();
  expect(definition(mock, 'Version').desc).toBe('0.1.0');
  display(mock);
  const link = row('Source code').descEl?.querySelector('a');
  expect(link?.getAttribute('href')).toBe(
    'https://github.com/KingOfKalk/obsidian-plugin-mind-mapper',
  );
  expect(link?.textContent).toBe('github.com/KingOfKalk/obsidian-plugin-mind-mapper');
  expect(row('Source code').desc).toContain('github.com/KingOfKalk/obsidian-plugin-mind-mapper');
});

test('the About group links to the issue tracker', async () => {
  const { mock } = await setup();
  display(mock);
  const link = row('Report an issue').descEl?.querySelector('a');
  expect(link?.getAttribute('href')).toBe(
    'https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues',
  );
  expect(link?.textContent).toBe('github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues');
});

test('in German the groups, rows and values are German; layout values stay', async () => {
  useGerman();
  const { mock } = await setup();
  display(mock);
  expect(Setting.rows.map((s) => [s.group, s.name])).toEqual([
    ['Mindmap', 'Standard-Layout'],
    ['Mindmap', 'Eingeklappt starten'],
    ['Mindmap', 'Standard-Farbschema'],
    ['Mindmap', 'Maximaler Zoom beim Einpassen'],
    ['Knoten', 'Maximale Knotenbreite'],
    ['Knoten', 'Maximale Knotenhöhe'],
    ['Abstände', 'Geschwisterabstand'],
    ['Abstände', 'Ebenenabstand'],
    ['Über', 'Version'],
    ['Über', 'Quellcode'],
    ['Über', 'Problem melden'],
  ]);
  expect(row('Maximale Knotenbreite').desc).toBe(
    'Breiterer Inhalt wird abgeschnitten und ausgeblendet.',
  );
  expect(row('Maximale Knotenhöhe').desc).toBe(
    'Höherer Inhalt wird abgeschnitten und ausgeblendet.',
  );
  expect(slider('Maximale Knotenbreite').getValuePretty()).toBe('320 px');
  expect(slider('Maximaler Zoom beim Einpassen').getValuePretty()).toBe('150\u00a0%');
  expect(row('Maximaler Zoom beim Einpassen').desc).toBe(
    'Einpassen vergrößert kleine Mindmaps bis zu diesem Zoom. Geöffnete Mindmaps nutzen ihn beim nächsten Einpassen.',
  );
  expect([...(row('Standard-Layout').dropdown?.options.keys() ?? [])]).toEqual([...LAYOUT_NAMES]);
});
