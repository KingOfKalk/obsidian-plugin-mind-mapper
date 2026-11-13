import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

/**
 * The release bundle (options of esbuild.config.mjs, production) has no dev-only code: the dev
 * commands and the element ID overlay are stripped (issue #33), the element IDs stay. Runs the
 * esbuild CLI: its JS API refuses jsdom's TextEncoder.
 */
test('the production bundle contains no dev-only commands but keeps the element IDs', () => {
  const esbuild = createRequire(import.meta.url).resolve('esbuild/bin/esbuild');
  const bundle = execFileSync(
    esbuild,
    [
      'src/main.ts',
      '--bundle',
      '--format=cjs',
      '--target=es2022',
      '--platform=browser',
      '--external:obsidian',
      '--external:electron',
      '--external:@codemirror/*',
      '--external:@lezer/*',
      '--minify',
      '--tree-shaking=true',
      '--define:__DEV__=false',
      '--log-level=error',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
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
