import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ParserFixture } from '../src/dev/recordFixtures';

// Vitest runs from the repo root; import.meta.url is not a file URL under jsdom.
const FIXTURE_DIR = join(process.cwd(), 'test-vault', 'fixtures');

/** Cache snapshot recorded in real Obsidian by the dev command "Record parser fixtures". */
export function loadFixture(name: string): ParserFixture {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.cache.json`), 'utf8')) as ParserFixture;
}
