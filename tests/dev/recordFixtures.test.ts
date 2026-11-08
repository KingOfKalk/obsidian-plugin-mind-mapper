import type { App, CachedMetadata, TFile } from 'obsidian';
import { recordFixtures } from '../../src/dev/recordFixtures';
import { fakeFile } from '../helpers';

function fakeApp(files: Record<string, { text: string; cache: CachedMetadata | null }>) {
  const writes = new Map<string, string>();
  const app = {
    vault: {
      getMarkdownFiles: (): TFile[] => Object.keys(files).map((path) => fakeFile(path)),
      cachedRead: (file: TFile) => Promise.resolve(files[file.path]?.text ?? ''),
      adapter: {
        write: (path: string, data: string) => {
          writes.set(path, data);
          return Promise.resolve();
        },
      },
    },
    metadataCache: {
      getFileCache: (file: TFile) => files[file.path]?.cache ?? null,
    },
  } as unknown as App;
  return { app, writes };
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
