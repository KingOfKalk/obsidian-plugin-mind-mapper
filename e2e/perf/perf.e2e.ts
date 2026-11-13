import { readFileSync, writeFileSync } from 'node:fs';
import { browser } from '@wdio/globals';
import { waitForCache } from '../helpers';
import { generateNote } from './generateNote';

interface Metrics {
  nodes: number;
  firstLayoutMs: number;
  settleMs: number;
  relayouts: number;
  panFrames: number;
  longestPanFrameMs: number;
  renderedAtFit: number;
  renderedAt100: number;
  pan100Frames: number;
  pan100LongestFrameMs: number;
  zoomFrames: number;
  zoomLongestFrameMs: number;
  renderedAt25: number;
  pan25LongestFrameMs: number;
  editLatencyMs: number;
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

          const rendered = (): number => document.querySelectorAll('.mind-mapper-node').length;
          const renderedAtFit = rendered();

          /** Longest frame while `step` runs once per frame for 2 s. */
          const measureFrames = async (step: (i: number) => void): Promise<[number, number]> => {
            let previous = await frame();
            let worst = 0;
            let count = 0;
            const begin = performance.now();
            while (performance.now() - begin < 2000) {
              step(count);
              const now = await frame();
              worst = Math.max(worst, now - previous);
              previous = now;
              count++;
            }
            return [count, Math.round(worst)];
          };

          const commands = (
            app as unknown as { commands: { executeCommandById(id: string): void } }
          ).commands;
          commands.executeCommandById('mind-mapper:reset-zoom');
          // at 100 % the panned fit view may show empty space: start at the root
          commands.executeCommandById('mind-mapper:back-to-root');
          // both glide (issue #24): measure at their end
          while (document.querySelector('.mind-mapper-canvas.is-animating')) await frame();
          for (let i = 0; i < 10; i++) await frame();
          const renderedAt100 = rendered();
          const [pan100Frames, pan100LongestFrameMs] = await measureFrames(() =>
            canvas?.dispatchEvent(
              new WheelEvent('wheel', { deltaX: 9, deltaY: 21, bubbles: true, cancelable: true }),
            ),
          );
          const rect = canvas?.getBoundingClientRect();
          const [zoomFrames, zoomLongestFrameMs] = await measureFrames((i) =>
            canvas?.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: Math.floor(i / 30) % 2 === 0 ? 10 : -10,
                ctrlKey: true,
                clientX: (rect?.left ?? 0) + 100,
                clientY: (rect?.top ?? 0) + 100,
                bubbles: true,
                cancelable: true,
              }),
            ),
          );

          // 25 %: unreadable text, many nodes in view (content cap / skeleton)
          const mapView = leaf.view as unknown as {
            getTransform(): { x: number; y: number; zoom: number };
            setTransform(t: { x: number; y: number; zoom: number }): void;
          };
          mapView.setTransform({ ...mapView.getTransform(), zoom: 0.25 });
          for (let i = 0; i < 10; i++) await frame();
          const renderedAt25 = rendered();
          const [, pan25LongestFrameMs] = await measureFrames(() =>
            canvas?.dispatchEvent(
              new WheelEvent('wheel', { deltaX: 9, deltaY: 21, bubbles: true, cancelable: true }),
            ),
          );

          // Edit latency: write a paragraph under the H1 (vault.modify, as a save does), then time
          // until the map has settled: 300 ms debounce, Obsidian's cache parse, parse, layout,
          // render, measuring and re-layouts. Every (re-)layout is a new layout object of the view;
          // the new node is the root's first child, often off screen (culled), so the DOM cannot
          // show it. At 100 % on the root, like reading while typing.
          commands.executeCommandById('mind-mapper:reset-zoom');
          commands.executeCommandById('mind-mapper:back-to-root');
          while (document.querySelector('.mind-mapper-canvas.is-animating')) await frame();
          const view = leaf.view as unknown as { layout?: { nodes: { node: { id: string } }[] } };
          if (!('layout' in view)) throw new Error('MindMapView has no `layout` field any more');
          /** Time of the last layout change once `done()` holds and the layout kept for 500 ms. */
          const settled = async (since: number, done: () => boolean): Promise<number> => {
            let before = view.layout;
            let changedAt = since;
            for (;;) {
              const now = await frame();
              if (view.layout !== before) {
                before = view.layout;
                changedAt = now;
              }
              if (done() && now - changedAt >= 500) return changedAt;
              if (now - since > 20000) throw new Error('map did not settle after the edit');
            }
          };
          await settled(performance.now(), () => true);
          const file = app.vault.getFileByPath(notePath);
          if (!file) throw new Error(`missing ${notePath}`);
          const text = await app.vault.read(file);
          const heading = text.indexOf('\n');
          const edited = `${text.slice(0, heading)}\n\nEdited paragraph.\n${text.slice(heading)}`;
          const newId = `Generated ${nodeCount}/#1`;
          const editStart = performance.now();
          await app.vault.modify(file, edited);
          const editSettled = await settled(
            editStart,
            () => view.layout?.nodes.some((p) => p.node.id === newId) ?? false,
          );

          return {
            nodes: nodeCount,
            editLatencyMs: Math.round(editSettled - editStart),
            renderedAt25,
            pan25LongestFrameMs,
            renderedAtFit,
            renderedAt100,
            pan100Frames,
            pan100LongestFrameMs,
            zoomFrames,
            zoomLongestFrameMs,
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
    // Diff against the committed baseline (no assertions: frame times are not stable enough).
    const baseline = JSON.parse(readFileSync('e2e/perf/baseline.json', 'utf8')) as Record<
      string,
      number
    >[];
    for (const run of results) {
      const base = baseline.find((b) => b.nodes === run.nodes) ?? {};
      const lines = Object.entries(run).map(
        ([key, value]) => `  ${key}: ${base[key] ?? '-'} -> ${value}`,
      );
      console.log(`PERF-DIFF ${run.nodes} nodes\n${lines.join('\n')}`);
    }
  });
});
