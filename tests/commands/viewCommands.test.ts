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
  ['change-theme', 'Change color theme…', 'showThemeMenu'],
  ['next-theme', 'Next color theme', 'nextTheme'],
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
  vi.spyOn(view, 'showsMap').mockReturnValue(true);
  const spy = vi.spyOn(view, method).mockImplementation(() => {});
  const command = find(commands, id);
  expect(command.checkCallback?.(true)).toBe(true);
  expect(spy).not.toHaveBeenCalled();
  command.checkCallback?.(false);
  expect(spy).toHaveBeenCalledTimes(1);
});

const SWITCHER = ['change-layout', 'next-layout', 'change-theme', 'next-theme'];

test.each(SWITCHER)('%s is unavailable while the view shows a placeholder', async (id) => {
  const { commands, ws, view } = await setup();
  ws.activeView = view;
  // No note selected.
  await view.onOpen();
  expect(find(commands, id).checkCallback?.(true)).toBe(false);
  // Note not found.
  await view.setState({ file: 'Missing.md' }, { history: false });
  expect(find(commands, id).checkCallback?.(true)).toBe(false);
  // Not indexed yet ("Loading…").
  ws.addNote('Note.md', 'worked-example');
  vi.spyOn(ws.app.metadataCache, 'getFileCache').mockReturnValue(null);
  await view.setState({ file: 'Note.md' }, { history: false });
  expect(find(commands, id).checkCallback?.(true)).toBe(false);
  // Running it anyway does nothing.
  find(commands, id).checkCallback?.(false);
  expect(view.getState()).toMatchObject({ layout: null, theme: null });
});

test.each(SWITCHER)('%s is available once the view shows a map', async (id) => {
  const { commands, ws, view } = await setup();
  ws.addNote('Note.md', 'worked-example');
  await view.setState({ file: 'Note.md' }, { history: false });
  ws.activeView = view;
  expect(find(commands, id).checkCallback?.(true)).toBe(true);
});

test('the other view commands stay available on a placeholder', async () => {
  const { commands, ws, view } = await setup();
  ws.activeView = view;
  await view.onOpen();
  for (const [id] of COMMANDS.filter(([id]) => !SWITCHER.includes(id))) {
    expect(find(commands, id).checkCallback?.(true)).toBe(true);
  }
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

test('"Next layout" and "Next color theme" cycle through all values of the active map and wrap around', async () => {
  const { commands, ws, view } = await setup();
  ws.addNote('Note.md', 'worked-example');
  await view.setState({ file: 'Note.md' }, { history: false });
  ws.activeView = view;
  const layouts: unknown[] = [];
  for (let i = 0; i < 8; i++) {
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
    'kanban',
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

describe('drill-down commands (issue #23)', () => {
  const DRILL = [
    ['drill-down', 'Drill down into selection', 'drillDown', 'In die Auswahl eintauchen'],
    ['drill-out', 'Drill out one level', 'drillOut', 'Eine Ebene zurück'],
    ['show-whole-map', 'Show the whole map', 'showWholeMap', 'Ganze Mindmap anzeigen'],
  ] as const;

  test.each(DRILL)('%s is registered as "%s" without hotkeys', async (id, name) => {
    const { commands } = await setup();
    expect(find(commands, id).name).toBe(name);
    expect(find(commands, id).hotkeys).toBeUndefined();
  });

  test.each(DRILL)('%s has a German name', async (id, _name, _method, german) => {
    useGerman();
    const { commands } = await setup();
    expect(find(commands, id).name).toBe(german);
  });

  test.each(DRILL)('%s is hidden without an active mind map view', async (id) => {
    const { commands, ws } = await setup();
    ws.activeView = {};
    expect(find(commands, id).checkCallback?.(true)).toBe(false);
  });

  test('available only when it does something: into a selected node with children, out while drilled in', async () => {
    const { commands, ws, view } = await setup();
    ws.addNote('Note.md', 'crosslinks');
    await view.setState({ file: 'Note.md' }, { history: false });
    ws.activeView = view;
    const available = () => DRILL.map(([id]) => find(commands, id).checkCallback?.(true));
    expect(available()).toEqual([false, false, false]);
    view.select('Links/Alpha/#1'); // no children
    expect(available()).toEqual([false, false, false]);
    view.select('Links/Beta');
    expect(available()).toEqual([true, false, false]);
    find(commands, 'drill-down').checkCallback?.(false);
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta'] });
    // The centre itself is selected: only out.
    expect(available()).toEqual([false, true, true]);
    view.select('Links/Beta/Inner');
    expect(available()).toEqual([true, true, true]);
    find(commands, 'drill-down').checkCallback?.(false);
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta', 'Links/Beta/Inner'] });
    find(commands, 'drill-out').checkCallback?.(false);
    expect(view.getState()).toMatchObject({ drill: ['Links/Beta'] });
    find(commands, 'drill-down').checkCallback?.(true);
    view.select('Links/Beta/Inner');
    find(commands, 'drill-down').checkCallback?.(false);
    find(commands, 'show-whole-map').checkCallback?.(false);
    expect(view.getState()).toMatchObject({ drill: [] });
    expect(available()).toEqual([true, false, false]);
  });
});
