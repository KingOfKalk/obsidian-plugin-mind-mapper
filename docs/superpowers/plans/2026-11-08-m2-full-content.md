# M2 Full Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every note section becomes a node rendered by Obsidian (`MarkdownRenderer.render`): paragraphs, list items (nested, ordered, tasks), code, tables, math, quotes, callouts, image thumbnails; nodes size themselves from their content up to a max size, clip with an expand overlay, links behave like in Obsidian; a headless Obsidian E2E suite verifies what jsdom cannot, and a performance spike shows whether estimate-then-measure holds at 1,000 / 5,000 nodes.

**Architecture:** Parser grows from headings to all sections: the adapter passes sections, list items and embeds (plain data, offsets) and the note text; `buildTree` attaches section nodes under their heading and list items by `parent`, each node carrying the markdown to render. Sizes: a pure estimator gives instant first-layout sizes; each rendered node's content element is observed with `ResizeObserver`, measured sizes (clamped to the max) feed a debounced re-layout that keeps the viewport anchored. Node content is rendered by a `NodeContentRenderer` that owns one child `Component` per node (unloaded on replace/close), with timeout/exception fallback, disabled checkboxes, clip detection and an expand overlay (`Modal`). Links are wired by delegated click / hover handlers. A WebdriverIO + `wdio-obsidian-service` suite runs real Obsidian under Xvfb in the devcontainer, and also records parser fixtures headlessly.

