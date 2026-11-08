# M5 Navigation and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A feature-complete MVP for daily use:
- cross-connection lines for same-note heading and block links;
- back to root;
- full screen (workspace overlay);
- file menu entry and ribbon icon;
- popout window support.

**Architecture:**
- **Cross-links:** `{fromLine, toLine}` pairs, resolved in the view with Obsidian's own `parseLinktext`, `getFirstLinkpathDest` and `resolveSubpath`. A pure module maps lines to nodes (via a new optional `endLine` on nodes) and applies the collapsed-ancestor rule against the visible layout. The renderer draws them from layout rects, never from the DOM, so M6 culling keeps them.
- **Full screen:** moves the view's `contentEl` into a fixed overlay on the window's `body`, below popovers, modals, notices and menus, and back on exit. `Esc` goes through the view's `Scope`.

**Tech Stack:** TypeScript, Obsidian API (`resolveSubpath`, `parseLinktext`, `Scope`, `Menu`, `addRibbonIcon`, `openPopoutLeaf`), Vitest + jsdom mock, WebdriverIO + wdio-obsidian-service (Obsidian 1.15.0).

**Spec:**
- [docs/mvp.md](../../mvp.md): "Links", "Full screen (decided)", "Map controls", "Commands and hotkeys", "Interaction model", "Popout windows", M5.
- Roadmap: [2026-11-08-roadmap-m3-m7.md](2026-11-08-roadmap-m3-m7.md), section M5.

## Global Constraints

- **Cross-links:**
  - Drawn for `[[#Heading]]`, `[[Note#Heading]]` when Note resolves to the pinned note (`getFirstLinkpathDest`), nested `[[#A#B]]`, and block links `[[#^id]]`.
  - Target or source collapsed: draw the line to the nearest visible ancestor.
  - Kept when an endpoint is off screen (computed from the layout).
- **Full screen:**
  - A workspace overlay, not the browser Fullscreen API: notices, menus, modals and hover previews stay visible.
  - Visible: the map, the floating controls (bottom centre, as in the normal view), an exit button top right and a title chip.
  - Controls fade after about 2 s idle and reappear on mouse move.
  - Exit with Esc (handled by the plugin after open overlays and modals consumed it) or the exit button.
  - Entering fits to view; exiting restores the previous pan and zoom.
  - Jump to source from full screen exits full screen first.
- **Commands** (`checkCallback`, active map only, no default hotkeys): `back-to-root` "Back to root", `toggle-full-screen` "Toggle full screen". Every control is also a command.
- **Open:** a file menu entry and a ribbon icon, "Open as mind map", for markdown files only.
- **Popout windows:** the view uses its own `document` and `window`.
- **UI copy, exact:**
  - "Back to root"
  - "Toggle full screen"
  - "Exit full screen"
  - "Open as mind map"
  - "Open a markdown note first"

## Review Focus

1. A link inside a collapsed subtree pointing into another collapsed subtree: one line between the two visible ancestors; none when both map to the same node. Test in Task 1.
2. Esc in full screen while the expand overlay (modal) is open: only the modal closes; a second Esc exits full screen. Test in Task 4 (unit, scope order) and Task 6 (E2E).
3. Closing the map tab (or the plugin unloading) while in full screen: the overlay is removed from the body, nothing is left over. Test in Task 4.
4. A link click inside a full-screen map opens a note: full screen exits first, so the opened note is not hidden behind the overlay. Test in Task 4.
5. A map in a popout window: renders, measures (non-zero sizes), pans; full screen covers the popout window, not the main window. Test in Task 6.

---

### Task 1: Node line ranges and cross-link mapping (pure)

**Files:**
- Modify: `src/parser/types.ts` (`MindMapNode.endLine?: number`), `src/parser/buildTree.ts`
- Create: `src/layout/crossLinks.ts`
- Test: `tests/parser/buildTree.test.ts`, `tests/layout/crossLinks.test.ts`

