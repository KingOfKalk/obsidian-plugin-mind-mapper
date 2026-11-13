import * as path from 'node:path';

/** Headless Obsidian E2E (run via `xvfb-run`, see `npm run test:e2e`). */
export const config: WebdriverIO.Config = {
  runner: 'local',
  framework: 'mocha',
  specs: ['./e2e/specs/alignment*.e2e.ts'],
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
  // TEMP diagnostics (issue 62): rAF heartbeat gaps since the session started.
  before: async function () {
    const b = (globalThis as any).browser;
    await b.execute(() => {
      const w = window as any;
      w.__hb = {
        installedAt: Math.round(performance.now()),
        gaps: [] as string[],
        frames: 0,
        last: null as number | null,
      };
      const loop = (t: number) => {
        const hb = w.__hb;
        hb.frames++;
        if (hb.last !== null && t - hb.last > 100)
          hb.gaps.push(`${Math.round(hb.last)}+${Math.round(t - hb.last)}`);
        hb.last = t;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  },
  afterTest: async function (test: any) {
    const b = (globalThis as any).browser;
    const info = await b.execute(async () => {
      const w = window as any;
      let gpu: unknown = null;
      try {
        gpu = w.electron.remote.app.getGPUFeatureStatus();
      } catch (e) {
        gpu = String(e);
      }
      return JSON.stringify({
        now: Math.round(performance.now()),
        hb: w.__hb && { ...w.__hb, last: undefined },
        gpu,
      });
    });
    console.log('HEARTBEAT', test.title, info);
  },
};
