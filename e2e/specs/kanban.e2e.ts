import { browser, expect } from '@wdio/globals';
import { byId, mouseOnNode, nodeBoxes, openMindMap, overlaps, settle } from '../helpers';

/** Issue #32: the kanban layout in real Obsidian. */
const NOTE = 'fixtures/kanban.md';
const P = 'Product launch';
const COLUMNS = [`${P}/To do`, `${P}/Doing`, `${P}/Done`];

type Plugins = {
  plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
};

async function updateSettings(patch: Record<string, unknown>): Promise<void> {
  await browser.executeObsidian(async ({ app }, settings) => {
    await (app as unknown as Plugins).plugins.plugins['mind-mapper']?.updateSettings(settings);
  }, patch);
}

/** Card count bubbles: column ID -> text, and whether the bubble sits inside its header, right of the text. */
function bubbles(): Promise<Record<string, { text: string; inside: boolean; clear: boolean }>> {
  return browser.execute(() => {
    const result: Record<string, { text: string; inside: boolean; clear: boolean }> = {};
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>('[data-mm-id="node.card-count"]'),
    )) {
      const node = el.closest<HTMLElement>('.mind-mapper-node');
      const content = node?.querySelector('.mind-mapper-node-content');
      if (!node || !content) continue;
      const b = el.getBoundingClientRect();
      const n = node.getBoundingClientRect();
      // The text itself (its widest line), not the content box.
      const range = document.createRange();
      range.selectNodeContents(content);
      const text = range.getBoundingClientRect();
      result[node.dataset.nodeId ?? ''] = {
        text: el.textContent ?? '',
        inside: b.left >= n.left && b.right <= n.right && b.top >= n.top && b.bottom <= n.bottom,
        clear: text.right <= b.left,
      };
    }
    return result;
  });
}

function count(selector: string): Promise<number> {
  return browser.execute((s) => document.querySelectorAll(s).length, selector);
}

function background(id: string): Promise<string> {
  return browser.execute(
    (nodeId) =>
      getComputedStyle(document.querySelector(`.mind-mapper-node[data-node-id="${nodeId}"]`)!)
        .backgroundColor,
    id,
  );
}

