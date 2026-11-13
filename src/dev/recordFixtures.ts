import { apiVersion, type App, type CachedMetadata } from 'obsidian';

export const FIXTURE_FOLDER = 'fixtures';

export interface ParserFixture {
  obsidianVersion: string;
  text: string;
  cache: CachedMetadata | null;
}

/** Dev-only: snapshots the metadata cache of every note directly in `fixtures/` for parser tests. */
export async function recordFixtures(app: App): Promise<number> {
  const files = app.vault
    .getMarkdownFiles()
    .filter((file) => file.path === `${FIXTURE_FOLDER}/${file.name}`);
  for (const file of files) {
    const fixture: ParserFixture = {
      obsidianVersion: apiVersion,
      text: await app.vault.cachedRead(file),
      cache: app.metadataCache.getFileCache(file),
    };
    await writeFile(
      app,
      `${FIXTURE_FOLDER}/${file.basename}.cache.json`,
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
  }
  return files.length;
}

/** Writes `data` to `path` through the Vault API: overwrites the file or creates it. */
async function writeFile(app: App, path: string, data: string): Promise<void> {
  const existing = app.vault.getFileByPath(path);
  if (existing) await app.vault.modify(existing, data);
  else await app.vault.create(path, data);
}
