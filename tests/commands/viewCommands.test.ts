import type { Command, WorkspaceLeaf } from 'obsidian';
import MindMapperPlugin from '../../src/main';
import { MindMapView } from '../../src/view/MindMapView';
import { FakeWorkspace, fakeApp, fakeManifest, useGerman } from '../helpers';
import type { Plugin as MockPlugin } from '../mocks/obsidian';

const COMMANDS = [
  ['zoom-in', 'Zoom in', 'zoomIn'],
  ['zoom-out', 'Zoom out', 'zoomOut'],
  ['fit-to-view', 'Fit to view', 'fitToView'],
  ['reset-zoom', 'Reset zoom to 100%', 'resetZoom'],
  ['collapse-all', 'Collapse all', 'collapseAll'],
  ['expand-all', 'Expand all', 'expandAll'],
  ['back-to-root', 'Back to root', 'backToRoot'],
  ['toggle-full-screen', 'Toggle full screen', 'toggleFullScreen'],
  ['change-layout', 'Change layout…', 'showLayoutMenu'],
  ['next-layout', 'Next layout', 'nextLayout'],
  ['change-theme', 'Change colour theme…', 'showThemeMenu'],
  ['next-theme', 'Next colour theme', 'nextTheme'],
] as const;

async function setup() {
  const ws = new FakeWorkspace();
  const plugin = new MindMapperPlugin(fakeApp(ws), fakeManifest());
  await plugin.onload();
  const commands = (plugin as unknown as MockPlugin).commands;
  const view = new MindMapView({ app: ws.app } as unknown as WorkspaceLeaf);
  return { ws, commands, view };
}

function find(commands: Command[], id: string): Command {
  const command = commands.find((c) => c.id === id);
  if (!command) throw new Error(`missing command ${id}`);
  return command;
}

test.each(COMMANDS)('%s is registered as "%s" without hotkeys', async (id, name) => {
  const { commands } = await setup();
  const command = find(commands, id);
  expect(command.name).toBe(name);
  expect(command.hotkeys).toBeUndefined();
});

test.each(COMMANDS)('%s is hidden without an active mind map view', async (id) => {
  const { commands, ws } = await setup();
  ws.activeView = {};
  expect(find(commands, id).checkCallback?.(true)).toBe(false);
});

test.each(COMMANDS)('%s calls %s on the active mind map view', async (id, _name, method) => {
  const { commands, ws, view } = await setup();
  ws.activeView = view;
  const spy = vi.spyOn(view, method).mockImplementation(() => {});
  const command = find(commands, id);
  expect(command.checkCallback?.(true)).toBe(true);
  expect(spy).not.toHaveBeenCalled();
  command.checkCallback?.(false);
  expect(spy).toHaveBeenCalledTimes(1);
});

test('in German the view commands have German names', async () => {
  useGerman();
  const { commands } = await setup();
  expect(COMMANDS.map(([id]) => find(commands, id).name)).toEqual([
    'Vergrößern',
    'Verkleinern',
    'An Ansicht anpassen',
    'Vergrößerung auf 100 % zurücksetzen',
    'Alle einklappen',
    'Alle ausklappen',
    'Zurück zum Hauptthema',
    'Vollbild umschalten',
    'Layout ändern…',
    'Nächstes Layout',
    'Farbschema ändern…',
    'Nächstes Farbschema',
  ]);
});

test('"Next layout" and "Next colour theme" cycle through all values of the active map and wrap around', async () => {
  const { commands, ws, view } = await setup();
  ws.addNote('Note.md', 'worked-example');
  await view.setState({ file: 'Note.md' }, { history: false });
  ws.activeView = view;
  const layouts: unknown[] = [];
  for (let i = 0; i < 7; i++) {
    find(commands, 'next-layout').checkCallback?.(false);
    layouts.push(view.getState().layout);
  }
  // From the default circle-clockwise.
  expect(layouts).toEqual([
    'circle-counter-clockwise',
    'left-to-right',
    'right-to-left',
    'top-to-bottom',
    'bottom-to-top',
    'circle-clockwise',
    'circle-counter-clockwise',
  ]);
  const themes: unknown[] = [];
  for (let i = 0; i < 6; i++) {
    find(commands, 'next-theme').checkCallback?.(false);
    themes.push(view.getState().theme);
  }
  // From the default rainbow.
  expect(themes).toEqual(['ocean', 'forest', 'accent', 'none', 'rainbow', 'ocean']);
});