**Interfaces:**
- `endLine` per node kind:
  - heading: `line`;
  - section node: the section's `endLine`;
  - list item: the item's `endLine`;
  - virtual root: absent.
- `interface CrossLinkInput { fromLine: number; toLine: number }`
- `interface CrossLink { fromId: string; toId: string }`
- `nodeAtLine(tree: MindMapTree, line: number): MindMapNode | null`: the node with the smallest `[line, endLine]` span containing `line`. The H1 root counts as `[line, line]`.
- `crossLinks(tree, inputs: CrossLinkInput[]): CrossLink[]`: inputs whose ends both map to nodes, without self links, deduplicated, in input order.
- `visibleCrossLinks(tree, links: CrossLink[], visible: ReadonlySet<string>): CrossLink[]`: each end becomes its nearest visible ancestor (itself if visible). Drop self links after mapping, then dedupe.

- [ ] **Step 1: Write the failing tests:**
  - `endLine is set for headings, sections and list items`: `crosslinks` fixture. Expected:
    - `Links/Alpha` endLine 2;
    - `Links/Alpha/#1` lines 4–4;
    - `Links/Gamma/#2` (list item "Item linking") 16–16;
    - its nested item 17–17.
  - `nodeAtLine picks the innermost node`: line 4 → `Links/Alpha/#1`; line 10 → `Links/Beta/Inner/#1`; line 3 → null (blank).
  - `crossLinks maps lines to node ids, drops self links and duplicates`;
  - `visibleCrossLinks moves hidden ends to the nearest visible ancestor` (Review Focus 1): collapse `Links/Beta` and `Links/Gamma`; a link from `Gamma/#2/#1` to `Beta/Inner` becomes `Links/Gamma → Links/Beta`, and one inside the same collapsed node disappears.
- [ ] **Step 2: Run** `npx vitest run tests/parser/buildTree.test.ts tests/layout/crossLinks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: node line ranges and cross-link mapping`.

### Task 2: Resolving same-note links

**Files:**
- Create: `src/view/linkTargets.ts`
- Modify: `tests/mocks/obsidian.ts` (`parseLinktext`, `resolveSubpath`: heading chains by exact text, blocks by id, as Obsidian does for the fixture)
- Test: `tests/view/linkTargets.test.ts`

**Interfaces:**
- `crossLinkInputs(cache: CachedMetadata, sourcePath: string, resolvePath: (linkpath: string, sourcePath: string) => string | null): CrossLinkInput[]`
  - For each `cache.links` entry: `parseLinktext(link)`.
  - Skip it when there is no subpath, or when the path is not empty and `resolvePath(path, sourcePath) !== sourcePath`.
  - Otherwise `resolveSubpath(cache, '#' + subpath)`: a heading result gives `toLine = current.position.start.line`; a block result gives `toLine = block.position.start.line`. Anything else is skipped.
  - `fromLine = link.position.start.line`.
- Embeds are not cross-links. Ruling to ledger: they are rewritten to plain links before rendering, but the spec only names links.

- [ ] **Step 1: Write the failing test** `crossLinkInputs of the crosslinks fixture`. Resolver: `crosslinks` maps to `fixtures/crosslinks.md`, others to their own paths. Expected:
  - `[{4→6}, {4→10}, {14→8}, {14→2}, {16→12}, {17→2}]`
  - `#Missing` and `[[lists]]` are skipped.
- [ ] **Step 2: Run** `npx vitest run tests/view/linkTargets.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: resolve same-note heading and block links`.

### Task 3: Drawing cross-links; no raw-markdown tooltip

**Files:**
- Modify: `src/layout/edgePath.ts` (`crossLinkPath`), `src/render/DomMapRenderer.ts`, `src/view/MindMapView.ts`, `styles.css`
- Test: `tests/layout/edgePath.test.ts`, `tests/render/DomMapRenderer.test.ts`, `tests/view/MindMapView.test.ts`

