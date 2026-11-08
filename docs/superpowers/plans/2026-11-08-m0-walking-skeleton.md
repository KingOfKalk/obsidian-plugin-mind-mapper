# M0 Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable Obsidian plugin "Mind Mapper" that opens an empty mind map view for the active markdown note via the command palette, restores that view after a restart, and has a local dev loop, a local quality gate and a local release package.

**Architecture:** Obsidian plugin bundled by esbuild into `main.js`. `MindMapperPlugin` registers one custom `ItemView` (`MindMapView`) and one command. The view keeps only the pinned file path as state; pure helpers (state parsing, basename, source check) are unit tested; Obsidian classes are tested against a hand-written `obsidian` mock aliased in Vitest.

**Tech Stack:** TypeScript 6.0.x, esbuild, Vitest + jsdom, ESLint (typescript-eslint + eslint-plugin-obsidianmd), Prettier, npm.

**Spec:** [docs/mvp.md](../../mvp.md) (sections "MVP features > Open", "View lifecycle and error states > View state", "Implementation", "Suggested milestones > M0")

## Global Constraints

- Plugin id `mind-mapper`, name `Mind Mapper` (id must not contain "obsidian")
- `isDesktopOnly: true`; `minAppVersion: "1.7.2"` (oldest version with `revealLeaf(): Promise` and deferred views; re-check in M7)
- Initial version `0.1.0`
- Dependency pins: `typescript` `~6.0.3` (typescript-eslint peer range is `<6.1.0`), `obsidian` `1.14.4`, `esbuild` `^0.28`, `vitest` `^5.1`, `jsdom` `^31`, `eslint` `^10`, `typescript-eslint` `^8.72`, `eslint-plugin-obsidianmd` `^0.5.1`, `prettier` latest 3.x
- No GitHub CI, no push to `origin`, no BRAT: the merge gate is `npm run check` locally; release is a local zip
- E2E (`wdio-obsidian-service`) is out of scope until M3
- `onunload` never detaches leaves
- No default hotkeys on commands
- Popout safety: view code uses `this.containerEl.doc` / `.win`, never global `document` / `window` (no DOM globals needed in M0 beyond the view's own elements)
- Formatting follows `.editorconfig`: 2 spaces, LF, final newline
- Git: work in worktree `.worktrees/feat-m0-walking-skeleton` on branch `feat/m0-walking-skeleton`; Conventional Commits; no AI attribution; squash-merge into `main` only after `npm run check` passes and the manual vault check in Task 4 succeeds

## Review Focus

1. Restored view state with missing or malformed `file` (undefined, number, `{}`, old schema): view shows "No note selected", never throws (Task 2)
2. Command with a non-markdown active file (canvas, PDF, image) or no active file: command hidden (Task 3)
3. Running the command twice for the same note, including when the existing map leaf is deferred (restored at startup, not shown yet): reveal the existing map, no second split (Task 3)
4. Paths with folders, non-ASCII, emoji and dots (`Notizen/Über Ärger 🚀.md`, `v1.2 notes.md`): display text is the basename without `.md` (Task 2)
5. Disabling the plugin: `onunload` does not detach map leaves (Task 3)

---

### Task 0: Worktree

- [ ] **Step 1: Create the worktree** (`.worktrees/` is already in `.git/info/exclude`)

```bash
cd /workspaces/obsidian-plugin-mind-mapper
git worktree add .worktrees/feat-m0-walking-skeleton -b feat/m0-walking-skeleton main
cd .worktrees/feat-m0-walking-skeleton
```

- [ ] **Step 2: Copy this plan into the worktree** (it was written in the main checkout, uncommitted) to `docs/superpowers/plans/2026-11-08-m0-walking-skeleton.md`; it is committed with Task 1.

All later commands run inside the worktree.

### Task 1: Toolchain and minimal plugin

**Files:**

- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `manifest.json`, `versions.json`, `styles.css`, `src/main.ts`, `tests/setup.ts`, `tests/mocks/obsidian.ts`
- Modify: `.gitignore` (currently empty)
- Test: `tests/main.test.ts`

**Interfaces:**

- Produces:
  - `export default class MindMapperPlugin extends Plugin` in `src/main.ts` (empty `onload` / `onunload` for now)
  - `tests/mocks/obsidian.ts`: minimal runtime stand-in for the `obsidian` module, extended by later tasks. Must export at least: `Plugin` (constructor `(app, manifest)`, `addCommand(cmd)` pushing to a public `commands: Command[]`, `registerView(type, factory)` storing into a public `viewFactories: Map<string, (leaf) => View>`), `ItemView` (constructor `(leaf)`, sets `leaf`, `app = leaf.app`, `containerEl` with `children[1] === contentEl`, default `getState()` returning `{}`, `setState()` resolving), `TFile` (public `path`, `basename`, `extension`, constructed from a path), `Notice`. Typed via the real `obsidian` types where practical.
  - `tests/setup.ts`: polyfills Obsidian's DOM helpers on `HTMLElement.prototype`: `createEl(tag, {cls?, text?})`, `createDiv({cls?, text?})`, `empty()`, `setText(text)`, plus `doc` / `win` getters returning `ownerDocument` / `defaultView`
  - npm scripts (names fixed, later milestones rely on them): `dev`, `build`, `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `format`, `format:check`, `test` (`vitest run`), `test:watch`, `check` (`format:check`, `lint`, `typecheck`, `test`, `build` in that order, stop on first failure)

- [ ] **Step 1: Write configs**
  - `package.json`: `"private": true`, `"type": "module"`, devDependencies per Global Constraints plus `@types/node`, `builtin-modules`
  - `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `target`/`lib` ES2022 + DOM, `moduleResolution: "bundler"`, `isolatedModules: true`, include `src`, `tests`, `vitest.config.ts`
  - `esbuild.config.mjs`: entry `src/main.ts`, `format: cjs`, `target: es2022`, externals `obsidian`, `electron`, all `@codemirror/*`, `@lezer/*`, Node builtins (`builtin-modules`); argument `production` → minified `main.js` in repo root, no sourcemap; no argument → watch mode with inline sourcemap (dev output path is added in Task 4)
  - `eslint.config.mjs`: flat config, typescript-eslint recommended-type-checked plus the `eslint-plugin-obsidianmd` recommended config (per its README), ignore `main.js`, `release/`, `test-vault/`, `node_modules/`
  - `.prettierrc.json`: `{ "singleQuote": true, "printWidth": 100 }`; `.prettierignore`: `main.js`, `release/`, `package-lock.json`
  - `vitest.config.ts`: `environment: 'jsdom'`, `setupFiles: ['tests/setup.ts']`, `resolve.alias: { obsidian: <abs path to tests/mocks/obsidian.ts> }`, `include: ['tests/**/*.test.ts']`
  - `manifest.json`: `{ "id": "mind-mapper", "name": "Mind Mapper", "version": "0.1.0", "minAppVersion": "1.7.2", "description": "Renders a Markdown note as a mind map.", "author": "KingOfKalk", "isDesktopOnly": true }`
  - `versions.json`: `{ "0.1.0": "1.7.2" }`
  - `styles.css`: one comment line (real rules arrive with Task 2)
  - `.gitignore`: `node_modules/`, `main.js`, `release/`, `test-vault/.obsidian/`, `*.log`

- [ ] **Step 2: Install** — `npm install`; Expected: `package-lock.json` created, no peer dependency errors.

- [ ] **Step 3: Write the failing test** `tests/main.test.ts`

```ts
import MindMapperPlugin from '../src/main';

test('plugin loads and unloads without error', async () => {
  const plugin = new MindMapperPlugin(fakeApp(), fakeManifest());
  await plugin.onload();
  plugin.onunload();
});
```

`fakeApp()` / `fakeManifest()` live in `tests/helpers.ts` (returns plain objects cast to `App` / `PluginManifest`; `fakeApp().workspace` is a stub object later tasks extend).

- [ ] **Step 4: Run** `npm test` — Expected: FAIL, `src/main` not found.

- [ ] **Step 5: Implement** `src/main.ts` with `MindMapperPlugin extends Plugin`, empty `onload` / `onunload`.

- [ ] **Step 6: Run** `npm run check` — Expected: all five stages pass, `main.js` exists in the repo root.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "build: set up toolchain and minimal plugin"
```

### Task 2: Mind map view with persisted state

**Files:**

- Create: `src/constants.ts`, `src/view/viewState.ts`, `src/view/MindMapView.ts`
- Modify: `styles.css`, `tests/mocks/obsidian.ts` (as needed)
- Test: `tests/view/viewState.test.ts`, `tests/view/MindMapView.test.ts`

**Interfaces:**

- Consumes: mock `ItemView`, `tests/setup.ts` DOM helpers
- Produces:
  - `src/constants.ts`: `export const VIEW_TYPE_MIND_MAP = 'mind-mapper-view';` `export const VIEW_ICON = 'network';`
  - `src/view/viewState.ts`:
    - `export interface MindMapViewState { file: string | null }`
    - `export function parseViewState(state: unknown): MindMapViewState` — `file` is kept only if it is a non-empty string, else `null`
    - `export function fileBasename(path: string): string` — last path segment, trailing `.md` removed (only that extension)
  - `src/view/MindMapView.ts`: `export class MindMapView extends ItemView` with
    - `getViewType(): string` → `VIEW_TYPE_MIND_MAP`
    - `getIcon(): string` → `VIEW_ICON`
    - `getDisplayText(): string` → `fileBasename(file)` or `'Mind map'` when `file === null`
    - `getState(): Record<string, unknown>` → `{ ...super.getState(), file }`
    - `setState(state: unknown, result: ViewStateResult): Promise<void>` → parse, store, re-render placeholder, `await super.setState(state, result)`
    - `get file(): string | null`
    - Placeholder: `contentEl` emptied, then one `div.mind-mapper-placeholder` with text `Mind map: <file path>` or `No note selected`

- [ ] **Step 1: Write failing tests** `tests/view/viewState.test.ts`

```ts
test.each([
  [{ file: 'a/b.md' }, { file: 'a/b.md' }],
  [{ file: '' }, { file: null }],
  [{ file: 42 }, { file: null }],
  [{}, { file: null }],
  [undefined, { file: null }],
  [null, { file: null }],
  ['a/b.md', { file: null }],
])('parseViewState(%j) -> %j', (input, expected) => {
  expect(parseViewState(input)).toEqual(expected);
});

test.each([
  ['Note.md', 'Note'],
  ['Notizen/Über Ärger 🚀.md', 'Über Ärger 🚀'],
  ['v1.2 notes.md', 'v1.2 notes'],
  ['a/b/c.md', 'c'],
])('fileBasename(%s) -> %s', (path, expected) => {
  expect(fileBasename(path)).toBe(expected);
});
```

- [ ] **Step 2: Write failing tests** `tests/view/MindMapView.test.ts`
  - `'new view has no file, title "Mind map", placeholder "No note selected"'`
  - `'setState({file}) round-trips through getState and sets title'`: after `setState({ file: 'Notizen/Über Ärger 🚀.md' }, { history: false })`, `getState().file === 'Notizen/Über Ärger 🚀.md'`, `getDisplayText() === 'Über Ärger 🚀'`, placeholder text `'Mind map: Notizen/Über Ärger 🚀.md'`
  - `'setState with malformed state falls back to no file'`: `setState({ file: 42 }, …)` resolves, `file === null`, placeholder `No note selected`
  - `'getViewType and getIcon'`: `'mind-mapper-view'`, `'network'`

- [ ] **Step 3: Run** `npm test` — Expected: FAIL, modules not found.

- [ ] **Step 4: Implement** `src/constants.ts`, `src/view/viewState.ts`, `src/view/MindMapView.ts`; add `.mind-mapper-placeholder` rule to `styles.css` using Obsidian CSS variables only (`color: var(--text-muted); padding: var(--size-4-4);`).

- [ ] **Step 5: Run** `npm run check` — Expected: PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat: add mind map view with persisted file state"`

### Task 3: "Open as mind map" command

**Files:**

- Create: `src/commands/openMindMap.ts`
- Modify: `src/main.ts`, `tests/mocks/obsidian.ts`, `tests/helpers.ts`
- Test: `tests/commands/openMindMap.test.ts`, `tests/main.test.ts`

**Interfaces:**

- Consumes: `VIEW_TYPE_MIND_MAP`, `MindMapView`, `parseViewState`
- Produces:
  - `src/commands/openMindMap.ts`:
    - `export function isMindMapSource(file: TFile | null): file is TFile` — `true` only for `extension === 'md'`
    - `export function findMindMapLeaf(workspace: Workspace, path: string): WorkspaceLeaf | null` — searches `getLeavesOfType(VIEW_TYPE_MIND_MAP)` by `parseViewState(leaf.getViewState().state).file === path` (works for deferred leaves, whose `view` is not a `MindMapView`)
    - `export async function openMindMap(workspace: Workspace, file: TFile): Promise<WorkspaceLeaf>` — existing leaf → `await workspace.revealLeaf(leaf)`; else `workspace.getLeaf('split', 'vertical')`, `await leaf.setViewState({ type: VIEW_TYPE_MIND_MAP, active: true, state: { file: file.path } })`, `await workspace.revealLeaf(leaf)`
  - Command id `open-as-mind-map`, name `Open as mind map`, `checkCallback` using `workspace.getActiveFile()` and `isMindMapSource`; no `hotkeys`
  - `onload` registers the view: `this.registerView(VIEW_TYPE_MIND_MAP, (leaf) => new MindMapView(leaf))`

- [ ] **Step 1: Write failing tests** `tests/commands/openMindMap.test.ts` (fake `Workspace` in `tests/helpers.ts` records `getLeaf` / `revealLeaf` calls; fake leaves hold a `ViewState`)
  - `isMindMapSource`: `true` for `Note.md`; `false` for `Board.canvas`, `Doc.pdf`, `img.png`, and `null`
  - `'opens a new vertical split with the file state'`: `getLeaf` called with `('split', 'vertical')`, `setViewState` called with `{ type: 'mind-mapper-view', active: true, state: { file: 'a/Note.md' } }`, `revealLeaf` called with that leaf
  - `'reveals an existing map for the same file instead of splitting'`: workspace already has a leaf with view state `{ type: 'mind-mapper-view', state: { file: 'a/Note.md' } }` and `view` not a `MindMapView` (deferred); `getLeaf` not called, `revealLeaf` called with the existing leaf
  - `'map for a different file does not count'`: existing leaf for `b/Other.md`; a new split is opened

- [ ] **Step 2: Extend** `tests/main.test.ts`
  - `'registers the mind map view'`: `plugin.viewFactories.has('mind-mapper-view')`, factory returns a `MindMapView`
  - `'command is hidden without a markdown file'`: `checkCallback(true)` returns `false` for active file `null` and `Board.canvas`
  - `'command is available for markdown and opens the map'`: `checkCallback(true) === true` for `Note.md`; `checkCallback(false)` leads to `setViewState` on a new split leaf
  - `'command has no default hotkeys'`: `command.hotkeys` is `undefined`
  - `'onunload does not detach leaves'`: `workspace.detachLeavesOfType` spy not called

- [ ] **Step 3: Run** `npm test` — Expected: FAIL.

- [ ] **Step 4: Implement** `src/commands/openMindMap.ts` and wire `src/main.ts`. In `checkCallback(false)`, call `void openMindMap(...)` and catch errors with `console.error` (eslint `no-floating-promises`).

- [ ] **Step 5: Run** `npm run check` — Expected: PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat: add open as mind map command"`

### Task 4: Dev loop, test vault and local release

**Files:**

- Create: `test-vault/Worked example.md`, `test-vault/Notizen/Über Ärger 🚀.md`, `test-vault/Board.canvas`, `scripts/release.mjs`, `scripts/version-bump.mjs`
- Modify: `esbuild.config.mjs`, `package.json`, `README.md`
- Test: `tests/scripts/version-bump.test.ts`

**Interfaces:**

- Produces:
  - Dev build output dir `test-vault/.obsidian/plugins/mind-mapper/` containing `main.js`, `manifest.json`, `styles.css`, `.hotreload` (empty file, triggers the Hot Reload plugin)
  - `scripts/version-bump.mjs`: `export function bumpVersion(manifest, versions, newVersion)` returns `{ manifest, versions }` with `manifest.version = newVersion` and `versions[newVersion] = manifest.minAppVersion`; when run as script (npm `version` lifecycle), reads `process.env.npm_package_version`, rewrites `manifest.json` and `versions.json` (2-space JSON, final newline), `git add`s them
  - npm scripts: `version` → `node scripts/version-bump.mjs`; `release` → `npm run check && node scripts/release.mjs`
  - `scripts/release.mjs`: `release/mind-mapper-<version>.zip` with `main.js`, `manifest.json`, `styles.css` at the zip root (`zip -j`); fails if the manifest version and `package.json` version differ

- [ ] **Step 1: Write failing test** `tests/scripts/version-bump.test.ts`
  - `'bumpVersion sets manifest version and maps it to minAppVersion'`: `bumpVersion({ version: '0.1.0', minAppVersion: '1.7.2' }, { '0.1.0': '1.7.2' }, '0.2.0')` → manifest `version: '0.2.0'`, versions `{ '0.1.0': '1.7.2', '0.2.0': '1.7.2' }`
  - `'bumpVersion does not mutate inputs'`

- [ ] **Step 2: Run** `npm test` — Expected: FAIL. Then implement `scripts/version-bump.mjs`; run again — Expected: PASS. Add `scripts/` to `tsconfig` `include` with `allowJs` + `checkJs` so the typecheck covers it.

- [ ] **Step 3: Dev output** — `esbuild.config.mjs` dev mode writes `main.js` to the dev output dir and, on start, copies `manifest.json` and `styles.css` there and creates `.hotreload`; a `styles.css` change is copied on each rebuild (esbuild `onEnd` plugin).

- [ ] **Step 4: Test vault notes**
  - `Worked example.md`: the note from the spec's "Worked example" section, verbatim
  - `Notizen/Über Ärger 🚀.md`: `# Überblick` with two `##` headings in Greek and with an emoji
  - `Board.canvas`: `{"nodes":[],"edges":[]}` (to check the command is hidden)

- [ ] **Step 5: README** — add "Development" section: `npm install`, `npm run dev`, open `test-vault/` as a vault in Obsidian on the host, enable community plugins, install Hot Reload (https://github.com/pjeby/hot-reload) into the test vault once, enable Mind Mapper; `npm run check` as merge gate; `npm version <patch|minor>` then `npm run release`; command list: "Open as mind map" (no default hotkey).

- [ ] **Step 6: Verify** — `npm run check` PASS; `npm run dev` creates the four files in the dev output dir; `npm run release` creates `release/mind-mapper-0.1.0.zip`; `unzip -l` on it lists exactly `main.js`, `manifest.json`, `styles.css`.

- [ ] **Step 7: Manual check in Obsidian (user)** — in `test-vault`:
  1. Command palette on `Worked example.md` shows "Open as mind map"; it opens a split with title "Worked example" and placeholder `Mind map: Worked example.md`
  2. Running it again reveals the same split, no second one
  3. With `Board.canvas` active the command is not listed
  4. Restart Obsidian: the map tab is restored with the same title
  5. Disable the plugin: the map leaf is not closed by the plugin

- [ ] **Step 8: Commit** — `git commit -m "build: add dev loop, test vault and local release"`

### Task 5: Merge

- [ ] **Step 1:** `npm run check` in the worktree — Expected: PASS
- [ ] **Step 2:** Squash-merge only after the user confirms the manual check and explicitly approves the commit on `main` (the global rule forbids commits on `main`; the project's squash-merge rule is the only exception):

```bash
cd /workspaces/obsidian-plugin-mind-mapper
git merge --squash feat/m0-walking-skeleton
git commit -m "feat: M0 walking skeleton"
git worktree remove .worktrees/feat-m0-walking-skeleton
git branch -D feat/m0-walking-skeleton
```
