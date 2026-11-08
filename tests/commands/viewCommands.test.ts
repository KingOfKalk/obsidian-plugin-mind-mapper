import type { Command, WorkspaceLeaf } from 'obsidian';
import MindMapperPlugin from '../../src/main';
import { MindMapView } from '../../src/view/MindMapView';
import { FakeWorkspace, fakeApp, fakeManifest } from '../helpers';
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
