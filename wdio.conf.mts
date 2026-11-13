import * as path from 'node:path';

/** Headless Obsidian E2E (run via `xvfb-run`, see `npm run test:e2e`). */
export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  specs: ['./e2e/specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'obsidian',
      // Pinned: results must not change with an Obsidian update. OBSIDIAN_VERSION /
      // OBSIDIAN_INSTALLER run the suite against another version. The default is the manifest minAppVersion.
      browserVersion: process.env.OBSIDIAN_VERSION ?? '1.15.0',
      'wdio:obsidianOptions': {
        installerVersion: process.env.OBSIDIAN_INSTALLER ?? '1.15.0',
        plugins: ['.'],
        vault: 'tests/vault',
      },
    },
  ],
  services: ['obsidian'],
  reporters: ['obsidian'],
  cacheDir: path.resolve('.obsidian-cache'),
  mochaOpts: { ui: 'bdd', timeout: 120000 },
  logLevel: 'warn',
};
