# M4 XMind Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The XMind-like map: two circle layouts (balanced left/right), all four linear directions, per-note frontmatter (`mind_map_title`, `mind_map_layout`), a settings tab, and `circle-clockwise` as the default.

**Architecture:**
- The pure layout runs one canonical left-to-right tidy tree; other directions are coordinate transforms of it (swap axes, mirror).
- Circle layouts lay out the right and left halves of the root's children as two left-to-right trees and mirror the left one about the root.
- Node limits (max size) become a parameter that comes from the settings.
- Frontmatter is read in the view; a per-session "warn once" set lives in the plugin.

**Tech Stack:** TypeScript, Obsidian API (`PluginSettingTab`, `Setting`, `loadData` / `saveData`), Vitest + jsdom with the hand-written mock, WebdriverIO + wdio-obsidian-service (Obsidian 1.15.0, headless).

**Spec:**
- [docs/mvp.md](../../mvp.md): "Layout (decided)", "Frontmatter", "Node size", M4.
- Roadmap: [2026-11-08-roadmap-m3-m7.md](2026-11-08-roadmap-m3-m7.md), section M4.

## Global Constraints

- Layout names, exactly: `circle-clockwise`, `circle-counter-clockwise`, `left-to-right`, `right-to-left`, `top-to-bottom`, `bottom-to-top`.
- Default layout: plugin setting, initially `circle-clockwise`.
- Circle layouts:
  - The first half of the first-level branches (rounded up) goes on the right side, the rest on the left.
  - Clockwise order: right side top to bottom, then left side bottom to top.
  - `circle-counter-clockwise` mirrors horizontally.
  - Each side is a linear tree (right: left-to-right; left: right-to-left).
  - Each side's stack is vertically centred on the root; the two sides are independent.
- Linear layouts: all subtrees grow in the layout direction.
- Frontmatter validation:
  - `mind_map_layout` not in the list falls back to the plugin setting.
  - A `mind_map_title` that is not a string falls back to the default.
  - A notice is shown once per note and invalid value (per session), not on every save.
- `mind_map_title` overrides the root label (also when an H1 is the root).
- Settings:
  - default layout;
  - max node size: width 160–800, default 320; height 120–800, default 240;
  - sibling gap: 0–200, default 12;
  - level gap: 20–400, default 60;
  - out-of-range input is clamped.
- Bounding-box tidy tree stays; contour packing only if the screenshots look clearly too sparse.
- Edges: cubic bezier, tangents along the layout's main axis.

## Review Focus

1. A note with exactly one first-level branch, or none, in a circle layout: no crash; the branch sits at 3 o'clock (counter-clockwise: 9 o'clock). Test in Task 1.
2. Switching layout on a live map (frontmatter edit, settings change): the map fits once to the new layout; a size or gap change keeps the viewport anchored. Test in Task 5.
3. `mind_map_title` written as a YAML number or list: a notice once, default title, no crash; an empty string falls back silently. Test in Task 4.
4. Settings data from an older or corrupted `data.json` (missing keys, strings instead of numbers, unknown layout): sane defaults. Test in Task 3.
5. A collapse toggle on a left-side or vertical node sits outside the node on its child-side edge, never covering content. Test in Task 5 (unit test) and Task 6 (E2E geometry).

---

### Task 1: Layout engine: directions and circle layouts

**Files:**
- Modify: `src/layout/types.ts`, `src/layout/tidyTree.ts`, `src/layout/edgePath.ts`
- Test: `tests/layout/tidyTree.test.ts`, `tests/layout/edgePath.test.ts`, new `tests/layout/layouts.test.ts`

**Interfaces:**
- Produces in `types.ts`:
  - `type MapLayoutName = 'circle-clockwise' | 'circle-counter-clockwise' | 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'`
  - `const LAYOUT_NAMES: readonly MapLayoutName[]` (in the order above)
  - `type Side = 'right' | 'left' | 'bottom' | 'top'`
  - `LayoutOptions.layout?: MapLayoutName` (default `'left-to-right'`, so existing layout tests keep their meaning)
  - `PositionedNode.childSide: Side`: the edge its children grow from. The circle root gets `'right'`; it has no toggle (Task 5).
  - `LayoutEdge.axis: 'x' | 'y'`: the tangent direction.
