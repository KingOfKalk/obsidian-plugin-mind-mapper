# M3 Live Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The map follows the note while writing: live update, collapse/expand, selection, double-click jump to source, rename, delete and empty states.

**Architecture:**
- Pure parts:
  - `CollapseState` and `visibleTree` (collapsed subtrees are cut before layout);
  - a leaf recency tracker with a leaf picker;
  - a jump helper.
- `DomMapRenderer` gains:
  - collapse toggles as world-level siblings of node elements (nodes have `overflow: hidden`);
  - selection;
  - click and double-click hooks;
  - reuse of rendered content across ID shifts.
- `MindMapView` changes:
  - it owns one permanent `changed` listener, debounced at 300 ms with a generation token, anchored on the selection, else on the centre;
  - it handles the vault `rename`, `delete` and `create` events.

**Tech Stack:** TypeScript, Obsidian API, Vitest + jsdom with the hand-written `obsidian` mock, WebdriverIO + wdio-obsidian-service (headless, Xvfb).

**Spec:**
- [docs/mvp.md](../../mvp.md): "View lifecycle and error states", "Interaction model", "Jump to source target", "Collapse / expand", "Node identity", M3.
- Roadmap: [2026-11-08-roadmap-m3-m7.md](2026-11-08-roadmap-m3-m7.md), section M3 (decisions taken ahead are binding here).

## Global Constraints

- Live update source: `metadataCache.on('changed', (file, data, cache))` for the pinned file only. `data` is the text; no `vault.cachedRead` on updates.
- Debounced about 300 ms (`LIVE_UPDATE_DEBOUNCE_MS = 300`). A newer change cancels in-flight parse, render and measure (generation token).
- Pan, zoom, selection and collapse state are kept; fit to view only on open.
- Collapse state lives in memory per ID for the session; it is not persisted.
- Single click on a node selects it; double click jumps to the source line. Links inside nodes keep Obsidian behaviour and are not node clicks.
- Jump target:
  - Note already open: reveal the most recently active leaf and set the cursor.
  - Not open: a split next to the map.
  - Never the map leaf.
- Commands use `checkCallback`, act on the active map, and have no default hotkeys: `collapse-all` "Collapse all", `expand-all` "Expand all".
- Popout safe: `el.doc` / `el.win`, `instanceOf`; timers via `contentEl.win`.
- All listeners via `registerEvent` / `registerDomEvent`.
- UI copy is exact:
  - "Note was deleted"
  - "This note has no content yet"
  - "Could not read note"
  - "Collapse" / "Expand" (toggle `aria-label`)

## Review Focus

1. Typing fast (updates arriving every 100 ms for 2 s): exactly one re-layout after the last change, and no stale render writes into a newer node. Test in Task 3.
2. A collapsed heading whose ID changes (heading renamed) silently loses its collapse state; collapse state on unchanged siblings stays. Test in Task 4.
3. Double click on a link or the expand button inside a node must not jump. Test in Task 2.
4. Drag-panning that starts on empty canvas must not clear the selection, only a click without movement may. Test in Task 4.
5. The pinned note is renamed while the map tab is hidden, then shown: the title and state are updated, with no re-fit. Test in Task 6.

---

### Task 1: Collapse state and visible tree

**Files:**
- Create: `src/view/collapseState.ts`, `src/layout/visibleTree.ts`
- Test: `tests/view/collapseState.test.ts`, `tests/layout/visibleTree.test.ts`

**Interfaces:**
- Produces:
  - `class CollapseState { has(id: string): boolean; toggle(id: string): void; collapseAll(tree: MindMapTree): void; expandAll(): void; prune(tree: MindMapTree): void; readonly size: number }`
  - `visibleTree(tree: MindMapTree, collapsed: CollapseState): { tree: MindMapTree; hidden: ReadonlyMap<string, number> }`. Here `hidden` maps a collapsed node's ID to the count of all its descendants. Node objects are copied only where `children` changes; others keep identity.

