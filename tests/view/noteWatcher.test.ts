import type { CachedMetadata, EventRef } from 'obsidian';
import {
  LIVE_UPDATE_DEBOUNCE_MS,
  NoteWatcher,
  type NoteWatcherHost,
} from '../../src/view/noteWatcher';
import { fakeFile, FakeWorkspace } from '../helpers';

/** Note events of the map view (issue #50): live update (debounced), rename, delete, re-create. */

const CACHE = {} as CachedMetadata;

function setup() {
  const ws = new FakeWorkspace();
  const state = { path: 'Note.md' as string | null, hasMap: false };
  const registered: EventRef[] = [];
  const host = {
    win: () => window,
    path: () => state.path,
    hasMap: () => state.hasMap,
    register: (ref: EventRef) => registered.push(ref),
    changed: vi.fn(),
    renamed: vi.fn(),
    deleted: vi.fn(),
    recreated: vi.fn(),
  } satisfies NoteWatcherHost;
  const watcher = new NoteWatcher(ws.app, host);
  return { ws, state, host, watcher, registered };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('listens once, however often a note loads; every listener is registered with the view', () => {
  const { ws, watcher, registered } = setup();
  watcher.watch();
  watcher.watch();
  expect(ws.metadataCache.listenerCount).toBe(1);
  expect(['rename', 'delete', 'create'].map((n) => ws.vault.listenerCount(n))).toEqual([1, 1, 1]);
  expect(registered).toHaveLength(4);
});

test('the first change renders at once; with a map shown, changes are debounced, last wins', () => {
  const { ws, state, host, watcher } = setup();
  watcher.watch();
  ws.metadataCache.trigger('Note.md', 'first', CACHE);
  expect(host.changed).toHaveBeenCalledTimes(1);
  state.hasMap = true;
  ws.metadataCache.trigger('Note.md', 'second', CACHE);
  ws.metadataCache.trigger('Note.md', 'third', CACHE);
  vi.advanceTimersByTime(LIVE_UPDATE_DEBOUNCE_MS - 1);
  expect(host.changed).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(host.changed).toHaveBeenCalledTimes(2);
  expect(host.changed.mock.calls[1]?.[1]).toBe('third');
});

test('changes of other notes are ignored', () => {
  const { ws, host, watcher } = setup();
  watcher.watch();
  ws.metadataCache.trigger('Other.md', 'text', CACHE);
  vi.runAllTimers();
  expect(host.changed).not.toHaveBeenCalled();
});

test('cancelUpdate and watch drop a debounced change', () => {
  const { ws, state, host, watcher } = setup();
  state.hasMap = true;
  watcher.watch();
  ws.metadataCache.trigger('Note.md', 'text', CACHE);
  watcher.cancelUpdate();
  ws.metadataCache.trigger('Note.md', 'text', CACHE);
  watcher.watch();
  vi.runAllTimers();
  expect(host.changed).not.toHaveBeenCalled();
});

test('rename of the note is reported with its old path; other renames are not', () => {
  const { ws, host, watcher } = setup();
  watcher.watch();
  ws.vault.trigger('rename', fakeFile('Other.md'), 'Elsewhere.md');
  ws.vault.trigger('rename', fakeFile('New.md'), 'Note.md');
  expect(host.renamed).toHaveBeenCalledTimes(1);
  expect(host.renamed.mock.calls[0]?.[1]).toBe('Note.md');
});

test('delete drops a pending change; only a note created at the path after it is reported', () => {
  const { ws, state, host, watcher } = setup();
  state.hasMap = true;
  watcher.watch();
  ws.vault.trigger('create', fakeFile('Note.md'));
  expect(host.recreated).not.toHaveBeenCalled();
  ws.metadataCache.trigger('Note.md', 'text', CACHE);
  ws.vault.trigger('delete', fakeFile('Other.md'));
  expect(host.deleted).not.toHaveBeenCalled();
  ws.vault.trigger('delete', fakeFile('Note.md'));
  expect(host.deleted).toHaveBeenCalledTimes(1);
  vi.runAllTimers();
  expect(host.changed).not.toHaveBeenCalled();
  ws.vault.trigger('create', fakeFile('Other.md'));
  ws.vault.trigger('create', fakeFile('Note.md'));
  expect(host.recreated).toHaveBeenCalledTimes(1);
  // Loaded again: no longer deleted.
  watcher.watch();
  ws.vault.trigger('create', fakeFile('Note.md'));
  expect(host.recreated).toHaveBeenCalledTimes(1);
});

test('stop removes every listener and drops a pending change', () => {
  const { ws, state, host, watcher } = setup();
  state.hasMap = true;
  watcher.watch();
  ws.metadataCache.trigger('Note.md', 'text', CACHE);
  watcher.stop();
  vi.runAllTimers();
  expect(host.changed).not.toHaveBeenCalled();
  expect(ws.metadataCache.listenerCount).toBe(0);
  expect(['rename', 'delete', 'create'].map((n) => ws.vault.listenerCount(n))).toEqual([0, 0, 0]);
  // Listens again on the next load.
  watcher.watch();
  expect(ws.metadataCache.listenerCount).toBe(1);
});