- `edgePath(edge)`: for axis `y`, tangents are vertical (`M sx sy C sx my, tx my, tx ty`).

**Algorithm:**
1. Compute the canonical left-to-right layout. For `top-to-bottom` / `bottom-to-top`, compute it with width and height swapped per node.
2. Map each rect and edge point:

| Layout | x′ | y′ | Swap w/h |
|---|---|---|---|
| left-to-right | x | y | no |
| right-to-left | `rootW − x − w` | y | no |
| top-to-bottom | y | x | yes |
| bottom-to-top | y | `rootH − x − h` | yes |

   `rootW` / `rootH` are the root's canonical width and height, so the root stays at the origin.
3. Circle: right = the first `ceil(n/2)` children; left = the rest, reversed (bottom to top).
   - Lay out `{root, right}` and `{root, left}` as left-to-right trees, both with root top-left at `x = 0` and root centre at `y = 0`.
   - Mirror the left result as in right-to-left.
   - Merge: the root comes once, then right nodes, then left nodes. Bounds cover all.
   - Counter-clockwise: mirror the whole clockwise result (`rootW − x − w`), and swap the sides in `childSide`.

- [ ] **Step 1: Write the failing tests** in `tests/layout/layouts.test.ts`:
  - `circle-clockwise clock positions` for 1, 2, 3, 4 and 6 first-level leaves (fixed size 100×20). Compare each child centre against the root centre:
    - 1: right, `dy = 0`.
    - 2: right `dy = 0`, left `dy = 0`.
    - 3: right `dy < 0`, right `dy > 0`, left `dy = 0` (children 1, 2, 3).
    - 4: right up, right down, left down, left up (children 1–4).
    - 6: right up / right 0 / right down / left down / left 0 / left up.
  - `circle-counter-clockwise mirrors clockwise horizontally` (same `dy`, opposite `dx` sign per child).
  - `circle with zero children is the root alone` (Review Focus 1).
  - `each linear direction grows its subtrees in that direction`: for every edge, child centre minus parent centre has the direction's sign (LTR `dx > 0`, RTL `dx < 0`, TTB `dy > 0`, BTT `dy < 0`), and `edge.axis` matches.
  - `no overlaps in any layout for all recorded fixtures`: every fixture in `test-vault/fixtures/*.cache.json` × every `LAYOUT_NAMES` entry, using `estimateSize`; pairwise rect overlap check, as in the existing random-tree test.
  - `childSide per layout`: LTR right, RTL left, TTB bottom, BTT top; circle: right-side nodes right, left-side nodes left.
  - In `edgePath.test.ts`: `vertical axis uses vertical tangents`.
- [ ] **Step 2: Run** `npx vitest run tests/layout`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/layout`. Expected: PASS, including the existing tidyTree tests unchanged.
- [ ] **Step 5: Commit** `feat: linear and circle layouts`.

### Task 2: Node limits as a parameter, border, cache key

**Files:**
- Modify: `src/layout/nodeSize.ts`, `src/layout/sizeCache.ts`
- Test: `tests/layout/nodeSize.test.ts`, `tests/layout/sizeCache.test.ts`

**Interfaces:**
- `interface NodeLimits { maxWidth: number; maxHeight: number; padX: number; padY: number; border: number; minWidth: number; thumb: Size }`
- `NODE_LIMITS` stays the default, with `border: 1`.
- `limitsFor(maxWidth: number, maxHeight: number): NodeLimits`
- `estimateSize(node, limits = NODE_LIMITS)`
- `measuredSize(content, limits = NODE_LIMITS)`: adds `2 * border` (fixes the M2 minor).
- `cacheKey(node, limits)` = `${fnv1a(markdown)}:${kind === 'root' ? 'root' : 'node'}:${maxWidth}x${maxHeight}` (fixes the M2 minor about root styling).
- `new SizeCache(limits: () => NodeLimits)`

- [ ] **Step 1: Write the failing tests:**
  - `measuredSize counts the border`: content 100×20 → 118×34.
  - `limitsFor 500 x 300 caps estimate and measure at 500 x 300`.
  - `root and paragraph with the same markdown have separate cache entries`.
  - `cache entries depend on max size`.
  - Update the existing M2 expectations that change by +2 px from the border, here and in `tests/view/MindMapView.test.ts`.
- [ ] **Step 2: Run** `npm test`. Expected: the new and updated tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: node limits as a parameter, border in measured size, cache key with kind and size`.