- [ ] **Step 1: Write the failing tests**
  - `collapseAll collapses every node with children except the root`: worked example → `has('Project/Tasks')`, `has('Project/Notes')` true; `has('Project')` false; leaves false.
  - `toggle flips one id; expandAll clears`.
  - `prune drops ids that are no longer in the tree or have no children`.
  - `visibleTree cuts children of collapsed nodes and counts all hidden descendants`: on the `lists` fixture, collapse a list item with a nested item → its children are `[]` and `hidden.get(id)` is the descendant count (nested grandchildren included).
  - `visibleTree with nothing collapsed returns the same root object`.
- [ ] **Step 2: Run** `npx vitest run tests/view/collapseState.test.ts tests/layout/visibleTree.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement both modules.** `CollapseState` wraps a `Set<string>`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: collapse state and visible tree`.

### Task 2: Renderer: toggles, selection, node clicks, content reuse

**Files:**
- Modify: `src/render/DomMapRenderer.ts`, `styles.css`
- Test: `tests/render/DomMapRenderer.test.ts`

**Interfaces:**
- Consumes: the `hidden` map from Task 1.
- Produces:
  - `NodeContentHooks` gains three hooks, all optional, with no-op defaults in `PLAIN_TEXT`:
    - `select(id: string): void`
    - `open(node: MindMapNode): void` (double click)
    - `toggle(id: string): void`
  - `setLayout(layout: MapLayout, collapse?: { hidden: ReadonlyMap<string, number>; hasChildren: (id: string) => boolean })`.
    - A node with children, or one present in `hidden`, gets a toggle element `.mind-mapper-collapse` (a `button`, a child of the world, not of the node).
    - Position: centred on the node's right edge (`left = x + width`, `top = y + height / 2`, CSS translate −50% / −50%).
    - Text: `−` when expanded; the count from `hidden` when collapsed, plus class `is-collapsed`.
    - `aria-label`: "Collapse" or "Expand".
  - `setSelected(id: string | null): void`: toggles `is-selected` on the node element.

Node clicks are delegated on the world element:
- A `click` on `.mind-mapper-node` calls `select(id)`.
- A `dblclick` on a node calls `open(node)`.
- Both are ignored when the event target is inside `a`, `button`, `input` or `.mind-mapper-node-expand`.
- A toggle click calls `toggle(id)` with `stopPropagation`.

Content reuse:
- In `setLayout`, a node element whose ID went away is not released straight away. It goes into a pool keyed by `markdown`.
- A newly created node with the same `markdown` takes the pooled content element, moved into its new element without re-rendering.
- Leftovers are released at the end of `setLayout`.
- Ruling to ledger: keyed by markdown only, because max width is constant per renderer until M4; M4 adds width to the key.

- [ ] **Step 1: Write the failing tests:**
  - `toggle sits outside the node at its right edge and shows the hidden count when collapsed`;
  - `clicking a toggle calls toggle(id) and not select`;
  - `click on a node calls select; dblclick calls open with the current node`;
  - `dblclick on a link or the expand button inside a node does not call open` (Review Focus 3);
  - `setSelected moves is-selected`;
  - `a node whose id shifts keeps its rendered content element (render hook called once)`: one layout where ID `A/#2` has markdown `x`, then a layout where `A/#3` has `x` and `A/#2` has new markdown `y`. Render is called for `y` only, and `A/#3`'s content element is the old one.
- [ ] **Step 2: Run** `npx vitest run tests/render/DomMapRenderer.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** CSS:
  - `.mind-mapper-collapse`: a small circle, about 16 px, with `var(--background-primary)`, a border in `var(--background-modifier-border)`, `font-size: var(--font-ui-smaller)` and `pointer-events: auto`.
  - `.mind-mapper-node.is-selected`: `box-shadow: 0 0 0 2px var(--interactive-accent)`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: collapse toggles, selection and node click hooks in the renderer`.

### Task 3: Live update

