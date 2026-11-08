import type { Command } from 'obsidian';
import MindMapperPlugin from '../src/main';
import { MindMapView } from '../src/view/MindMapView';
import { FakeWorkspace, fakeApp, fakeFile, fakeManifest } from './helpers';
import { Notice, type Plugin as MockPlugin } from './mocks/obsidian';

async function loadPlugin(ws = new FakeWorkspace()): Promise<MockPlugin> {
  const plugin = new MindMapperPlugin(fakeApp(ws), fakeManifest());
  await plugin.onload();
  return plugin as unknown as MockPlugin;
}

function openCommand(plugin: MockPlugin): Command {
  const command = plugin.commands.find((c) => c.id === 'open-as-mind-map');
  if (!command) throw new Error('command not registered');
  return command;
}

test('plugin loads and unloads without error', async () => {
  const plugin = await loadPlugin();
  plugin.onunload();
});

test('registers the mind map view', async () => {
  const ws = new FakeWorkspace();
  const plugin = await loadPlugin(ws);
  const factory = plugin.viewFactories.get('mind-mapper-view');
  expect(factory).toBeDefined();
  const leaf = ws.addLeaf({ type: 'empty' }).asLeaf();
  expect(factory?.(leaf)).toBeInstanceOf(MindMapView);
});

test('command is hidden without a markdown file', async () => {
  const ws = new FakeWorkspace();
  const command = openCommand(await loadPlugin(ws));
  ws.activeFile = null;
  expect(command.checkCallback?.(true)).toBe(false);
  ws.activeFile = fakeFile('Board.canvas');
  expect(command.checkCallback?.(true)).toBe(false);
});

test('command is available for markdown and opens the map', async () => {
  const ws = new FakeWorkspace();
  const command = openCommand(await loadPlugin(ws));
  ws.activeFile = fakeFile('Note.md');
  expect(command.name).toBe('Open as mind map');
  expect(command.checkCallback?.(true)).toBe(true);
  expect(ws.getLeaf).not.toHaveBeenCalled();
  command.checkCallback?.(false);
  await vi.waitFor(() => expect(ws.revealLeaf).toHaveBeenCalled());
  expect(ws.leaves[0]?.viewState).toEqual({
    type: 'mind-mapper-view',
    active: true,
    state: { file: 'Note.md' },
  });
});

test('command has no default hotkeys', async () => {
  expect(openCommand(await loadPlugin()).hotkeys).toBeUndefined();
});

test('onunload does not detach leaves', async () => {
  const ws = new FakeWorkspace();
  const plugin = await loadPlugin(ws);
  plugin.onunload();
  expect(ws.detachLeavesOfType).not.toHaveBeenCalled();
});

test('dev builds register the parser fixture recorder command', async () => {
  const plugin = await loadPlugin();
  const command = plugin.commands.find((c) => c.id === 'record-parser-fixtures');
  expect(command?.name).toBe('Record parser fixtures (dev)');
  expect(command?.hotkeys).toBeUndefined();
});

test('registers the map as a hover link source for page preview', async () => {
  const plugin = await loadPlugin();
  expect(
    (plugin as unknown as { hoverSources: Map<string, unknown> }).hoverSources.get(
      'mind-mapper-view',
    ),
  ).toEqual({ display: 'Mind Mapper', defaultMod: true });
});

test('plugin feeds active-leaf-change into the recency tracker', async () => {
  const ws = new FakeWorkspace();
  const plugin = (await loadPlugin(ws)) as unknown as MindMapperPlugin;
  const a = ws.addLeaf({ type: 'markdown' }).asLeaf();
  const b = ws.addLeaf({ type: 'markdown' }).asLeaf();
  ws.trigger('active-leaf-change', b);
  expect(plugin.recency.mostRecent([a, b])).toBe(b);
  ws.trigger('active-leaf-change', a);
  expect(plugin.recency.mostRecent([a, b])).toBe(a);
});

test('a rename moves map leaves that are not loaded yet (deferred) to the new path', async () => {
  const ws = new FakeWorkspace();
  await loadPlugin(ws);
  const deferred = ws.addLeaf({ type: 'mind-mapper-view', state: { file: 'old.md' } });
  deferred.isDeferred = true;
  const loaded = ws.addLeaf({ type: 'mind-mapper-view', state: { file: 'old.md' } });
  const other = ws.addLeaf({ type: 'mind-mapper-view', state: { file: 'other.md' } });
  other.isDeferred = true;
  ws.vault.trigger('rename', fakeFile('new.md'), 'old.md');
  expect(deferred.setViewState).toHaveBeenCalledWith({
    type: 'mind-mapper-view',
    state: { file: 'new.md' },
  });
  // a loaded view follows the rename itself
  expect(loaded.setViewState).not.toHaveBeenCalled();
  expect(other.setViewState).not.toHaveBeenCalled();
});

test('warnOnce shows a notice once per id for the session', async () => {
  const plugin = (await loadPlugin()) as unknown as MindMapperPlugin;
  Notice.messages = [];
  plugin.warnOnce('a', 'first');
  plugin.warnOnce('a', 'first again');
  plugin.warnOnce('b', 'second');
  expect(Notice.messages).toEqual(['first', 'second']);
});