**Tech Stack:** as M1, plus `@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `webdriverio` (10.2.x), `wdio-obsidian-service`, `wdio-obsidian-reporter` (3.5.x), `mocha`; system packages `xvfb`, `xauth` and Electron runtime libs (installed by a script, see Task 1).

**Spec:** [docs/mvp.md](../../mvp.md): "Mapping rules" (paragraphs, lists, containers, block types, node size, embeds, links: non-heading part), "Node identity" (other nodes), "View lifecycle" (render ownership, css-change, render failure, popout), "Implementation" (testing pyramid, measuring, rendering, performance), "Suggested milestones > M2", "Open topics" (ListItemCache positions, link handling out of the box)

## Global Constraints

- All M0/M1 constraints hold (ids, `minAppVersion 1.7.2`, no default hotkeys, popout safety via `el.doc` / `win` and `instanceOf`, listeners via `registerDomEvent` / `registerEvent`, Obsidian CSS variables only, `__DEV__` gating, Conventional Commits, no AI attribution, squash-merge only after manual check and explicit OK)
- Out of scope (later milestones): cross-connection lines for heading/block links (M5), live update / collapse / selection / jump to source (M3), culling (M6), circle layouts / frontmatter / settings tab (M4)
- Max node size `320 x 240` px (constant until M4 settings); node padding `8 px` horizontal, `6 px` vertical; image thumbnail box `160 x 120` px
- Re-layout debounce `100 ms`; render timeout `5000 ms`
- Merge gate: `npm run check` **and** `npm run test:e2e` pass
- E2E runs Obsidian `latest` (1.15.0 at time of writing) with installer `latest`; the vault is a temp copy of `test-vault/` made by the service
- Spec "Measuring" says measure in an attached off-screen container at zoom 1. This plan measures in place instead: `offsetWidth` / `offsetHeight` and `ResizeObserver` content boxes ignore CSS transforms, so in-place measurement equals zoom-1 measurement without moving DOM. Ledger this ruling in Task 7.

## Review Focus

1. Note with a 2,000-line code block, a 40-column table or a huge Mermaid diagram: node stays at max size, fades, expand overlay shows everything (Tasks 6, 9)
2. A node whose render throws or never resolves (e.g. a broken post processor from another plugin): raw text with error marker after at most 5 s, the rest of the map renders (Task 6)
3. Clicking a checkbox in a task node: nothing changes in the note (Tasks 6, 9)
4. Images that load late or fail to load: the node box does not jump, because the thumbnail box is fixed (Tasks 5, 9)
5. Closing the map while nodes are still rendering: no errors, all child components unloaded, no late writes into a detached DOM (Task 6)

---

### Task 1: E2E harness and headless fixture recording

**Files:**
- Create: `wdio.conf.mts`, `e2e/tsconfig.json`, `e2e/specs/smoke.e2e.ts`, `e2e/recordFixtures.e2e.ts`, `scripts/install-e2e-deps.sh`
- Modify: `package.json`, `.gitignore`, `.prettierignore`, `eslint.config.mjs`, `.devcontainer/devcontainer.json`, `README.md`
- Delete: the spike file `e2e/spike.e2e.ts` (uncommitted)

**Interfaces:**
- Produces:
  - npm scripts: `test:e2e` = `npm run build && xvfb-run -a wdio run ./wdio.conf.mts`; `fixtures:record` = `npm run build && xvfb-run -a wdio run ./wdio.conf.mts --spec ./e2e/recordFixtures.e2e.ts`; `typecheck` = `tsc --noEmit && tsc --noEmit -p e2e`
  - `wdio.conf.mts`: specs `./e2e/specs/**/*.e2e.ts`, `maxInstances: 1`, capability `browserName 'obsidian'`, `browserVersion 'latest'`, `installerVersion 'latest'`, `plugins ['.']`, `vault 'test-vault'`, services `['obsidian']`, reporters `['obsidian']`, `cacheDir .obsidian-cache`, mocha timeout `120000`
  - `e2e/helpers.ts`: `waitForCache(): Promise<void>` (resolves once `app.metadataCache.resolved`), `openMindMap(path: string): Promise<void>` (opens the note, runs `mind-mapper:open-as-mind-map`, waits for the root node)
  - `e2e/recordFixtures.e2e.ts`: for every `fixtures/*.md` in the vault, reads `{ obsidianVersion: apiVersion, text, cache }` via `browser.executeObsidian` and writes `test-vault/fixtures/<name>.cache.json` with `node:fs` (2-space JSON, final newline) — same format as the M1 recorder
  - `scripts/install-e2e-deps.sh`: idempotent `sudo apt-get install -y xvfb xauth libnss3 libgtk-3-0t64 libgbm1 libasound2t64 libxss1 libxtst6 libsecret-1-0 libdrm2 libxkbcommon0 libatk-bridge2.0-0t64 libcups2t64`; `devcontainer.json` gets `"postCreateCommand": "bash scripts/install-e2e-deps.sh"`

- [ ] **Step 1: Smoke spec** `e2e/specs/smoke.e2e.ts`: `'plugin is enabled'` (`app.plugins.plugins['mind-mapper']` exists); `'worked example opens as a mind map'` (after `openMindMap('Worked example.md')`, `.mind-mapper-node` count is `3`)
- [ ] **Step 2: Run** `npm run test:e2e` — Expected: 2 passing, reporter shows `obsidian v1.15.0`
- [ ] **Step 3: Recorder** — implement `e2e/recordFixtures.e2e.ts`; run `npm run fixtures:record`; Expected: the 12 M1 recordings are rewritten with `git diff --stat test-vault/fixtures` empty or limited to `obsidianVersion` (proves headless recordings equal the manual ones)
- [ ] **Step 4:** configs (ignores for `.obsidian-cache/`, e2e tsconfig with `@wdio/globals/types`, `@wdio/mocha-framework`, `wdio-obsidian-service` types, ESLint covers `e2e/` through its tsconfig), README "E2E tests" section, `npm run check` PASS
- [ ] **Step 5: Commit** — `git commit -m "test: add headless Obsidian e2e harness and fixture recording"`

### Task 2: M2 fixture notes and recordings

**Files:**
- Create: `test-vault/fixtures/*.md` (below), `test-vault/fixtures/*.cache.json` (recorded), `test-vault/assets/pixel.png` (1 x 1 PNG)

- [ ] **Step 1: Notes** (exact content is the implementer's, each must contain what its name says, non-ASCII somewhere in at least three of them):
  - `paragraphs.md`: H1, two paragraphs, a paragraph with trailing `^para-id`, a `%% comment %%` paragraph
  - `lists.md`: H1; bullet list with a nested bullet list three levels deep; an item with a continuation paragraph and an indented code block; an ordered list starting at `3`; a task list with `[ ]`, `[x]`, `[-]`; a list item ending with `^item-id`
  - `blocks.md`: H1; fenced code; mermaid fence; table; `$$` math block; blockquote containing a list; callout `> [!note] Title` with a code fence inside
  - `embeds.md`: H1; `![[pixel.png]]`; `![[paragraphs]]`; `![[paragraphs#Heading]]`; `![[doc.pdf]]`; markdown image `![alt](assets/pixel.png)`; a paragraph with inline `[[lists]]` and `[external](https://example.com)`
  - `skipped.md`: H1; thematic break `---`; HTML block `<div>x</div>`; footnote reference `[^1]` in a paragraph and footnote definition `[^1]: note`
  - `long-content.md`: H1; a fenced code block of 2,000 numbered lines (last line `line 2000`); a 40-column table; a 3,000-character paragraph
  - Also update `worked-example.md` only if the spec's example differs (it must stay verbatim)
- [ ] **Step 2: Record** — `npm run fixtures:record`; commit notes and recordings: `git commit -m "test: add and record M2 parser fixtures"`
- [ ] **Step 3: Findings** — inspect recordings with `jq` and write to the ledger: section `type` values seen (callout? math? html? footnoteDefinition?), whether a list item's `position.end` includes nested child items and continuation content, `parent` semantics (positive = parent item line, negative = list start line), `task` values, `embeds` entries (fields, offsets of `!`), whether `blocks` / section `id` carry `^id`. These answer two spec "Open topics"; Tasks 3–4 follow the findings.

### Task 3: Section nodes, skip rules, node markdown, ordinal IDs

**Files:**
- Modify: `src/parser/types.ts`, `src/parser/adapter.ts`, `src/parser/buildTree.ts`, `src/parser/nodeId.ts`
- Create: `src/parser/nodeMarkdown.ts`
- Test: `tests/parser/nodeMarkdown.test.ts`, `tests/parser/buildTree.test.ts`, `tests/parser/fixtures.test.ts`, `tests/parser/nodeId.test.ts`

**Interfaces:**
- Produces (`types.ts`, extending M1 types; M1 tests must still pass after adapting fixtures of hand-built input):
  - `SectionInput { type: string; startLine: number; endLine: number; startOffset: number; endOffset: number }`
  - `ListItemInput { startLine: number; startOffset: number; endOffset: number; parentLine: number; task: string | null }` (`parentLine < 0` = top-level item)
  - `EmbedInput { startOffset: number; endOffset: number; link: string }`
  - `ParserInput` gains `text: string; sections: SectionInput[]; listItems: ListItemInput[]; embeds: EmbedInput[]` (keeps `headings`, `firstContentLine`)
  - `NodeKind` = `'root' | 'heading' | 'paragraph' | 'list-item' | 'block'`
  - `MindMapNode` gains `markdown: string` (what is rendered; heading: heading text; virtual root: file name) and `sectionType: string | null` (`'code'`, `'table'`, `'math'`, `'blockquote'`, `'callout'`, … for blocks; `null` otherwise); `label` stays the plain fallback text (markdown source, first 200 chars)
- Produces (`nodeId.ts`): `escapeSegment` also escapes `#`; `export function ordinalId(parentId: string, ordinal: number): string` → `${parentId}/#${ordinal}` (`#${ordinal}` under the virtual root); ordinal is 1-based among the parent's non-heading children
- Produces (`nodeMarkdown.ts`):
  - `export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'avif']`
  - `export function sliceMarkdown(text: string, start: number, end: number, embeds: EmbedInput[]): string` — slice, then remove the `!` of every embed inside the range whose link target extension (before `#` / `|`) is not an image, then strip a trailing block ID (`/\s+\^[A-Za-z0-9-]+\s*$/`)
- Rules in `buildTree`: walk sections in order; `heading` sections open headings (M1 nesting); `yaml`, `thematicBreak`, `html`, `footnoteDefinition` and comment paragraphs (M1 `%%` rule) are skipped; `list` sections are delegated to Task 4 (in this task: one node per list section is acceptable only until Task 4 lands, tests for lists are Task 4's); `paragraph` → kind `paragraph`; any other type → kind `block` with `sectionType = type`; each node attaches to the current heading or the root

- [ ] **Step 1: Write failing tests**
  - `nodeMarkdown`: non-image embed `![[Note]]` → `[[Note]]`; `![[Note#H]]` → `[[Note#H]]`; `![[doc.pdf]]` → `[[doc.pdf]]`; `![[pixel.png]]` and `![[pixel.png|100]]` kept; markdown image `![a](x.png)` kept; trailing `^para-id` stripped, `a ^b c` (not trailing) kept; offsets of embeds outside the range ignored
  - `nodeId`: `ordinalId('Project/Tasks', 1) === 'Project/Tasks/#1'`; `ordinalId('', 2) === '#2'`; `escapeSegment('#1') === '\\#1'`
  - `buildTree` (hand-built input): paragraph after heading attaches to it; skipped types produce no node; code / table / math / blockquote / callout produce `block` nodes with `sectionType`; ordinals count only non-heading siblings (`Project/#1`, then heading `Project/Tasks`, then `Project/#2`); content before the first heading attaches to the root
  - `fixtures.test.ts`: `paragraphs` (comment and block ID handled), `blocks` (one node per block; the list inside the blockquote and the code inside the callout produce no own nodes), `embeds` (markdown of the note embed node is `[[paragraphs]]`, the image embed is kept), `skipped` (only H1 + the footnote-reference paragraph); M1 fixtures still give the same heading outline
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement** adapter (sections, embeds from `cache.embeds`, `text`), `nodeMarkdown.ts`, tree rules
- [ ] **Step 4: Run** `npm run check` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: map paragraphs and blocks to nodes"`

### Task 4: List items

**Files:**
- Modify: `src/parser/adapter.ts`, `src/parser/buildTree.ts`
- Create: `src/parser/listItems.ts`
- Test: `tests/parser/listItems.test.ts`, `tests/parser/fixtures.test.ts`

**Interfaces:**
- Consumes: `ListItemInput`, `sliceMarkdown` (Task 3)
- Produces (`listItems.ts`): `export function itemMarkdown(text: string, item: ListItemInput, firstChildOffset: number | null, embeds: EmbedInput[]): string` — own content = from item start to `firstChildOffset ?? item end` (Task 2 finding decides whether `item end` already excludes children); first line: bullet markers `-`, `*`, `+` removed, ordered markers `\d+[.)]` kept, task items rendered as `- [<task>] text`; continuation lines dedented by the item's content indent (marker width incl. spaces); then `sliceMarkdown` rules (embeds, block ID)
- Rules: list items are taken only from `list` sections (items inside blockquotes / callouts belong to that block node); top-level items attach to the current heading; nested items attach to their parent item (by `parentLine`); kind `list-item`; IDs by `ordinalId` among the parent's non-heading children

- [ ] **Step 1: Write failing tests**
  - `itemMarkdown`: `- a` → `a`; `* a` → `a`; `3. a` → `3. a`; `- [ ] a` → `- [ ] a`; `- [x] a` → `- [x] a`; item with continuation `- [ ] Write parser\n  Details for the parser.` → `- [ ] Write parser\nDetails for the parser.`; nested child content excluded; trailing `^item-id` stripped
  - `fixtures.test.ts`: `worked-example` full tree matches the spec's worked example: `Project` → [`Intro paragraph.` (`Project/#1`), `Tasks` → [`- [ ] Write parser\nDetails for the parser.` (`Project/Tasks/#1`), `- [x] Set up CI` (`Project/Tasks/#2`)], `Notes` → [blockquote `> A quote` (`Project/Notes/#1`)]]; `lists` nesting three levels deep, ordered `3.` kept, `[-]` task kept
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm run check` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: map list items to nested nodes"`

### Task 5: Size estimation, measured size, anchored re-layout math

**Files:**
- Create: `src/layout/nodeSize.ts`, `src/layout/anchor.ts`
- Test: `tests/layout/nodeSize.test.ts`, `tests/layout/anchor.test.ts`

**Interfaces:**
- Produces (`nodeSize.ts`):
  - `export const NODE_LIMITS = { maxWidth: 320, maxHeight: 240, padX: 8, padY: 6, thumb: { width: 160, height: 120 } }`
  - `export function estimateSize(node: MindMapNode): Size` — text: `charW 8`, `lineH 24`; code (`sectionType 'code'`): `charW 7.8`, `lineH 20`, width from the longest line; table: `rows * 32`; image-only node (markdown is a single image embed): thumb box + padding; width `min(maxWidth, longest line * charW + 2 * padX)` with wrapping by `maxWidth - 2 * padX`, at least `40`; height `min(maxHeight, lines * lineH + 2 * padY)`
  - `export interface ContentBox { offsetWidth: number; offsetHeight: number; scrollWidth: number; scrollHeight: number }`
  - `export function measuredSize(content: ContentBox): { size: Size; clipped: boolean }` — natural = `max(offset, scroll)` per axis plus padding; clamp to max; `clipped` if natural exceeds the max on either axis
- Produces (`anchor.ts`):
  - `export function nearestNode(layout: MapLayout, world: Point): PositionedNode | null` (by distance to node center)
  - `export function anchoredTransform(t: Transform, before: Point, after: Point): Transform` — pans so that the world point `before` (old node top-left) appears where `after` now appears: `x + (before.x - after.x) * zoom`, same for `y`

- [ ] **Step 1: Write failing tests** — `estimateSize`: short heading width < 320 and height = `24 + 12`; 2,000-char paragraph → `320 x 240`; code block of 3 lines, longest 20 chars → width `20 * 7.8 + 16`, height `3 * 20 + 12`; image-only node → `176 x 132`; empty markdown → width `40`; `measuredSize`: small content not clipped; `scrollHeight 900` → height `240`, clipped; `scrollWidth 900` → width `320`, clipped; `anchoredTransform` keeps the anchor's screen position (property check); `nearestNode` returns the closest center
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm run check` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: estimate and clamp node sizes, anchor re-layout"`

### Task 6: Node content rendering, fallback, checkboxes, clip and overlay

**Files:**
- Create: `src/render/NodeContentRenderer.ts`, `src/render/NodeContentModal.ts`
- Modify: `src/render/DomMapRenderer.ts`, `styles.css`, `tests/mocks/obsidian.ts` (`MarkdownRenderer.render` mock: writes markdown as text into `el`, controllable to throw or hang; `Modal` mock)
- Test: `tests/render/NodeContentRenderer.test.ts`, `tests/render/DomMapRenderer.test.ts`

**Interfaces:**
- Produces:
  - `export const RENDER_TIMEOUT_MS = 5000`
  - `export class NodeContentRenderer` with `constructor(app: App, sourcePath: () => string, parent: Component)` and:
    - `render(node: MindMapNode, contentEl: HTMLElement): Promise<void>` — creates a child `Component` (added to `parent` via `addChild`), awaits `MarkdownRenderer.render(app, node.markdown, contentEl, sourcePath(), child)` raced against the timeout; on error/timeout: `contentEl` emptied, raw markdown as text, class `is-render-error` on the node element; afterwards: all `input[type=checkbox]` in `contentEl` get `disabled = true`; ignores results for a node element that was released meanwhile
    - `release(contentEl: HTMLElement): void` — unloads and removes that node's child component
    - `releaseAll(): void`
  - `DomMapRenderer` node DOM becomes `div.mind-mapper-node` (positioned; size from layout; `overflow: hidden`) > `div.mind-mapper-node-content` (`width: max-content; max-width: calc(320px - 16px)`) + `button.mind-mapper-node-expand` (hidden unless `is-clipped`, `setIcon 'maximize-2'`, `aria-label 'Show full content'`); `setLayout` reuses node elements by node id when the markdown is unchanged and only moves / resizes them; new or changed nodes get content rendered via `NodeContentRenderer`; removed nodes are released
  - `export class NodeContentModal extends Modal` — `constructor(app, node: MindMapNode, sourcePath: string)`, renders the full markdown into `contentEl` with its own `Component` (loaded on open, unloaded on close), checkboxes disabled
  - Expand button click opens `NodeContentModal`; the click does not start panning (`.mind-mapper-node` is already excluded) and does not bubble to the node

- [ ] **Step 1: Write failing tests** — renders markdown via the mock into `.mind-mapper-node-content`; each node gets its own child component and `releaseAll()` unloads all; throwing render → raw text and `is-render-error`; hanging render → fallback after `RENDER_TIMEOUT_MS` (fake timers); render resolving after `release` writes nothing; checkboxes disabled; `setLayout` with the same markdown keeps the same element and does not re-render; changed markdown re-renders and releases the old component; expand button opens the modal with the node's markdown
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**; styles: content `font-size: var(--font-text-size)`, node `is-clipped` adds a bottom/right fade via `mask-image: linear-gradient(...)` on the content, expand button top-right, image embeds inside nodes `width: 160px; height: 120px; object-fit: contain`, task list bullets hidden
- [ ] **Step 4: Run** `npm run check` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: render node content with Obsidian, fallback and overlay"`

### Task 7: Measure, observe, re-layout

**Files:**
- Modify: `src/view/MindMapView.ts`, `src/render/DomMapRenderer.ts`, `tests/setup.ts` (`ResizeObserver` fake with manual trigger)
- Test: `tests/view/MindMapView.test.ts`

**Interfaces:**
- Consumes: `estimateSize`, `measuredSize`, `nearestNode`, `anchoredTransform` (Task 5), `NodeContentRenderer` (Task 6)
- Produces:
  - Size cache in the view: `Map<string, Size>` keyed by `${markdown hash}:${maxWidth}` (render cache key from the spec; hash = simple 32-bit FNV-1a of the markdown, `src/util/hash.ts`, unit tested)
  - First layout uses cached measured size or `estimateSize`
  - One `ResizeObserver` from `contentEl.win` observing every `.mind-mapper-node-content`; callbacks compute `measuredSize`, update the cache and the node's `is-clipped` class, and schedule a re-layout debounced by `100 ms` if any size changed
  - Re-layout: anchor = node nearest the viewport center in the old layout; after `layoutTree` the transform is `anchoredTransform` of that node's old and new top-left; no anchor jump when nothing moved
  - `workspace.on('css-change')` → re-measure all rendered nodes (read sizes again) and re-layout
  - Observer disconnected in `onClose` and on unload; `NodeContentRenderer.releaseAll()` in `onClose`

- [ ] **Step 1: Write failing tests** — first layout uses estimates; a ResizeObserver report with a larger size triggers one re-layout after 100 ms (fake timers) and the anchor node keeps its screen position; several reports within 100 ms → one re-layout; `css-change` re-measures; `onClose` disconnects the observer and releases all components; size cache reused when the same markdown appears again (second `setState`)
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**; ledger the in-place measuring ruling (Global Constraints)
- [ ] **Step 4: Run** `npm run check` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: measure rendered nodes and re-layout anchored"`

### Task 8: Links

**Files:**
- Create: `src/render/linkHandling.ts`
- Modify: `src/main.ts`, `src/view/MindMapView.ts`
- Test: `tests/render/linkHandling.test.ts`, `tests/main.test.ts`

**Interfaces:**
- Produces:
  - `export const HOVER_SOURCE_ID = VIEW_TYPE_MIND_MAP;` plugin `onload` calls `registerHoverLinkSource(HOVER_SOURCE_ID, { display: 'Mind Mapper', defaultMod: true })`
  - `export function attachLinkHandling(view: ItemView, canvasEl: HTMLElement, sourcePath: () => string): void` — delegated on `canvasEl`: click on `a.internal-link` → `preventDefault`, `stopPropagation`, `app.workspace.openLinkText(linktext, sourcePath(), Keymap.isModEvent(evt))` with `linktext = data-href ?? href`; click on `a.external-link` → `stopPropagation` only (default behavior opens it); `mouseover` on `a.internal-link` → `app.workspace.trigger('hover-link', { event, source: HOVER_SOURCE_ID, hoverParent: view, targetEl: link, linktext, sourcePath: sourcePath() })`; `pointerdown` on any `a` does not pan (already true inside nodes)

- [ ] **Step 1: Write failing tests** — internal link click opens via `openLinkText` with the pinned path and `false`; with Ctrl/Cmd → `Keymap.isModEvent` result passed (mock `Keymap.isModEvent` returns `'tab'` for `ctrlKey`); external link click not prevented; hover triggers `hover-link` with the payload above; hover source registered in `onload`
- [ ] **Step 2: Run** `npm test` — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npm run check` — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: wire link clicks and hover preview in nodes"`

### Task 9: E2E checks and performance spike

**Files:**
- Create: `e2e/specs/content.e2e.ts`, `e2e/specs/links.e2e.ts`, `e2e/perf/generateNote.ts`, `e2e/perf/perf.e2e.ts`, `e2e/perf/baseline.json`
- Modify: `package.json` (`perf:e2e` script running `e2e/perf/perf.e2e.ts` only), `README.md`

- [ ] **Step 1: Content E2E** (`content.e2e.ts`, real Obsidian): worked example has 6 nodes with the spec's tree; task checkbox is disabled and clicking it leaves the note text unchanged; the 2,000-line code fixture node is `320 x 240` (measured at zoom 1 via `offsetWidth/Height`), has `is-clipped` and the expand button opens a modal containing the last code line; mermaid and table nodes render (`svg`, `table` inside); image node shows an `img` inside a `160 x 120` box; `![[paragraphs]]` renders as a link, not a transclusion; no node has `is-render-error`; nodes do not overlap after the re-layout settles (read rects, zoom-normalized)
- [ ] **Step 2: Links E2E** (`links.e2e.ts`): clicking `[[lists]]` in a node opens `fixtures/lists.md` in a leaf other than the map; Ctrl/Cmd click opens a new tab; the map leaf still shows the map; spec open topic answered in the ledger (did anything work before wiring? — check by commenting out `attachLinkHandling` locally once, not committed)
- [ ] **Step 3: Performance spike** — `generateNote(nodes: number, seed: number): string` (headings 3 levels, paragraphs, lists, code, tables in fixed proportions); `perf.e2e.ts` writes 1,000- and 5,000-node notes into the vault, opens each as a map and records: time to first layout, time until re-layout settles (no ResizeObserver report for 500 ms), number of re-layouts, longest frame during a scripted pan (requestAnimationFrame deltas over 2 s), sum of absolute size corrections (estimate vs measured); prints a table and writes `e2e/perf/last-run.json` (gitignored); `baseline.json` is the first run's numbers, committed. No assertions on timings (spec: no fps assertions in CI); the test fails only on errors
- [ ] **Step 4: Run** `npm run test:e2e` and `npm run perf:e2e` — Expected: all passing; perf table printed
- [ ] **Step 5: Ledger the spike result**: does estimate-then-measure settle without visible jumps? If 5,000 nodes take more than ~10 s to settle or the longest frame exceeds ~100 ms, ledger it as input for M6 (culling) rather than fixing in M2
- [ ] **Step 6: Commit** — `git commit -m "test: e2e checks for content and links, performance spike"`

### Task 10: Manual check and merge

- [ ] **Step 1:** `npm run check` and `npm run test:e2e` — Expected: PASS
- [ ] **Step 2: Manual check (user)** in `dev-vault` (`npm run dev`): open `fixtures/blocks.md`, `fixtures/lists.md`, `fixtures/embeds.md` and an own note as mind maps; content looks like reading view; long nodes fade and expand; links open and hover previews show (with the page preview core plugin on); theme switch re-measures; popout still works
- [ ] **Step 3:** Squash-merge after the user's explicit OK; remove worktree and branch