**Files:**
- Modify: `src/view/MindMapView.ts`, `src/layout/sizeCache.ts`, `tests/helpers.ts`
- Test: `tests/view/MindMapView.test.ts`, `tests/layout/sizeCache.test.ts` (create if missing)

**Interfaces:**
- Produces:
  - `SizeCache.retain(nodes: Iterable<MindMapNode>): void` keeps only the entries keyed by those nodes.
  - `LIVE_UPDATE_DEBOUNCE_MS = 300`, exported from `MindMapView.ts`.

Behaviour:
- **One permanent listener:**
  - `onOpen` registers one `metadataCache.on('changed')` via `registerEvent`; it replaces `waitForCache` / `stopWaitingForCache`.
  - A change for the pinned path:
    - while no tree is shown (loading): loads at once, from the event `data` and `cache`;
    - otherwise: debounces for 300 ms (timer on `contentEl.win`), then applies.
- **Apply:**
  - Increments `generation`, cancels a pending re-layout, builds the tree from `toParserInput(cache, data)` and runs `sizes.retain(allNodes(tree))`.
  - The anchor is the selected node if it is in the previous layout, else `nearestNode` at the view centre. The new layout is shown, then `applyTransform(anchoredTransform(...))` when the anchor ID still exists.
  - Sets `fitted = false`. Never fits, unless `pendingFit` is still set from opening.
- **Errors:** `cachedRead` rejection on open shows "Could not read note".

- [ ] **Step 1: Write the failing tests** (fake timers; `ws.metadataCache.trigger` with recorded fixtures):
  - `a change of the pinned note re-renders after 300 ms, not before`;
  - `rapid changes every 100 ms for 2 s give one update with the last text` (Review Focus 1). The rendered node IDs match the last text, and `MarkdownRenderer.render` was not called for intermediate texts after the last update.
  - `changes of other files are ignored`;
  - `live update keeps the transform anchored on the node nearest the centre and does not re-fit`. Pan, then add a sibling above; the anchor node's screen position is unchanged to within 0.5 px.
  - `a loading view renders on the first changed event without debounce`;
  - `the size cache keeps only nodes of the current tree` (sizeCache unit test);
  - `cachedRead rejection shows "Could not read note"`.
- [ ] **Step 2: Run** `npx vitest run tests/view/MindMapView.test.ts tests/layout/sizeCache.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Existing waiting-for-cache tests must keep passing; update them if they assert listener counts.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: live update from the changed event`.

### Task 4: Collapse and selection in the view, commands

**Files:**
- Modify: `src/view/MindMapView.ts`, `src/render/panZoomInput.ts`, `src/commands/viewCommands.ts`, `README.md`
- Test: `tests/view/MindMapView.test.ts`, `tests/render/panZoomInput.test.ts`, `tests/commands/viewCommands.test.ts` (wherever the command tests live now)

**Interfaces:**
- Consumes: Task 1 `CollapseState`, `visibleTree`; Task 2 hooks, `setSelected`.
- Produces:
  - `MindMapView.collapseAll(): void`, `expandAll(): void`, `toggleCollapse(id: string): void`;
  - `select(id: string | null): void`, `get selectedId(): string | null`;
  - `attachPanZoom(component, canvasEl, target, onTap?: () => void)`: `onTap` fires on a pointerup on empty canvas when the pointer moved less than 4 px in total.