### Task 3: Settings and settings tab

**Files:**
- Create: `src/settings.ts`, `src/settingsTab.ts`
- Modify: `src/main.ts`, `tests/mocks/obsidian.ts` (`PluginSettingTab`, `Setting` with `setName`, `setDesc`, `addDropdown`, `addText`; `Plugin.loadData`, `saveData`, `addSettingTab`)
- Test: `tests/settings.test.ts`, `tests/settingsTab.test.ts`

**Interfaces:**
- `interface MindMapSettings { defaultLayout: MapLayoutName; maxNodeWidth: number; maxNodeHeight: number; siblingGap: number; levelGap: number }`
- `DEFAULT_SETTINGS = { defaultLayout: 'circle-clockwise', maxNodeWidth: 320, maxNodeHeight: 240, siblingGap: 12, levelGap: 60 }`
- `SETTING_RANGES`: width 160–800, height 120–800, siblingGap 0–200, levelGap 20–400.
- `sanitizeSettings(raw: unknown): MindMapSettings`:
  - Unknown keys are dropped.
  - Numbers are rounded and clamped.
  - Numeric strings are parsed.
  - Anything else takes the default.
- Plugin:
  - `settings: MindMapSettings`, loaded in `onload` via `sanitizeSettings(await this.loadData())`.
  - `async updateSettings(patch: Partial<MindMapSettings>): Promise<void>` sanitizes, saves and calls `refresh()` on every open `MindMapView`.
- Tab `MindMapSettingTab`:
  - Rows: "Default layout" (dropdown of `LAYOUT_NAMES`), "Max node width", "Max node height", "Sibling gap", "Level gap" (text inputs, number type).
  - Each row's description gives its range in px.
  - Number fields commit on change; invalid text is ignored until valid.

- [ ] **Step 1: Write the failing tests:**
  - `sanitizeSettings: missing, wrong-typed, out-of-range and unknown values` (Review Focus 4);
  - `plugin loads saved settings and registers the tab`;
  - `changing the default layout in the tab saves it and refreshes open maps`;
  - `a max width of 5000 typed in the tab is clamped to 800`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: settings tab for layout, node size and gaps`.

### Task 4: Frontmatter options and title

**Files:**
- Create: `src/view/frontmatter.ts`
- Modify: `src/parser/buildTree.ts` (optional `title`)
- Test: `tests/view/frontmatter.test.ts`, `tests/parser/buildTree.test.ts`

**Interfaces:**
- `readMapOptions(frontmatter: Record<string, unknown> | undefined, defaultLayout: MapLayoutName): { title: string | null; layout: MapLayoutName; invalid: { key: 'mind_map_title' | 'mind_map_layout'; value: string }[] }`
  - The title is a trimmed non-empty string. An empty or whitespace string → `null` with no notice. A non-string value → `null`, recorded in `invalid` with `String(value)` (lists joined with commas).
  - The layout is a string from the list. Absent → default, no notice. Anything else → default plus `invalid`.
- `buildTree(input, fileName, title?: string | null)`: the title replaces the root's label and markdown (escaped like before), never its ID.
  - Ruling to ledger: the roadmap said the title becomes part of the root ID. Keeping the ID keeps the collapse state when the title changes, and the spec only says "label".
- Notice copy, exact:
  - `Mind Mapper: unknown mind_map_layout "<value>" in <path>, using <layout>`
  - `Mind Mapper: mind_map_title in <path> is not text, using the default title`

- [ ] **Step 1: Write the failing tests:**
  - valid, absent, invalid layout;
  - title as string / empty / number / list (Review Focus 3);
  - `buildTree title replaces the root label but keeps the root id (H1 root and virtual root)`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: mind_map_title and mind_map_layout frontmatter`.

### Task 5: View integration

**Files:**
- Modify: `src/view/MindMapView.ts`, `src/render/DomMapRenderer.ts`, `src/main.ts`, `styles.css`
- Test: `tests/view/MindMapView.test.ts`, `tests/render/DomMapRenderer.test.ts`

