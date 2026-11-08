# M1 Outline Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The mind map view shows the heading structure of its pinned note as a left-to-right tree of plain-text nodes with bezier edges, with Canvas-like pan and zoom, fit to view on open, and floating controls plus commands for zoom in, zoom out, fit to view and reset to 100%.

**Architecture:** Three pure layers plus a thin view. Parser: an adapter turns Obsidian's `CachedMetadata` plus note text into a plain `ParserInput`, and a pure `buildTree` turns that into a `MindMapTree` with stable heading IDs. Layout: pure `layoutTree` (bounding-box tidy tree, fixed node size) returns positioned nodes, edges and bounds. Renderer: a pure `Viewport` transform module, a DOM renderer (absolutely positioned node divs plus one SVG edge layer inside a CSS-transformed world element) and a pan/zoom input binder. `MindMapView` wires them and exposes zoom actions used by both the controls and the commands. Parser tests run on cache snapshots recorded in real Obsidian by a dev-only command.

**Tech Stack:** as M0 (TypeScript 6.0, esbuild, Vitest + jsdom, ESLint obsidianmd, Prettier). No new runtime dependencies.

**Spec:** [docs/mvp.md](../../mvp.md): "Mapping rules > Root node", "Headings", "Worked example", "Node identity", "Layout", "MVP features > Zoom and pan / Commands and hotkeys / Map controls", "View lifecycle" (render ownership, popout), "Implementation", "Suggested milestones > M1"

## Global Constraints

- Everything from the M0 plan's Global Constraints still holds (ids, versions, `minAppVersion: "1.7.2"`, no default hotkeys, `onunload` never detaches, local gate `npm run check`, Conventional Commits, no AI attribution, squash-merge only after the user's manual check and explicit OK)
- M1 scope only: headings; no paragraphs, lists, `mind_map_title`, `mind_map_layout`, collapse, selection, live update, culling (later milestones)
- Fixed node size `200 x 36` px, sibling gap `12` px, level gap `60` px (constants until M4)
- Zoom limits `0.1` to `4`; button and command zoom step factor `1.2` around the viewport center; fit padding `40` px; fit never zooms above `1`
- Wheel mapping (spec "Zoom and pan"): wheel / two-finger scroll pans; Ctrl or Cmd + wheel and pinch (`ctrlKey` wheel) zoom at the pointer; drag on empty canvas pans
- Popout safety: DOM is created through `containerEl.doc` (or `el.doc`), never global `document` / `window`
- All DOM listeners through `registerDomEvent` / `registerEvent` of the view
- Dev-only code is gated by a compile-time `__DEV__` constant and absent from the production `main.js`
- Theming only via Obsidian CSS variables

## Review Focus

1. Map opened while its tab has zero size (restored in the background, not shown yet): no `NaN` / `Infinity` transform; fit runs on the first resize with a real size (Task 7)
2. Note without headings, empty note, frontmatter only: map shows the root only (file name), fit works on a one-node map (Tasks 2, 7)
3. Pinned file missing (deleted or renamed while Obsidian was closed): placeholder "Note not found: <path>", no exception (Task 7)
4. Repeated zoom in / out / pinch: zoom clamps to `[0.1, 4]`, and the point under the cursor stays fixed while zooming (Task 5)
5. Very long or markdown-heavy heading text: node keeps its fixed size, text is truncated with an ellipsis, the full text is in the node's `title` tooltip (Task 6)

---

### Task 0: Worktree

- [ ] **Step 1:** `git worktree add .worktrees/feat-m1-outline-map -b feat/m1-outline-map main`, then `cd` into it and run `npm ci`
- [ ] **Step 2:** Move this plan (written in the main checkout, untracked) into the worktree at the same path: `mv ../../docs/superpowers/plans/2026-11-08-m1-outline-map.md docs/superpowers/plans/`. It is committed with Task 1.

### Task 1: Fixture recorder (dev-only) and fixture notes

