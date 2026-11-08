import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browser } from '@wdio/globals';
import { waitForCache } from './helpers';

/**
 * Records parser fixtures from real Obsidian: for every note directly in `fixtures/`, writes
 * `test-vault/fixtures/<name>.cache.json` = { obsidianVersion, text, cache } (same format as the
 * dev command "Record parser fixtures"). Run with `npm run fixtures:record`.
 */
describe('record parser fixtures', function () {
  it('writes one cache.json per fixture note', async function () {
    const paths = await browser.executeObsidian(({ app }) =>
      app.vault
        .getMarkdownFiles()
        .filter((file) => file.path === `fixtures/${file.name}`)
        .map((file) => file.path),
    );
    for (const path of paths) await waitForCache(path);

    const fixtures = await browser.executeObsidian(async ({ app, obsidian }, notePaths) => {
      const result: { name: string; json: string }[] = [];
      for (const path of notePaths) {
        const file = app.vault.getFileByPath(path);
        if (!file) continue;
        const fixture = {
          obsidianVersion: obsidian.apiVersion,
          text: await app.vault.cachedRead(file),
          cache: app.metadataCache.getFileCache(file),
        };
        result.push({ name: file.basename, json: JSON.stringify(fixture, null, 2) });
      }
      return result;
    }, paths);

    for (const { name, json } of fixtures) {
      writeFileSync(join('test-vault', 'fixtures', `${name}.cache.json`), `${json}\n`);
    }
    console.log(`Recorded ${fixtures.length} parser fixtures`);
  });
});