describe('kanban layout', function () {
  before(async function () {
    await updateSettings({ defaultLayout: 'circle-clockwise', defaultTheme: 'rainbow' });
  });

  it('headline above equal columns, cards and indented subtasks; counts; no lines, no toggles, no overlaps', async function () {
    await openMindMap(NOTE);
    await settle();
    const boxes = await nodeBoxes();
    const box = (id: string) => {
      const found = boxes.find((b) => b.id === id);
      if (!found) throw new Error(`no node ${id}`);
      return found;
    };
    const root = box(P);
    const columns = COLUMNS.map(box);
    for (const column of columns) {
      expect(column.y).toBeGreaterThan(root.y + root.height);
      expect(column.y).toBe(columns[0]?.y);
      expect(column.width).toBe(columns[0]?.width);
    }
    const [first, , last] = columns;
    if (!first || !last) throw new Error('columns missing');
    expect(Math.abs(root.x + root.width / 2 - (first.x + last.x + last.width) / 2)).toBeLessThan(1);
    const card = box(`${P}/To do/#1`);
    const subtask = box(`${P}/To do/#1/#1`);
    expect(card.x).toBe(first.x);
    expect(subtask.x).toBeGreaterThan(card.x);
    expect(subtask.y).toBeGreaterThan(card.y + card.height);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const [x, y] = [boxes[a], boxes[b]];
        if (x && y && overlaps(x, y)) throw new Error(`${x.id} overlaps ${y.id}`);
      }
    }
    expect(await bubbles()).toEqual({
      [`${P}/To do`]: { text: '3', inside: true, clear: true },
      [`${P}/Doing`]: { text: '3', inside: true, clear: true },
      [`${P}/Done`]: { text: '2', inside: true, clear: true },
    });
    expect(await count('.mind-mapper-edge')).toBe(0);
    expect(await count(byId('node.toggle'))).toBe(0);
    // The link line stays.
    expect(await count(byId('link.line'))).toBe(1);
  });

  it('level emphasis: headers filled, cards tinted, subtasks and headline on the canvas', async function () {
    await openMindMap(NOTE);
    await settle();
    const canvas = await browser.execute(
      () => getComputedStyle(document.querySelector('.mind-mapper-view')!).backgroundColor,
    );
    const header = await background(COLUMNS[0] ?? '');
    const card = await background(`${P}/To do/#1`);
    expect(header).not.toBe(card);
    expect(header).not.toBe(await background(`${P}/To do/#1/#1`));
    expect(await background(`${P}/To do/#1/#1`)).toBe(await background(P));
    expect([canvas, 'rgba(0, 0, 0, 0)']).toContain(await background(P));
  });

  it('dividers: vertical between columns, horizontal between cards and between subtasks', async function () {
    await openMindMap(NOTE);
    await settle();
    const lines = await browser.execute(() => {
      const rect = (id: string) =>
        document.querySelector(`.mind-mapper-node[data-node-id="${id}"]`)!.getBoundingClientRect();
      const todo = rect('Product launch/To do');
      const doing = rect('Product launch/Doing');
      const page = rect('Product launch/Doing/Website redesign/#2');
      const interviews = rect('Product launch/Doing/Customer interviews');
      return Array.from(document.querySelectorAll('path.mind-mapper-divider')).map((p) => {
        const r = p.getBoundingClientRect();
        if (r.width < 2)
          return r.left > todo.right && r.right < doing.left ? 'columns' : 'vertical?';
        if (r.bottom < page.top && r.top > page.top - 30) return 'subtasks';
        if (r.bottom < interviews.top && r.top > interviews.top - 30) return 'cards';
        return 'other';
      });
    });
    expect(lines.sort()).toEqual(['cards', 'columns', 'subtasks']);
  });

  it('Collapse all leaves the headline and the column headers with their counts', async function () {
    await openMindMap(NOTE);
    await settle();
    await browser.$(byId('controls.collapse-all')).click();
    await settle();
    // DOM order follows element reuse, not the layout.
    expect((await nodeBoxes()).map((b) => b.id).sort()).toEqual([P, ...COLUMNS].sort());
    expect(await bubbles()).toMatchObject({
      [`${P}/To do`]: { text: '3' },
      [`${P}/Doing`]: { text: '3' },
      [`${P}/Done`]: { text: '2' },
    });
    expect(await count(byId('node.toggle'))).toBe(0);
    await browser.$(byId('controls.collapse-all')).click();
    await settle();
    expect(await nodeBoxes()).toHaveLength(16);
  });

  it('drilled into a column, it is the headline and its children are the columns', async function () {
    await openMindMap(NOTE);
    await settle();
    await mouseOnNode(`${P}/Doing`, 'click');
    await browser.$(byId('controls.drill')).click();
    await settle();
    const boxes = await nodeBoxes();
    const centre = boxes.find((b) => b.id === `${P}/Doing`);
    const ids = ['Website redesign', 'Beta feedback', 'Customer interviews'].map(
      (name) => `${P}/Doing/${name}`,
    );
    const columns = ids.map((id) => boxes.find((b) => b.id === id));
    expect(await browser.$('.mind-mapper-node.is-drill-centre').getAttribute('data-node-id')).toBe(
      `${P}/Doing`,
    );
    for (const column of columns) {
      expect(column?.y).toBe(columns[0]?.y);
      expect(column?.y ?? 0).toBeGreaterThan((centre?.y ?? 0) + (centre?.height ?? 0));
    }
    expect(Object.keys(await bubbles()).sort()).toEqual([...ids].sort());
    await browser.executeObsidianCommand('mind-mapper:show-whole-map');
    await settle();
  });

  it('chosen from the layout menu, also in full screen', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    expect(await count(byId('node.card-count'))).toBe(0);
    await browser.$(byId('controls.layout')).click();
    await browser.$('.menu').waitForExist({ timeout: 5000 });
    for (const item of await browser.$$('.menu .menu-item')) {
      if ((await item.$('.menu-item-title').getText()) !== 'Kanban') continue;
      await item.click();
      break;
    }
    await settle();
    expect(await count(byId('node.card-count'))).toBe(3);
    expect(await count('.mind-mapper-edge')).toBe(0);
    await browser.$(byId('controls.full-screen')).click();
    await browser.$(byId('fullscreen.overlay')).waitForExist({ timeout: 5000 });
    await settle();
    expect(await count(`${byId('fullscreen.overlay')} ${byId('node.card-count')}`)).toBe(3);
    await browser.keys('Escape');
    await browser.$(byId('fullscreen.overlay')).waitForExist({ reverse: true, timeout: 5000 });
    // Back to the note's layout for the following specs.
    await browser.$(byId('controls.layout')).click();
    await browser.$('.menu').waitForExist({ timeout: 5000 });
    for (const item of await browser.$$('.menu .menu-item')) {
      if ((await item.$('.menu-item-title').getText()) !== "Use the note's layout") continue;
      await item.click();
      break;
    }
    await settle();
  });
});