Behaviour:
- **Layout input:** `computeLayout` lays out `visibleTree(tree, collapse).tree` and passes `hidden` plus `hasChildren` (from the full tree) to the renderer.
- **Anchoring on toggle:** toggling, collapse all and expand all re-lay out, anchored on the toggled node (for the commands: the selection, else the centre). They don't fit.
- **Live update:**
  - `collapse.prune(tree)` runs on every update;
  - the selection is cleared if its ID disappears;
  - the selection is anchored (completes Task 3's anchor rule).
- **Clearing the selection:** a click on empty canvas (`onTap`) clears it.
- **README:** "Commands" gains Collapse all and Expand all.

- [ ] **Step 1: Write the failing tests:**
  - `toggling a node hides its subtree and keeps the toggled node in place on screen`;
  - `collapseAll shows root and first level; expandAll shows all`;
  - `collapse state survives a live update; a renamed collapsed heading loses it, its unchanged sibling keeps it` (Review Focus 2);
  - `selection survives a live update and is cleared when its node disappears`;
  - `onTap fires for a click without movement and not after a drag of 10 px` (Review Focus 4);
  - `collapse-all and expand-all commands are hidden without an active map`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: collapse, expand and selection with commands`.

### Task 5: Leaf recency, jump to source, link target

**Files:**
- Create: `src/view/leafRecency.ts`, `src/commands/jumpToSource.ts`
- Modify: `src/main.ts`, `src/view/MindMapView.ts` (constructor takes the tracker), `src/render/linkHandling.ts` (uses the picker), `src/render/NodeContentModal.ts` (passes it through)
- Test: `tests/view/leafRecency.test.ts`, `tests/commands/jumpToSource.test.ts`, `tests/render/linkHandling.test.ts`, `tests/main.test.ts`

**Interfaces:**
- Produces:
  - `class LeafRecency { touch(leaf: WorkspaceLeaf | null): void; mostRecent(leaves: WorkspaceLeaf[]): WorkspaceLeaf | null }`.
    - `touch` stores a monotonically increasing counter in a `WeakMap`, not time, so tests are deterministic.
    - `mostRecent` picks the leaf with the highest counter. Never-touched leaves count as 0, and the first in order wins ties.
  - `pickNoteLeaf(workspace: Workspace, recency: LeafRecency, opts: { mapLeaf: WorkspaceLeaf | null; path?: string }): WorkspaceLeaf | null`.
    - Candidates: markdown leaves other than `mapLeaf`, filtered by `(leaf.view as MarkdownView).file?.path === path` when a path is given.
  - `jumpToSource(app: App, recency: LeafRecency, mapLeaf: WorkspaceLeaf | null, path: string, line: number): Promise<void>`:
    - target = `pickNoteLeaf` with the path, else `app.workspace.createLeafBySplit(mapLeaf, 'vertical')` (or `getLeaf('split', 'vertical')` when `mapLeaf` is null);
    - `await target.openFile(file, { active: true, eState: { line } })`;
    - then, if the view is a `MarkdownView` in source mode: `editor.setCursor({ line, ch: 0 })` and `editor.scrollIntoView(..., true)`.
  - `MindMapPlugin` owns one `LeafRecency`, fed by `workspace.on('active-leaf-change')` via `registerEvent`, and passes it to `new MindMapView(leaf, recency)`.
  - `LinkContext` gains `recency: LeafRecency`; `noteLeaf` becomes `pickNoteLeaf(workspace, recency, { mapLeaf })`.
    - This fixes the M2 minor "picks the first leaf".
    - Ruling to ledger: a plain link click now goes to the most recent note leaf of any file, as before, but tracked by our own recency.
- The view's `open` hook calls `jumpToSource(this.app, recency, this.leaf, pinned, node.line)`; a failure logs and shows a `Notice` "Could not open the note".

- [ ] **Step 1: Write the failing tests:**
  - `mostRecent prefers the last touched leaf`;
  - `pickNoteLeaf skips the map leaf and leaves of other files`;
  - `jumpToSource reveals the most recent leaf of the note and sets the cursor line`;
  - `jumpToSource opens a vertical split next to the map when the note is not open`;
  - `jumpToSource never uses the map leaf`;
  - `link click opens in the most recently active note leaf`;
  - `plugin feeds active-leaf-change into the recency tracker`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL. Extend `tests/mocks/obsidian.ts` with `MarkdownView` and the `FakeWorkspace` helpers (`createLeafBySplit`, `trigger(name, ...args)`) as needed.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: double click jumps to the source line`.

### Task 6: Rename, delete, create, empty note, render timer

**Files:**
- Modify: `src/view/MindMapView.ts`, `src/render/NodeContentRenderer.ts`, `styles.css`, `tests/helpers.ts` (`FakeVault.on` / `trigger`)
- Test: `tests/view/MindMapView.test.ts`, `tests/render/NodeContentRenderer.test.ts`

**Behaviour:**
- **Rename:**
  - The view registers vault `rename`. When `oldPath === pinnedFile`, it sets `pinnedFile = file.path` first, then `await this.leaf.setViewState({ type: VIEW_TYPE_MIND_MAP, state: { file: file.path } })`.
  - This updates the tab title and the saved layout. Because the path is already equal, `setState` doesn't set `pendingFit`.
  - Ruling to ledger: the public API has no `updateHeader`.
- **Delete:** vault `delete` of the pinned path → `showMessage('Note was deleted')`, and the view remembers `deleted = true`.
- **Create:** vault `create` at the pinned path while `deleted` → `loadNote()`.
- **Empty note:** a tree whose root has no children shows the root plus a `.mind-mapper-hint` element in the canvas, "This note has no content yet" (top centre, muted, `pointer-events: none`). The hint is removed as soon as there are children.
- **Render timer:** `NodeContentRenderer.release` clears a pending render timeout (keep the timer per content element).

- [ ] **Step 1: Write the failing tests:**
  - `renaming the pinned note updates file and title without re-fit` (pan first; transform unchanged);
  - `rename while hidden (0 x 0 canvas), then shown: title updated, transform unchanged` (Review Focus 5);
  - `deleting the pinned note shows "Note was deleted"; recreating it renders again`;
  - `an empty note shows the root and the hint; adding content removes the hint`;
  - `release clears the pending render timeout` (fake timers: after release, advancing 5 s logs no error and adds no `is-render-error`).
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: follow rename, handle delete and empty notes`.

### Task 7: E2E and screenshots

**Files:**
- Modify: `wdio.conf.mts` (pin `browserVersion: '1.15.0'`, `installerVersion` to the installer currently in `.obsidian-cache`), `e2e/helpers.ts`, `e2e/screenshots.e2e.ts`
- Create: `e2e/specs/live.e2e.ts`

**Tests (`live.e2e.ts`); each creates its own temp note via `app.vault.create`:**
- `typing in the editor updates the map within 1 s and keeps transform and selection`:
  - Select a node, pan, then `editor.replaceRange` a new paragraph at the end.
  - Wait for the new node.
  - Assert the transform string and the selected ID are unchanged.
  - Spike: log the ms from `replaceRange` to the first `changed` event and to the new node in the DOM, with `console.log('[spike] changed after', ms)`; record both in the ledger.
- `collapse toggle hides the subtree; expand all shows it`.
- `double click jumps to the line in the open note`: the note is open in a leaf, the map next to it; double click `Project/Tasks` → `editor.getCursor().line === 4` (worked example copy) and the active leaf is the note.
- `double click opens a split when the note is not open`: the leaf count goes +1 and the map leaf still shows the map.
- `rename keeps the map and updates the title`: `fileManager.renameFile` → the map's view state file is the new path, and the tab title is the new basename.
- `delete shows "Note was deleted"`.

**Screenshots:** add `collapsed` (worked example with `Project/Tasks` collapsed and `Project/Notes` selected).

- [ ] **Step 1: Pin the version.** `npm run test:e2e` → the existing 13 tests PASS on 1.15.0.
- [ ] **Step 2: Write `live.e2e.ts`; run** `npm run test:e2e`. Expected: PASS (all features exist). A failure is a real bug: debug it, fix it with a unit test RED→GREEN first, and ledger it.
- [ ] **Step 3: Run** `npm run screenshots:e2e` and look at all PNGs. The toggle must sit on the node edge, not overlap the edge line badly, and the selection ring must be visible. A visual bug gets a geometric E2E assertion.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** `test: e2e for live update, collapse, jump to source, rename and delete`.
