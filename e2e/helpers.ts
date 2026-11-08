import { browser } from '@wdio/globals';

/** Waits until Obsidian has a metadata cache entry for `path` (the vault is indexed in the background). */
export async function waitForCache(path: string): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.executeObsidian(({ app }, notePath) => {
        const file = app.vault.getFileByPath(notePath);
        return file !== null && app.metadataCache.getFileCache(file) !== null;
      }, path),
    { timeout: 30000, timeoutMsg: `no metadata cache for ${path}` },
  );
}

/**
 * Closes open maps and opens a map pinned to `path` (by view state, independent of the active
 * file), then waits for its root node. Exactly one map is open afterwards. The command path is
 * covered by `openViaCommand` in the smoke spec.
 */
export async function openMindMap(path: string): Promise<void> {
  await waitForCache(path);
  await browser.executeObsidian(async ({ app }, notePath) => {
    app.workspace.detachLeavesOfType('mind-mapper-view');
    const leaf = app.workspace.getLeaf('split', 'vertical');
    await leaf.setViewState({ type: 'mind-mapper-view', active: true, state: { file: notePath } });
    await app.workspace.revealLeaf(leaf);
  }, path);
  // a large map at fit is drawn as a skeleton (no node DOM)
  await browser.$('.mind-mapper-node.is-root, path.mind-mapper-skeleton').waitForExist({
    timeout: 15000,
    timeoutMsg: `no mind map for ${path}`,
  });
}

/** Opens `path` in a note leaf and runs the "Open as mind map" command. */
export async function openViaCommand(path: string): Promise<void> {
  await waitForCache(path);
  await browser.executeObsidian(async ({ app }, notePath) => {
    const file = app.vault.getFileByPath(notePath);
    if (!file) throw new Error(`missing ${notePath}`);
    await app.workspace.getLeaf().openFile(file);
  }, path);
  await browser.executeObsidianCommand('mind-mapper:open-as-mind-map');
  await browser.$('.mind-mapper-node.is-root').waitForExist({ timeout: 15000 });
}

export interface NodeBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Node boxes in world coordinates (from the layout styles, independent of zoom). */
export async function nodeBoxes(): Promise<NodeBox[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node')).map((el) => ({
      id: el.dataset.nodeId ?? '',
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height),
    })),
  );
}

/** Waits until the layout no longer changes (rendering, measuring and re-layout have settled). */
export async function settle(quietMs = 500, timeout = 30000): Promise<void> {
  let previous = '';
  let stableSince = Date.now();
  await browser.waitUntil(
    async () => {
      const current = JSON.stringify(await nodeBoxes());
      if (current !== previous) {
        previous = current;
        stableSince = Date.now();
        return false;
      }
      return Date.now() - stableSince >= quietMs;
    },
    { timeout, interval: 100, timeoutMsg: 'layout did not settle' },
  );
}

export function overlaps(a: NodeBox, b: NodeBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Writes a note into the (sandboxed) test vault and waits until Obsidian has indexed it. */
export async function writeNote(path: string, text: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, notePath, content) => {
      await app.vault.adapter.write(notePath, content);
    },
    path,
    text,
  );
  await waitForCache(path);
}

/** Opens `path` in a note leaf (reusing the active one when it is a note). */
export async function openNote(path: string): Promise<void> {
  await waitForCache(path);
  await browser.executeObsidian(async ({ app }, notePath) => {
    const file = app.vault.getFileByPath(notePath);
    if (!file) throw new Error(`missing ${notePath}`);
    await app.workspace.getLeaf(false).openFile(file);
  }, path);
}

/** Root leaves: view type and pinned / opened file. */
export function leafSummary(): Promise<{ type: string; file: string | null }[]> {
  return browser.executeObsidian(({ app }) => {
    const leaves: { type: string; file: string | null }[] = [];
    app.workspace.iterateRootLeaves((leaf) => {
      const state = leaf.getViewState();
      leaves.push({
        type: state.type,
        file: (state.state as { file?: string } | undefined)?.file ?? null,
      });
    });
    return leaves;
  });
}

/** Dispatches a mouse event on the content of the node with this ID. */
export async function mouseOnNode(id: string, type: 'click' | 'dblclick'): Promise<void> {
  await browser.execute(
    (nodeId, eventType) => {
      const el = document.querySelector(
        `.mind-mapper-node[data-node-id="${nodeId}"] .mind-mapper-node-content`,
      );
      if (!el) throw new Error(`no node ${nodeId}`);
      el.dispatchEvent(new MouseEvent(eventType, { bubbles: true, cancelable: true, button: 0 }));
    },
    id,
    type,
  );
}
