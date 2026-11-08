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
    await app.vault.adapter.write(
      `${FIXTURE_FOLDER}/${file.basename}.cache.json`,
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
  }
  return files.length;
}