**Files:**
- Create: `src/globals.d.ts`, `src/dev/recordFixtures.ts`, `test-vault/fixtures/*.md` (list below)
- Modify: `esbuild.config.mjs`, `vitest.config.ts`, `src/main.ts`, `tests/mocks/obsidian.ts`, `tests/helpers.ts`
- Test: `tests/dev/recordFixtures.test.ts`

**Interfaces:**
- Produces:
  - `declare const __DEV__: boolean;` in `src/globals.d.ts`; esbuild `define: { __DEV__: JSON.stringify(!production) }`; Vitest `define: { __DEV__: 'true' }`
  - `src/dev/recordFixtures.ts`: `export const FIXTURE_FOLDER = 'fixtures';` `export interface ParserFixture { obsidianVersion: string; text: string; cache: CachedMetadata | null }` and `export async function recordFixtures(app: App): Promise<number>` writing one `fixtures/<basename>.cache.json` per markdown file directly in `fixtures/` (pretty JSON, 2 spaces, final newline) via `app.vault.adapter.write`; returns the count. `obsidianVersion` comes from `apiVersion` (exported by `obsidian`)
  - Dev-only command id `record-parser-fixtures`, name `Record parser fixtures (dev)`, registered in `onload` only `if (__DEV__)`, shows `new Notice(\`Recorded ${n} parser fixtures\`)`
  - Fixture file format (later tasks read it): `test-vault/fixtures/<name>.cache.json` = `ParserFixture`

- [ ] **Step 1: Write failing test** `tests/dev/recordFixtures.test.ts`, `'writes one cache.json per markdown note in fixtures/'`: fake vault with `fixtures/a.md`, `fixtures/b.md`, `fixtures/sub/c.md`, `other/d.md`, `fixtures/e.canvas`; fake `metadataCache.getFileCache` returns `{ headings: [...] }` for `a`, `null` for `b`; fake `cachedRead` returns the text. Assert `recordFixtures` resolves `2`, `adapter.write` called with `fixtures/a.cache.json` and `fixtures/b.cache.json` only, and the written JSON parses to `{ obsidianVersion: <mock apiVersion>, text, cache }` (with `cache: null` for `b`).
- [ ] **Step 2: Run** `npm test` — Expected: FAIL, module not found
- [ ] **Step 3: Implement** the recorder, the `__DEV__` wiring and the dev command (mock gets `apiVersion = '1.7.2-test'`, `Notice`, and fake vault helpers in `tests/helpers.ts`)
- [ ] **Step 4: Fixture notes** in `test-vault/fixtures/` (exact content; these drive the parser tests):
  - `worked-example.md`: the spec's worked example, verbatim
  - `skipped-levels.md`: `# A`, `### B`, `## C`, `#### D`, `## E` (one heading per line, blank line between)
  - `multiple-h1.md`: `# One`, `## One child`, `# Two`
  - `content-before-h1.md`: frontmatter `tags: [x]`, paragraph `Intro before title.`, `# Title`, `## Sub`
  - `ignored-before-h1.md`: frontmatter `tags: [x]`, blank line, `%% a comment %%`, blank line, `# Title`, `## Sub`
  - `no-h1.md`: `### Deep first`, `## A`, `### A1`, `## B`, `##### B deep`
  - `no-headings.md`: one paragraph `Just text.`
  - `empty.md`: empty file
  - `frontmatter-only.md`: frontmatter `title: x` only
  - `duplicates-and-special.md`: `# Root`, `## Notes`, `## Notes`, `## A/B`, `## Notes[2]`, `## **Bold** \`code\` [[Link]]`, `## Closed ##`, `## Ärger 🚀 Ελληνικά`
  - `setext.md`: `Title` / `=====`, `Sub` / `-----`, `## ATX child`
  - `headings-in-code.md`: `# Root`, a fenced code block containing `# not a heading`, `## Real`