**Interfaces:**
- `crossLinkPath(from: Rect, to: Rect): string`:
  - Mostly horizontal (`|dx| ≥ |dy|` of the centres): from the facing vertical edge midpoints.
  - Otherwise: from the facing horizontal edge midpoints.
  - Cubic bezier, control points 40% of the distance along the leaving axis.
- `DomMapRenderer.setCrossLinks(links: CrossLink[]): void`: draws `path.mind-mapper-crosslink` into the edges SVG from the rects of the last layout. Links with a missing end are skipped.
- **CSS:** `stroke: var(--interactive-accent)`, `stroke-dasharray: 6 4`, `fill: none`, `opacity: 0.8`.
- **Tooltip:** the node element no longer gets a `title` (M2 minor: it competes with page preview). The existing tooltip test is changed to assert no `title`.
- **View:**
  - `parse` stores `crossLinkInputs(cache, path, (p, s) => metadataCache.getFirstLinkpathDest(p, s)?.path ?? null)` mapped through `crossLinks(tree, …)`.
  - `showLayout` passes `visibleCrossLinks(tree, links, ids in layout)` to the renderer.

- [ ] **Step 1: Write the failing tests:**
  - `crossLinkPath picks facing edges` (right/left, top/bottom);
  - `setCrossLinks draws one dashed path per link from layout rects; links to unknown nodes are skipped`;
  - `node elements have no title tooltip`;
  - view: `cross-links of the crosslinks fixture are drawn and follow collapse`. All expanded: 6 paths. After `collapseAll`: Gamma → Alpha and Gamma → Beta remain, Alpha → Beta remains; total 3 after dedupe.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: draw cross-connection lines for same-note links`.

### Task 4: Back to root and full screen

**Files:**
- Create: `src/view/fullScreen.ts`
- Modify: `src/view/MindMapView.ts`, `src/render/MapControls.ts`, `src/commands/viewCommands.ts`, `src/render/linkHandling.ts` (`onNavigate` in the map), `tests/mocks/obsidian.ts` (`Scope` with `register` / `unregister`, `ItemView.scope`), `styles.css`, `README.md`
- Test: `tests/view/fullScreen.test.ts`, `tests/view/MindMapView.test.ts`, `tests/render/MapControls.test.ts`, `tests/commands/viewCommands.test.ts`

**Interfaces:**
- `MapActions` gains `backToRoot()` and `toggleFullScreen()`. Controls get buttons "Back to root" (icon `locate`) and "Toggle full screen" (icon `maximize-2`).
- `MindMapView.backToRoot()`: selects the root and centres it at the current zoom.
- `MindMapView.toggleFullScreen()`, `get isFullScreen(): boolean`.
- **`class FullScreen`** (`src/view/fullScreen.ts`):
  - Constructor: `{ contentEl, title: () => string, onExit: () => void }`.
  - `enter()`:
    - Creates `div.mind-mapper-full-screen` on `contentEl.doc.body`, moves `contentEl` into it, adds the exit button (`aria-label` "Exit full screen", icon `x`) and the title chip `.mind-mapper-title-chip`.
    - Starts the idle timer (2000 ms, `contentEl.win`). After it, the overlay gets `is-idle`; any `mousemove` clears it and restarts the timer.
  - `exit()`: moves `contentEl` back to its original parent at its original position, then removes the overlay and the timer.
  - `get active(): boolean`.
- **View:**
  - Entering saves the transform, then fits.
  - Exiting restores the transform.
  - Esc: `this.scope = new Scope(this.app.scope)`, with Escape registered only while in full screen (unregistered on exit).
  - Jump to source, link clicks in the map and links in the overlay exit full screen first (link handling's `onNavigate` for the map).
  - `onClose` exits full screen (Review Focus 3).
- **CSS:**
  - `.mind-mapper-full-screen`: `position: fixed; inset: 0; z-index: calc(var(--layer-popover) - 1); background: var(--background-primary); display: flex`, with the content filling it.
  - `is-idle` fades `.mind-mapper-controls`, the exit button and the title chip (`opacity: 0`, transition 300 ms).

- [ ] **Step 1: Write the failing tests:**
  - `back to root selects the root and centres it, zoom unchanged`;
  - `full screen moves the map into a body overlay and back to the same place`;
  - `entering fits; exiting restores the previous transform`;
  - `Esc is registered only while in full screen and exits` (scope `register` / `unregister` calls; calling the handler exits);
  - `controls fade after 2 s idle and come back on mouse move` (fake timers);
  - `closing the view in full screen removes the overlay` (Review Focus 3);
  - `a link click in full screen exits first` (Review Focus 4);
  - `double click jump exits full screen first`;
  - commands `back-to-root` and `toggle-full-screen` (`viewCommands` table);
  - controls have both new buttons.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** README: add both commands with suggested hotkeys, plus a "Full screen" note.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: back to root and full screen`.

