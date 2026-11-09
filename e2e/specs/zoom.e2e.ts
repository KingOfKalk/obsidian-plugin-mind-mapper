import { browser, expect } from '@wdio/globals';
import { openMindMap, settle } from '../helpers';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Screen rects of every node and collapse toggle / badge, relative to the canvas, and the canvas size. */
function rectsInCanvas(): Promise<{
  width: number;
  height: number;
  boxes: (Box & { what: string })[];
}> {
  return browser.execute(() => {
    const canvas = document.querySelector('.mind-mapper-canvas');
    if (!canvas) throw new Error('no canvas');
    const c = canvas.getBoundingClientRect();
    const boxes = Array.from(
      canvas.querySelectorAll<HTMLElement>('.mind-mapper-node, .mind-mapper-collapse'),
    ).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        what: `${el.className} ${el.dataset.nodeId ?? ''}`,
        left: r.left - c.left,
        top: r.top - c.top,
        right: r.right - c.left,
        bottom: r.bottom - c.top,
      };
    });
    return { width: c.width, height: c.height, boxes };
  });
}

function zoomValue(): Promise<string> {
  return browser.$('.mind-mapper-zoom-input').getValue();
}

/** The zoom of the world transform (`scale(…)`). */
function worldZoom(): Promise<number> {
  return browser.execute(() => {
    const el = document.querySelector<HTMLElement>('.mind-mapper-world');
    const match = /scale\(([\d.]+)\)/.exec(el?.style.transform ?? '');
    return match?.[1] ? Number(match[1]) : NaN;
  });
}

async function expectZoom(label: string, zoom: number): Promise<void> {
  await browser.waitUntil(async () => (await zoomValue()) === label, {
    timeout: 5000,
    timeoutMsg: `zoom label is "${await zoomValue()}", expected "${label}"`,
  });
  expect(await worldZoom()).toBeCloseTo(zoom, 6);
}

async function control(label: string): Promise<void> {
  await browser.$(`.mind-mapper-controls button[aria-label="${label}"]`).click();
}

describe('zoom controls', function () {
  this.timeout(60000);

  for (const note of ['fixtures/numbered.md', 'fixtures/worked-example.md']) {
    it(`fit of the collapsed ${note} keeps every node and badge inside the margin`, async function () {
      await openMindMap(note);
      await settle();
      await browser.executeObsidianCommand('mind-mapper:collapse-all');
      await settle();
      await control('Fit to view');
      await settle();
      const { width, height, boxes } = await rectsInCanvas();
      expect(boxes.some((b) => b.what.includes('is-collapsed'))).toBe(true);
      const margin = Math.max(48, 0.08 * Math.min(width, height));
      const outside = boxes.filter(
        (b) =>
          b.left < margin - 0.5 ||
          b.top < margin - 0.5 ||
          b.right > width - margin + 0.5 ||
          b.bottom > height - margin + 0.5,
      );
      expect(outside).toEqual([]);
      await browser.executeObsidianCommand('mind-mapper:expand-all');
    });
  }

  it('typing a zoom and Enter applies it; zoom in / out snap to the next step', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    const input = browser.$('.mind-mapper-zoom-input');
    await input.click();
    // The click selected the shown value: typing replaces it.
    await browser.keys(['1', '2', '9', 'Enter']);
    await expectZoom('129%', 1.29);
    await control('Zoom in');
    await expectZoom('150%', 1.5);
    await input.click();
    await browser.keys(['1', '2', '9', 'Enter']);
    await expectZoom('129%', 1.29);
    await control('Zoom out');
    await expectZoom('125%', 1.25);
  });

  it('Esc in the zoom input restores the value and does not leave full screen', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await expect(browser.$('.mind-mapper-full-screen')).toExist();
    await settle();
    // The full-screen fit follows the resize of the overlay.
    await browser.pause(1000);
    const before = await zoomValue();
    await browser.$('.mind-mapper-zoom-input').click();
    const afterClick = await zoomValue();
    await browser.keys(['3', '3']);
    const typed = await zoomValue();
    await browser.keys(['Escape']);
    expect([before, afterClick, typed, await zoomValue()]).toEqual([before, before, '33', before]);
    await expect(browser.$('.mind-mapper-full-screen')).toExist();
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await expect(browser.$('.mind-mapper-full-screen')).not.toExist();
  });

  it('the chevron menu lists the presets and Fit to view; 75 % applies', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await browser.executeObsidianCommand('mind-mapper:reset-zoom');
    await expectZoom('100%', 1);
    await control('Zoom presets');
    const menu = browser.$('.menu');
    await menu.waitForExist({ timeout: 5000 });
    const items = await browser.execute(() =>
      Array.from(document.querySelectorAll('.menu .menu-item, .menu .menu-separator')).map((el) =>
        el.classList.contains('menu-separator')
          ? '---'
          : `${el.textContent?.trim() ?? ''}${el.classList.contains('mod-checked') || el.querySelector('.menu-item-icon svg.lucide-check, .mod-checked') ? ' (checked)' : ''}`,
      ),
    );
    expect(items).toEqual([
      '50%',
      '75%',
      '100% (checked)',
      '125%',
      '150%',
      '200%',
      '---',
      'Fit to view',
    ]);
    await browser.execute(() => {
      const item = Array.from(document.querySelectorAll<HTMLElement>('.menu .menu-item')).find(
        (el) => el.textContent?.trim() === '75%',
      );
      if (!item) throw new Error('no 75% item');
      item.click();
    });
    await expectZoom('75%', 0.75);
    await expect(browser.$('.menu')).not.toExist();
  });
});
