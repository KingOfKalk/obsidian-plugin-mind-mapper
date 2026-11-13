import type { App, CachedMetadata, TFile } from 'obsidian';
import { recordFixtures } from '../../src/dev/recordFixtures';
import { fakeFile } from '../helpers';

/** Vault with `files` (notes) and `existing` (other files, e.g. earlier recordings); no adapter. */
function fakeApp(
  files: Record<string, { text: string; cache: CachedMetadata | null }>,
  existing: string[] = [],
) {
  const writes = new Map<string, string>();
  const created: string[] = [];
  const modified: string[] = [];
  const known = new Set([...Object.keys(files), ...existing]);
  const app = {
    vault: {
      getMarkdownFiles: (): TFile[] => Object.keys(files).map((path) => fakeFile(path)),
      cachedRead: (file: TFile) => Promise.resolve(files[file.path]?.text ?? ''),
      getFileByPath: (path: string) => (known.has(path) ? fakeFile(path) : null),
      create: (path: string, data: string) => {
        if (known.has(path)) return Promise.reject(new Error('File already exists.'));
        known.add(path);
        created.push(path);
        writes.set(path, data);
        return Promise.resolve(fakeFile(path));
      },
      modify: (file: TFile, data: string) => {
        modified.push(file.path);
        writes.set(file.path, data);
        return Promise.resolve();
      },
    },
    metadataCache: {
      getFileCache: (file: TFile) => files[file.path]?.cache ?? null,
    },
  } as unknown as App;
  return { app, writes, created, modified };
}

test('writes one cache.json per markdown note directly in fixtures/', async () => {
  const cacheA = { headings: [] } as CachedMetadata;
  const { app, writes } = fakeApp({
    'fixtures/a.md': { text: '# A', cache: cacheA },
    'fixtures/b.md': { text: '', cache: null },
    'fixtures/sub/c.md': { text: 'c', cache: {} },
    'other/d.md': { text: 'd', cache: {} },
  });

  await expect(recordFixtures(app)).resolves.toBe(2);

  expect([...writes.keys()].sort()).toEqual(['fixtures/a.cache.json', 'fixtures/b.cache.json']);
  const a = writes.get('fixtures/a.cache.json') ?? '';
  expect(a.endsWith('}\n')).toBe(true);
  expect(JSON.parse(a)).toEqual({ obsidianVersion: '1.7.2-test', text: '# A', cache: cacheA });
  expect(JSON.parse(writes.get('fixtures/b.cache.json') ?? '')).toEqual({
    obsidianVersion: '1.7.2-test',
    text: '',
    cache: null,
  });
});

test('creates a new recording and overwrites an existing one through the vault', async () => {
  const { app, created, modified } = fakeApp(
    {
      'fixtures/new.md': { text: 'n', cache: {} },
      'fixtures/old.md': { text: 'o', cache: {} },
    },
    ['fixtures/old.cache.json'],
  );

  await recordFixtures(app);

  expect(created).toEqual(['fixtures/new.cache.json']);
  expect(modified).toEqual(['fixtures/old.cache.json']);
});