- [ ] **Step 5: Run** `npm run check` — Expected: PASS; also `grep -c "Record parser fixtures" main.js` — Expected: `0` (stripped from production)
- [ ] **Step 6: Commit** — `git commit -m "feat: add dev-only parser fixture recorder and fixture notes"`
- [ ] **Step 7: Recording (user action, the one stop in this plan):** start `MIND_MAPPER_PLUGIN_DIR=$PWD/test-vault/.obsidian/plugins/mind-mapper npm run dev` in the background; ask the user to open the worktree's `test-vault` in Obsidian, enable Mind Mapper, run "Record parser fixtures (dev)" and report the notice count (`12`). Then commit the 12 `*.cache.json` files: `git commit -m "test: record parser fixtures from Obsidian"`. Continue with Tasks 2, 4, 5, 6 while waiting; Task 3 needs the recordings.

### Task 2: Tree builder and node IDs

**Files:**
- Create: `src/parser/types.ts`, `src/parser/nodeId.ts`, `src/parser/buildTree.ts`
- Test: `tests/parser/nodeId.test.ts`, `tests/parser/buildTree.test.ts`

**Interfaces:**
- Produces (`src/parser/types.ts`):
  - `export interface HeadingInput { text: string; level: number; line: number }`
  - `export interface ParserInput { headings: HeadingInput[]; firstContentLine: number | null }` — `firstContentLine` is the first line of any section that counts as content (spec: everything except frontmatter, comments, blank lines; headings count)
  - `export type NodeKind = 'root' | 'heading';`
  - `export interface MindMapNode { id: string; kind: NodeKind; label: string; level: number; line: number | null; children: MindMapNode[] }` — virtual root: `id ''`, `level 0`, `line null`
  - `export interface MindMapTree { root: MindMapNode }`