### Task 5: File menu and ribbon icon

**Files:**
- Modify: `src/main.ts`, `tests/mocks/obsidian.ts` (`addRibbonIcon`, a `Menu` stand-in with `addItem`)
- Test: `tests/main.test.ts`

**Behaviour:**
- `file-menu`: for markdown files only, an item "Open as mind map" (icon `VIEW_ICON`) that opens the map, like the command.
- Ribbon icon `VIEW_ICON`, title "Open as mind map": opens the active markdown file, else `Notice` "Open a markdown note first".

- [ ] **Step 1: Write the failing tests:**
  - `file menu offers "Open as mind map" for markdown files only, and it opens the map`;
  - `ribbon icon opens the active markdown note`;
  - `ribbon icon without a markdown note shows a notice`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: file menu entry and ribbon icon`.

### Task 6: E2E, screenshots, README

**Files:**
- Create: `e2e/specs/navigation.e2e.ts`
- Modify: `e2e/screenshots.e2e.ts`, `README.md`

**E2E tests:**
- `cross-links are drawn and follow collapse`: open `fixtures/crosslinks.md` → 6 `.mind-mapper-crosslink` paths; run the collapse-all command → 3.
- `full screen covers the window; Esc closes an open overlay first, then exits; the transform is restored`:
  - The overlay's rect equals `window.innerWidth` × `innerHeight`.
  - Open the expand modal on a clipped node (`long-content`). Esc → the modal is gone, full screen stays. Esc → full screen is gone.
  - The transform equals the one before.
- `back to root centres the root`.
- `file menu and ribbon open the map`: trigger `file-menu` through `app.workspace.trigger('file-menu', menu, file, 'test')` with a real `obsidian.Menu`, then click the item; click the ribbon element `.side-dock-ribbon-action[aria-label="Open as mind map"]`.
- `a map in a popout window renders, measures, pans and goes full screen there` (Review Focus 5):
  - `app.workspace.openPopoutLeaf()`, `setViewState` map.
  - Query through the leaf's `view.contentEl`, which is the popout document.
  - Assert: there are nodes; the first content element's `offsetWidth > 0`; the transform changes on a wheel event created from `contentEl.win`; full screen puts the overlay into the popout document's body.

**Screenshots:** `crosslinks.png`, `full-screen.png`.

**README:** cross-links, full screen, file menu, ribbon.

- [ ] **Step 1: Write the spec; run** `npm run test:e2e`. Expected: PASS. A failure is a bug: fix it with a unit test RED→GREEN.
- [ ] **Step 2: Run** `npm run screenshots:e2e` and look. Cross-links must be visible but not dominant; full screen must hide all Obsidian chrome. Every visual bug gets a geometric assertion.
- [ ] **Step 3: Run** `npm run check`. Expected: PASS.
- [ ] **Step 4: Commit** `test: e2e and screenshots for cross-links, full screen, open entry points and popouts`.
