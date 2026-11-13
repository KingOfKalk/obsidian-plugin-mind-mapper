import { execFileSync } from 'node:child_process';

/**
 * Bundles with the release options of esbuild.config.mjs (shared module `scripts/build-options.mjs`)
 * in a child Node process: esbuild's JS API refuses jsdom's TextEncoder. Prints the bundle.
 */
const BUNDLE_SCRIPT = `
import esbuild from 'esbuild';
import { buildOptions } from './scripts/build-options.mjs';
const options = buildOptions({ production: true, env: {} });
const result = await esbuild.build({ ...options, write: false, logLevel: 'error' });
process.stdout.write(result.outputFiles[0].text);
`;

/**
 * The release bundle has no dev-only code: the dev commands and the element ID overlay are
 * stripped (issue #33), the element IDs stay.
 */
test('the production bundle contains no dev-only commands but keeps the element IDs', () => {
  const bundle = execFileSync(process.execPath, ['--input-type=module', '-e', BUNDLE_SCRIPT], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  // Booleans: a failure must not print the whole bundle.
  const has = (text: string) => bundle.includes(text);
  expect({ attribute: has('data-mm-id'), id: has('controls.fit') }).toEqual({
    attribute: true,
    id: true,
  });
  expect({
    overlayCommand: has('show-element-ids'),
    overlay: has('mind-mapper-dev-id-overlay'),
    fixtureCommand: has('record-parser-fixtures'),
  }).toEqual({ overlayCommand: false, overlay: false, fixtureCommand: false });
}, 30000);