- Produces (`src/parser/nodeId.ts`): `export function escapeSegment(text: string): string` (backslash-escape `\`, `/`, `[`), `export function childId(parentId: string, text: string, occurrence: number): string` (`occurrence` 1-based; suffix `[n]` only for `n > 1`; no `/` prefix when `parentId === ''`)
- Produces (`src/parser/buildTree.ts`): `export function buildTree(input: ParserInput, fileName: string): MindMapTree`
  - H1 root iff exactly one level-1 heading and `firstContentLine === null || firstContentLine >= h1.line`; its `id` is `escapeSegment(h1.text)`
  - Else virtual root labelled `fileName`
  - Nesting: stack by level, a heading attaches to the nearest preceding heading with a lower level, else to the root

- [ ] **Step 1: Write failing tests** (hand-built `ParserInput`, helper `h(text, level, line)`):
  - `nodeId`: `childId('Project', 'Tasks', 1) === 'Project/Tasks'`; `childId('Project', 'Notes', 2) === 'Project/Notes[2]'`; `childId('', 'A', 1) === 'A'`; `escapeSegment('A/B') === 'A\\/B'`; `escapeSegment('Notes[2]') === 'Notes\\[2]'`; `escapeSegment('a\\b') === 'a\\\\b'`; `childId('R', 'Notes[2]', 1) !== childId('R', 'Notes', 2)`
  - `'single H1 without content before it is the root'`: worked example headings (`Project` 1 line 0, `Tasks` 2 line 3, `Notes` 2 line 8), `firstContentLine 0` → root `{ id: 'Project', kind: 'root', label: 'Project', level: 1, line: 0 }`, children ids `['Project/Tasks', 'Project/Notes']`
  - `'content before the H1 gives a virtual root'`: `firstContentLine 2`, H1 at line 4 → root `{ id: '', label: 'note', level: 0, line: null }` (fileName `'note'`), H1 is its child
  - `'multiple H1s give a virtual root with H1s as first level'`
  - `'no H1: highest level present is first level'`: `### Deep first`, `## A`, `### A1`, `## B`, `##### B deep` → root children `['Deep first', 'A', 'B']`, `A` has `A1`, `B` has `B deep`
  - `'skipped levels attach to nearest parent'`: `# A`, `### B`, `## C`, `#### D`, `## E` → `A` children `[B, C, E]`, `C` children `[D]`
  - `'duplicate siblings get occurrence index, cousins do not'`: `# R`, `## X`, `### N`, `## Y`, `### N`, `## X` → ids `R/X`, `R/X/N`, `R/Y`, `R/Y/N`, `R/X[2]`
  - `'no headings gives a root-only tree'`: `{ headings: [], firstContentLine: 0 }` and `{ headings: [], firstContentLine: null }` → root only, label fileName
  - Each node's `line` equals its heading's line
- [ ] **Step 2: Run** `npm test` — Expected: FAIL, modules not found
- [ ] **Step 3: Implement** the three files
- [ ] **Step 4: Run** `npm run check` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: build heading tree with stable node ids"`

### Task 3: Cache adapter and recorded fixtures (needs Task 1 Step 7)

**Files:**
- Create: `src/parser/adapter.ts`, `tests/fixtures.ts`
- Test: `tests/parser/adapter.test.ts`, `tests/parser/fixtures.test.ts`

**Interfaces:**
- Consumes: `ParserInput` (Task 2), fixture format (Task 1)
- Produces:
  - `src/parser/adapter.ts`: `export function toParserInput(cache: CachedMetadata | null, text: string): ParserInput` — headings from `cache.headings` (`text` = `heading`, `level`, `line` = `position.start.line`), `firstContentLine` = start line of the first section that is not frontmatter (`yaml`) and not a comment; `null` cache → `{ headings: [], firstContentLine: null }`
  - `tests/fixtures.ts`: `export function loadFixture(name: string): ParserFixture` reading `test-vault/fixtures/<name>.cache.json` with `node:fs`

- [ ] **Step 1: Inspect recordings** — for `ignored-before-h1`, `setext`, `duplicates-and-special`, `headings-in-code`: note the section `type` of the `%% %%` comment, the `heading` strings for markdown-heavy and closed headings, and whether setext headings appear in `headings`. Write the findings into the ledger; they decide the comment rule: if the comment has its own section type, ignore that type; if it is reported as `paragraph`, ignore a section whose sliced text (by offsets) trimmed starts with `%%` and ends with `%%`.
- [ ] **Step 2: Write failing tests**
  - `adapter.test.ts`: `null` cache → empty input; `ignored-before-h1` fixture → `firstContentLine` equals the H1's line; `content-before-h1` fixture → `firstContentLine` is the paragraph's line; `frontmatter-only` → `firstContentLine null`
  - `fixtures.test.ts` (fixture → `toParserInput` → `buildTree(…, fileBasename)` → compact outline via helper `outline(node): string[]` of indented `id` lines):
    - `worked-example` → `['Project', '  Project/Tasks', '  Project/Notes']` (spec worked example, headings only)
    - `skipped-levels`, `multiple-h1`, `content-before-h1`, `ignored-before-h1` (H1 root `Title`), `no-h1`, `no-headings`, `empty`, `frontmatter-only` (root only, id `''`, label = fixture name) with the outlines from Task 2's rules
    - `duplicates-and-special`: ids `Root/Notes`, `Root/Notes[2]`, `Root/A\/B`, `Root/Notes\[2]`, then the markdown-heavy, closed and non-ASCII headings with ids built from the recorded `heading` strings
    - `setext`: root `Title` with child `Sub` and grandchild `ATX child`, if Step 1 showed the cache reports setext headings (spec: "as reported by the cache"); otherwise assert what the cache reports and ledger it
    - `headings-in-code`: root `Root` with only child `Root/Real`
- [ ] **Step 3: Run** `npm test` — Expected: FAIL, module not found
- [ ] **Step 4: Implement** `src/parser/adapter.ts` and `tests/fixtures.ts`
- [ ] **Step 5: Run** `npm run check` — Expected: PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: adapt metadata cache to parser input"`; add a line per finding to the spec's "Open topics" only if the user asks (the spec is theirs)

### Task 4: Tidy tree layout and edge paths

**Files:**
- Create: `src/layout/types.ts`, `src/layout/tidyTree.ts`, `src/layout/edgePath.ts`
- Test: `tests/layout/tidyTree.test.ts`, `tests/layout/edgePath.test.ts`

**Interfaces:**
- Consumes: `MindMapTree`, `MindMapNode` (Task 2)
- Produces:
  - `src/layout/types.ts`: `Point { x; y }`, `Size { width; height }`, `Rect { x; y; width; height }`, `LayoutOptions { siblingGap: number; levelGap: number; nodeSize: (node: MindMapNode) => Size }`, `PositionedNode { node: MindMapNode; x: number; y: number; width: number; height: number }` (top-left corner), `LayoutEdge { fromId: string; toId: string; source: Point; target: Point }`, `MapLayout { nodes: PositionedNode[]; edges: LayoutEdge[]; bounds: Rect }`
  - `src/layout/tidyTree.ts`: `export const DEFAULT_LAYOUT = { siblingGap: 12, levelGap: 60, nodeWidth: 200, nodeHeight: 36 }` and `export function layoutTree(tree: MindMapTree, options: LayoutOptions): MapLayout` — left-to-right; root's left edge at `x = 0`, root vertically centered on `y = 0`; child `x = parent.x + parent.width + levelGap`; each subtree occupies a box of height `max(node height, sum of child subtree heights + gaps)`; children's boxes are stacked top to bottom in order; the parent is vertically centered on the extent of its children's boxes; edge `source` = parent's right-center, `target` = child's left-center; nodes in depth-first pre-order
  - `src/layout/edgePath.ts`: `export function edgePath(edge: LayoutEdge): string` → `M sx sy C mx sy, mx ty, tx ty` with `mx = sx + (tx - sx) / 2`, numbers as-is

- [ ] **Step 1: Write failing tests** (size `100 x 20`, siblingGap `10`, levelGap `50`):
  - `'root alone'`: one node at `(0, -10)`, bounds `{ x: 0, y: -10, width: 100, height: 20 }`, no edges
  - `'three leaf children are stacked and centered on the root'`: child `x = 150`, child `y = [-40, -10, 20]`, root `y = -10`
  - `'subtree boxes: parent centered on its children'`: root → `A` (children `A1`, `A2`), `B` leaf → `A1 (300, -40)`, `A2 (300, -10)`, `A (150, -25)`, `B (150, 20)`
  - `'edges run from parent right-center to child left-center'`: for the three-children case first edge `{ fromId: root.id, toId: c1.id, source: { x: 100, y: 0 }, target: { x: 150, y: -30 } }`
  - `'no two nodes overlap'`: 50 seeded random trees (deterministic PRNG in the test, up to 60 nodes, depth up to 6, variable sizes 40–300 x 20–120 via `nodeSize`) → no pair of node rects intersects, and every child is right of its parent
  - `'bounds enclose all nodes'`
  - `edgePath`: `{ source: { x: 0, y: 0 }, target: { x: 100, y: 50 } }` → `'M 0 0 C 50 0, 50 50, 100 50'`
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement** — two passes: measure subtree box heights bottom-up, then place top-down
- [ ] **Step 4: Run** `npm run check` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: add left-to-right tidy tree layout"`

### Task 5: Viewport math and wheel mapping

**Files:**
- Create: `src/render/viewport.ts`
- Test: `tests/render/viewport.test.ts`

**Interfaces:**
- Consumes: `Point`, `Size`, `Rect` (Task 4)
- Produces (`src/render/viewport.ts`, all pure):
  - `export interface Transform { x: number; y: number; zoom: number }` — screen = world × zoom + (x, y)
  - `export const ZOOM_LIMITS = { min: 0.1, max: 4 }`, `export const ZOOM_STEP = 1.2`, `export const FIT_PADDING = 40`
  - `export const IDENTITY: Transform = { x: 0, y: 0, zoom: 1 }`
  - `panBy(t: Transform, dx: number, dy: number): Transform`
  - `zoomAt(t: Transform, factor: number, at: Point): Transform` — clamps zoom to `ZOOM_LIMITS`, keeps the world point under `at` fixed
  - `fitToBounds(bounds: Rect, size: Size): Transform | null` — `null` when `size` has zero width or height; zoom `min((w - 2p) / bw, (h - 2p) / bh, 1)` clamped; bounds centered
  - `resetZoom(t: Transform, size: Size): Transform` — zoom 1 around the viewport center
  - `export type WheelAction = { kind: 'pan'; dx: number; dy: number } | { kind: 'zoom'; factor: number; at: Point }`
  - `wheelAction(e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; offsetX: number; offsetY: number }): WheelAction` — deltas × 16 for `deltaMode 1` (lines), × 800 for `2` (pages); Ctrl or Cmd → zoom with `factor = 2 ** (-deltaY / 250)` at `(offsetX, offsetY)`; else pan by `(-deltaX, -deltaY)`
  - `transformCss(t: Transform): string` → `translate(${x}px, ${y}px) scale(${zoom})`

- [ ] **Step 1: Write failing tests**
  - `panBy(IDENTITY, 5, -3)` → `{ x: 5, y: -3, zoom: 1 }`
  - `'zoomAt keeps the point under the cursor fixed'`: for `t = { x: 30, y: -20, zoom: 0.8 }`, factor `1.5` at `(200, 100)`: the world point mapped to `(200, 100)` before is still mapped there after (within `1e-9`)
  - `'zoomAt clamps'`: 100 × zoom in by `1.2` → `zoom === 4`; 100 × zoom out → `zoom === 0.1`; the anchor still holds at the clamp
  - `'fitToBounds centers and never zooms above 1'`: bounds `{ x: 0, y: -10, width: 100, height: 20 }`, size `800 x 600` → `zoom 1`, bounds center at the screen center `(400, 300)`
  - `'fitToBounds shrinks large maps'`: bounds `2000 x 400` in `800 x 600` → `zoom = 720 / 2000`
  - `'fitToBounds returns null for zero size'`: `0 x 600` and `800 x 0` → `null`
  - `'resetZoom keeps the viewport center'`
  - `wheelAction`: plain wheel `deltaY 100` → pan `dy -100`; `deltaMode 1, deltaY 3` → pan `dy -48`; `ctrlKey, deltaY -250` → zoom `factor 2` at offset; `metaKey` same as `ctrlKey`
  - `transformCss({ x: 1, y: 2, zoom: 0.5 })` → `'translate(1px, 2px) scale(0.5)'`
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement** `src/render/viewport.ts`
- [ ] **Step 4: Run** `npm run check` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: add viewport transform and wheel mapping"`

### Task 6: DOM renderer, pan/zoom input and floating controls

**Files:**
- Create: `src/render/DomMapRenderer.ts`, `src/render/panZoomInput.ts`, `src/render/MapControls.ts`
- Modify: `styles.css`, `tests/setup.ts` (pointer event / `setPointerCapture` polyfills if jsdom lacks them), `tests/mocks/obsidian.ts` (`setIcon`)
- Test: `tests/render/DomMapRenderer.test.ts`, `tests/render/panZoomInput.test.ts`, `tests/render/MapControls.test.ts`

**Interfaces:**
- Consumes: `MapLayout`, `edgePath` (Task 4); `Transform`, `transformCss`, `wheelAction`, `panBy`, `zoomAt` (Task 5)
- Produces:
  - `export interface MapRenderer { setLayout(layout: MapLayout): void; setTransform(t: Transform): void; readonly canvasEl: HTMLElement }` (the renderer interface from the spec; three.js is a future implementation)
  - `export class DomMapRenderer implements MapRenderer` with `constructor(parentEl: HTMLElement)`. DOM: `div.mind-mapper-canvas` > `div.mind-mapper-world` (CSS transform via `transformCss`, `transform-origin: 0 0`) > `svg.mind-mapper-edges` (one `path.mind-mapper-edge` per edge, `d = edgePath(edge)`) + one `div.mind-mapper-node` per node (`data-node-id`, absolute `left/top/width/height`, `title` = label, inner `div.mind-mapper-node-label` with the label; root also has class `is-root`). `setLayout` replaces previous content. Elements via `parentEl.doc`; SVG via `createElementNS('http://www.w3.org/2000/svg', …)`
  - `export interface PanZoomTarget { getTransform(): Transform; setTransform(t: Transform): void }`
  - `export function attachPanZoom(component: Component, canvasEl: HTMLElement, target: PanZoomTarget): void` — `wheel` (non-passive, `preventDefault`) → `wheelAction` → `panBy` / `zoomAt`; `pointerdown` with primary button on the canvas but not inside `.mind-mapper-node` or `.mind-mapper-controls` → pointer capture and pan by movement until `pointerup` / `pointercancel`; all listeners via `component.registerDomEvent`
  - `export interface MapActions { zoomIn(): void; zoomOut(): void; fitToView(): void; resetZoom(): void }`
  - `export class MapControls` with `constructor(parentEl: HTMLElement, actions: MapActions)` and `setZoom(zoom: number): void`. DOM: `div.mind-mapper-controls` (bottom center) with buttons in order: zoom out (`setIcon 'zoom-out'`, `aria-label 'Zoom out'`), reset (text = current zoom as `Math.round(zoom * 100) + '%'`, `aria-label 'Reset zoom to 100%'`), zoom in (`'zoom-in'`, `'Zoom in'`), fit (`'maximize'`, `'Fit to view'`)

- [ ] **Step 1: Write failing tests**
  - Renderer: `'renders one node div per node and one path per edge'` with ids, positions (`style.left === '150px'` etc.) and `d` attributes from a hand-built layout; `'setLayout replaces previous content'`; `'setTransform writes the CSS transform'`; `'long labels keep fixed size and expose the full text as title'` (label of 300 chars → node `style.width === '200px'`, `title` equals the label; CSS ellipsis is checked in the manual step)
  - Pan/zoom: wheel `deltaY 100` → `setTransform` with `y` decreased by 100; Ctrl+wheel → zoom changed, anchor fixed; pointer drag on the canvas by `(30, 20)` → pan `(30, 20)`; drag starting on a `.mind-mapper-node` or on `.mind-mapper-controls` → no change; listeners are removed after `component.unload()` (wheel after unload changes nothing)
  - Controls: four buttons in order with the aria labels above; clicking each calls the matching action once; `setZoom(0.5)` → reset button text `'50%'`
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**; mock `Component.registerDomEvent` must really add listeners and remove them on `unload()` (extend the mock accordingly)
- [ ] **Step 4: Styles** in `styles.css`, Obsidian variables only: canvas fills the view (`position: relative; overflow: hidden; height: 100%; cursor: grab`, `cursor: grabbing` while panning via class `is-panning`); node `background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); padding: 0 var(--size-4-2); display: flex; align-items: center`; label `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`; root `border-color: var(--interactive-accent); font-weight: var(--font-semibold)`; edge `fill: none; stroke: var(--text-faint); stroke-width: 1.5`; controls `position: absolute; bottom: var(--size-4-4); left: 50%; transform: translateX(-50%)`, background `var(--background-primary)`, shadow `var(--shadow-s)`, buttons `clickable-icon`
- [ ] **Step 5: Run** `npm run check` — Expected: PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: render map with pan, zoom and floating controls"`

### Task 7: View integration and commands

**Files:**
- Create: `src/commands/viewCommands.ts`
- Modify: `src/view/MindMapView.ts`, `src/main.ts`, `tests/mocks/obsidian.ts`, `tests/helpers.ts`, `README.md`
- Test: `tests/view/MindMapView.test.ts`, `tests/commands/viewCommands.test.ts`, `tests/main.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces:
  - `MindMapView implements MapActions` (+ `getTransform` / `setTransform` for `PanZoomTarget`); keeps M0's `file` getter and state behavior
  - Loading on `onOpen` and `setState`: no file → placeholder `No note selected` (M0); `app.vault.getFileByPath(path)` is `null` → placeholder `Note not found: <path>`; `getFileCache` `null` → placeholder `Loading…` and a one-shot `metadataCache.on('changed')` (via `registerEvent`) for that path that renders once; else `text = await app.vault.cachedRead(file)`, `buildTree(toParserInput(cache, text), file.basename)`, `layoutTree` with `DEFAULT_LAYOUT` sizes, `renderer.setLayout`
  - Async render guard: a render counter; a load that finishes after a newer `setState` is discarded
  - Fit on open: after the first layout, fit if `contentEl` has a non-zero size, else keep a pending fit that `onResize()` applies once the size is non-zero
  - `src/commands/viewCommands.ts`: `export function registerViewCommands(plugin: Plugin): void` adding `zoom-in` "Zoom in", `zoom-out` "Zoom out", `fit-to-view` "Fit to view", `reset-zoom` "Reset zoom to 100%", each `checkCallback` on `workspace.getActiveViewOfType(MindMapView)`, no hotkeys

- [ ] **Step 1: Write failing tests**
  - View (fake vault / metadataCache in `tests/helpers.ts`, fed from recorded fixtures via `loadFixture`): `'renders the worked example as three nodes and two edges'`; `'missing file shows Note not found'`; `'null cache shows Loading and renders on the first changed event for the file'` (a `changed` event for another file does not render); `'stale load is discarded'` (two `setState` calls, first `cachedRead` resolves last → nodes of the second file); `'fit waits for a non-zero size'` (size 0 → transform stays `IDENTITY`; set size, call `onResize()` → transform is `fitToBounds(...)`; a second `onResize()` does not re-fit after the user panned); `'root-only map renders and fits'` (`empty` fixture); `'zoomIn/zoomOut/resetZoom/fitToView change the transform and update the controls label'`
  - Commands: each of the four is hidden without an active `MindMapView`, available with one, calls the matching view method, has no hotkeys
  - `main.test.ts`: the four commands are registered; the dev recorder command is registered (tests run with `__DEV__ = true`)
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**; the view owns `DomMapRenderer`, `MapControls` and `attachPanZoom(this, …)`; view DOM is created in `onOpen`, `contentEl` gets class `mind-mapper-view`
- [ ] **Step 4: README** — command table gets the four new commands with suggested bindings (`Ctrl/Cmd + =` zoom in, `Ctrl/Cmd + -` zoom out, `Shift + 1` fit to view, `Shift + 0` reset zoom; none set by default); "Development" gets the fixture recording workflow (`test-vault/fixtures/`, dev command, commit the `*.cache.json`)
- [ ] **Step 5: Run** `npm run check` — Expected: PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: show heading outline map in the view with zoom commands"`
- [ ] **Step 7: Manual check (user)** in the vault Obsidian has open (dev build running): open `Worked example.md` as mind map → three nodes left to right with curved edges, map fitted and centered; wheel pans, Ctrl/Cmd + wheel and pinch zoom at the pointer, drag on empty canvas pans; the four controls work and the percentage updates; the four commands appear only while the map is focused; `fixtures/duplicates-and-special.md` shows long / markdown headings truncated with a tooltip; switch theme light/dark → colors follow; open the map in a popout window (drag the tab out) → pan and zoom still work; restart Obsidian with the map tab in the background, then switch to it → map is fitted

### Task 8: Merge

- [ ] **Step 1:** `npm run check` in the worktree — Expected: PASS
- [ ] **Step 2:** Squash-merge only after the user confirms the manual check and explicitly approves the commit on `main`; then remove the worktree and the branch (ask before `--force` if removal is refused)