**Interfaces:**
- `interface ViewServices { recency: LeafRecency; settings(): MindMapSettings; warnOnce(id: string, message: string): void }`
  - The constructor becomes `new MindMapView(leaf, services?: Partial<ViewServices>)`, with defaults (fresh recency, `DEFAULT_SETTINGS`, `new Notice`).
  - The plugin passes its own services; `warnOnce` keeps a `Set<string>` of IDs `path\0key\0value`.
- `MindMapView.refresh(): void` (called by the plugin after a settings change). It re-reads the settings, updates the CSS custom properties and re-lays out.
- **Effective layout:** frontmatter, else the setting. A change of the effective layout name (open, live update, refresh) fits once. Any other re-layout anchors as before.
- The view sets `--mind-mapper-node-max-width` / `--mind-mapper-node-max-height` on `contentEl`. `styles.css` uses them for the content max size (`calc(var(--mind-mapper-node-max-width, 320px) - 18px)`, height `- 14px`) and the mermaid width.
- **Renderer:**
  - The toggle gets class `is-side-<childSide>` and is positioned at the middle of that edge. CSS translates it outside per side (right: `translate(3px, -50%)`; left: `translate(calc(-100% - 3px), -50%)`; bottom: `translate(-50%, 3px)`; top: `translate(-50%, calc(-100% - 3px))`).
  - The root never gets a toggle. Ruling to ledger: a circle root has two child sides, and collapsing the root hides the whole map. Collapse all already keeps the root expanded.
- **Warnings:** `readMapOptions(cache.frontmatter, settings.defaultLayout)` runs on load and on live update; every `invalid` entry calls `warnOnce`.

- [ ] **Step 1: Write the failing tests:**
  - `default layout is circle-clockwise: first-level branches on both sides of the root`;
  - `frontmatter mind_map_layout left-to-right puts all children right of the root`;
  - `an invalid mind_map_layout warns once across live updates and reopen`;
  - `mind_map_title replaces the root label`;
  - `refresh after a gap change keeps the viewport anchored; after a default layout change it fits` (Review Focus 2);
  - `max node size from settings reaches the CSS variables and caps estimates`;
  - renderer: `toggle side classes and positions per childSide; root has no toggle` (Review Focus 5).
  - Update existing view tests that assumed left-to-right geometry: they pin `left-to-right` through services settings; ledger which ones.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: layouts, frontmatter and settings in the map view`.

### Task 6: E2E, screenshots, README

**Files:**
- Create: `e2e/specs/layouts.e2e.ts`
- Modify: `e2e/screenshots.e2e.ts`, `README.md`

**E2E tests:**
- `every layout renders every fixture without overlaps`: set `defaultLayout` through `app.plugins.plugins['mind-mapper'].updateSettings`, open the six content fixtures, settle, check pairwise overlap.
- `frontmatter layout and title apply`: a temp note with `mind_map_layout: top-to-bottom` and `mind_map_title: Custom` → the root text is "Custom", and every child top is below the root bottom.
- `an invalid layout shows one notice`: open twice, plus one live edit → exactly one `.notice` containing `unknown mind_map_layout`.
- `toggles sit outside their nodes in every layout` (Review Focus 5): per layout, for every toggle, its rect does not intersect its node rect.
- `a settings change re-lays out an open map`: a level gap of 200 → the first child's x moves away from the root.

**Screenshots:** one per layout of `worked-example` and of `lists` (`layout-<name>.png`).

**README:** sections "Layouts", "Frontmatter" (keys, values, fallback and notice) and "Settings" (each setting with range and default).

- [ ] **Step 1: Write `layouts.e2e.ts`; run** `npm run test:e2e`. Expected: PASS. A failure is a bug: fix it with a unit test RED→GREEN.
- [ ] **Step 2: Run** `npm run screenshots:e2e` and look at all layout PNGs.
  - Judge sparseness. Contour packing goes in only if the maps look clearly too sparse; otherwise ledger the ruling "not needed", with the screenshots as evidence.
  - Every visual bug gets a geometric E2E assertion.
- [ ] **Step 3: Update README; run** `npm run check`. Expected: PASS.
- [ ] **Step 4: Commit** `test: e2e and screenshots for layouts, frontmatter and settings`.
