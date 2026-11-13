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
  // TEMP diagnostics (issue 62): rAF heartbeat and a timer-based timeline since the session started.
  before: async function () {
    const b = (globalThis as any).browser;
    await b.execute(() => {
      const w = window as any;
      const hb = (w.__hb = {
        installedAt: Math.round(performance.now()),
        gaps: [] as string[],
        frames: 0,
        last: null as number | null,
        lastNow: null as number | null,
        timeline: [] as string[],
        longTasks: [] as string[],
      });
      const loop = (t: number) => {
        hb.frames++;
        const now = performance.now();
        if (hb.lastNow !== null && now - hb.lastNow > 100)
          hb.gaps.push(
            `now ${Math.round(hb.lastNow)}+${Math.round(now - hb.lastNow)} t ${Math.round(hb.last ?? 0)}->${Math.round(t)}`,
          );
        hb.last = t;
        hb.lastNow = now;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      let prevFrames = -1;
      setInterval(() => {
        if (hb.frames === prevFrames || hb.timeline.length < 3) {
          let state = '';
          try {
            const win = w.electron.remote.getCurrentWindow();
            state = `vis=${win.isVisible() ? 1 : 0} foc=${win.isFocused() ? 1 : 0} min=${win.isMinimized() ? 1 : 0} occ=${document.visibilityState}`;
          } catch (e) {
            state = String(e);
          }
          hb.timeline.push(`${Math.round(performance.now())}:f${hb.frames} ${state}`);
        }
        prevFrames = hb.frames;
      }, 250);
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            hb.longTasks.push(`${Math.round(e.startTime)}+${Math.round(e.duration)}`);
        }).observe({ type: 'longtask', buffered: true });
      } catch (e) {
        hb.longTasks.push(String(e));
      }
    });
  },
  afterTest: async function (test: any) {
    const b = (globalThis as any).browser;
    const info = await b.execute(async () => {
      const w = window as any;
      let procs: unknown = null;
      try {
        procs = w.electron.remote.app
          .getAppMetrics()
          .map((m: any) => `${m.type}:${m.pid}@${Math.round(m.creationTime)}`);
      } catch (e) {
        procs = String(e);
      }
      const paints = performance
        .getEntriesByType('paint')
        .map((e) => `${e.name}@${Math.round(e.startTime)}`);
      return JSON.stringify({
        now: Math.round(performance.now()),
        timeOrigin: Math.round(performance.timeOrigin),
        hb: w.__hb && { ...w.__hb, last: undefined, lastNow: undefined },
        procs,
        paints,
      });
    });
    console.log('HEARTBEAT', test.title, info);
  },
};
