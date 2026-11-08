import { writeFileSync } from 'node:fs';
import { browser } from '@wdio/globals';
import { waitForCache } from '../helpers';
import { generateNote } from './generateNote';

interface Metrics {
  nodes: number;
  renderedNodes: number;
  firstLayoutMs: number;
  settleMs: number;
  relayouts: number;
  panFrames: number;
  longestPanFrameMs: number;
}

/**
 * Performance spike (spec "Performance"): no timing assertions, only errors fail. Prints a table
 * and writes e2e/perf/last-run.json. Run with `npm run perf:e2e`.
 */
describe('performance spike', function () {
  this.timeout(900000);
  const results: Metrics[] = [];

  for (const nodes of [1000, 5000]) {
    it(`${nodes} nodes`, async function () {
      const path = `perf-${nodes}.md`;
      await browser.executeObsidian(
        async ({ app }, notePath, text) => {
          await app.vault.adapter.write(notePath, text);
        },
        path,
        generateNote(nodes, nodes),
      );
      await waitForCache(path);

      const metrics = await browser.executeObsidian(
        async ({ app }, notePath, nodeCount) => {
          const win = window;
          const frame = (): Promise<number> => new Promise((r) => win.requestAnimationFrame(r));
          const signature = (): string => {
            let sum = 0;
            let count = 0;
            for (const el of Array.from(
              document.querySelectorAll<HTMLElement>('.mind-mapper-node'),
            )) {
              sum += parseFloat(el.style.left) + parseFloat(el.style.top) * 3;
              sum += parseFloat(el.style.width) * 7 + parseFloat(el.style.height) * 11;
              count++;
            }
            return `${count}:${sum}`;
          };

          app.workspace.detachLeavesOfType('mind-mapper-view');
          const start = performance.now();
          const leaf = app.workspace.getLeaf('split', 'vertical');
          await leaf.setViewState({
            type: 'mind-mapper-view',
            active: true,
            state: { file: notePath },
          });
          while (!document.querySelector('.mind-mapper-node.is-root')) await frame();
          const firstLayoutMs = performance.now() - start;

          let previous = signature();
          let stableSince = performance.now();
          let relayouts = 0;
          while (performance.now() - stableSince < 500) {
            await new Promise((r) => win.setTimeout(r, 50));
            const current = signature();
            if (current !== previous) {
              relayouts++;
              previous = current;
              stableSince = performance.now();
            }
            if (performance.now() - start > 600000) break;
          }
          const settleMs = stableSince - start;

          const canvas = document.querySelector<HTMLElement>('.mind-mapper-canvas');
          let last = await frame();
          let longest = 0;
          let frames = 0;
          const panStart = performance.now();
          while (performance.now() - panStart < 2000) {
            canvas?.dispatchEvent(
              new WheelEvent('wheel', { deltaX: 3, deltaY: 7, bubbles: true, cancelable: true }),
            );
            const now = await frame();
            longest = Math.max(longest, now - last);
            last = now;
            frames++;
          }

          return {
            nodes: nodeCount,
            renderedNodes: document.querySelectorAll('.mind-mapper-node').length,
            firstLayoutMs: Math.round(firstLayoutMs),
            settleMs: Math.round(settleMs),
            relayouts,
            panFrames: frames,
            longestPanFrameMs: Math.round(longest),
          };
        },
        path,
        nodes,
      );
      results.push(metrics);
      console.log(`PERF ${JSON.stringify(metrics)}`);
    });
  }

  after(function () {
    console.table(results);
    writeFileSync('e2e/perf/last-run.json', `${JSON.stringify(results, null, 2)}\n`);
  });
});
