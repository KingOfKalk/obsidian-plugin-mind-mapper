# M7 Release Prep (local) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything for a community submission that can be done locally, verified. No push, no GitHub release, no submission.

**Architecture:** Release tooling fixes (tag format, commit message, asset folder), a verified `minAppVersion`, a README written for users with headless-generated screenshots, and a final manifest description.

**Tech Stack:** Node scripts, npm, WebdriverIO + wdio-obsidian-service.

**Spec:**
- [docs/mvp.md](../../mvp.md): M7.
- Roadmap: [2026-11-08-roadmap-m3-m7.md](2026-11-08-roadmap-m3-m7.md), section M7.

## Findings (research done before the plan)

- **Name check** (official `community-plugins.json`, 10,132 plugins, fetched 2026-11-08):
  - No plugin has the id `mind-mapper` or the name "Mind Mapper".
  - About 50 mind map plugins exist. The closest names are "Mind Map" (`obsidian-mind-map`), "Mindmap" (`mindmap`) and "Markdown Mindmap".
- **Submission rules** (obsidian-developer-docs, `Community directory/Submission requirements for plugins.md`, `Reference/Manifest.md`, `Plugins/Releasing/Submit your plugin.md`):
  - id: lowercase letters and hyphens only, must not end with `plugin`, must not contain `obsidian`, unique.
  - name: unique, no "Obsidian", no "Plugin".
  - description: ≤ 250 characters, ends with `.`, an action statement, no emoji, correct capitalization ("Markdown").
  - `minAppVersion`: the minimum version the plugin works with.
  - `fundingUrl`: only for donations, else absent.
  - Command IDs must not include the plugin id.
  - Required files: `README.md`, `LICENSE`, `manifest.json` in the repository root.
  - The release tag must equal the manifest `version` (`x.y.z`, no `v` prefix). Release assets: `main.js`, `manifest.json`, `styles.css`.
- **`minAppVersion` from `@since` tags:** 1.7.2. The highest are `Workspace.revealLeaf` returning a Promise and `WorkspaceLeaf.isDeferred`, both 1.7.2. The current manifest already says 1.7.2. `Plugin.settings` (1.13.0) is used as a type only.

## Global Constraints

- No push, no release, no submission (project CLAUDE.md: "Do not push to `origin` for now").
- The version stays `0.1.0`: the user decides the release version. The tooling makes `npm version <x.y.z>` produce a correct tag and commit.

## Review Focus

1. `npm version 1.0.0` produces the tag `1.0.0` (no `v`), a Conventional Commit message, and `manifest.json` / `versions.json` in sync. Test in Task 1 (dry run in a temp clone).
2. `npm run release` on a machine without `zip` still produces the three assets. Test in Task 1.
3. The plugin loads and works on the declared `minAppVersion` (1.7.2), not only on 1.15.0. Test in Task 2.
4. A failure to open a map shows a notice instead of failing silently (M0 minor). Test in Task 1.
5. README images render on the community listing (relative paths, committed files). Covered in Task 3.

---

### Task 1: Release tooling and open-failure notice

**Files:**
- Create: `.npmrc`
- Modify: `scripts/release.mjs`, `src/main.ts`
- Test: `tests/scripts/release.test.ts` (or the existing scripts test file), `tests/main.test.ts`

**Behaviour:**
- **`.npmrc`:** `tag-version-prefix=""` and `message="chore: release %s"`.
- **`release.mjs`:**
  - Copies `main.js`, `manifest.json` and `styles.css` into `release/<version>/`, the files to upload as release assets.
  - Also writes `release/mind-mapper-<version>.zip` when `zip` is available; otherwise it prints a note. Exports a testable function `releaseAssets(version, exists, copy)` or similar.
- **Open failure:** `MindMapperPlugin.open` catch shows `Notice` "Mind Mapper: could not open the mind map".

- [ ] **Step 1: Write failing tests:**
  - release asset folder contains the three files;
  - zip is skipped without a `zip` binary;
  - open failure shows the notice.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS. Then dry-run `npm version 1.0.0` in a temporary clone and check the tag name and commit message (Review Focus 1). Do not keep the version change.
- [ ] **Step 5: Commit** `chore: release tooling: tag without prefix, asset folder, open failure notice`.

### Task 2: Verify `minAppVersion` 1.7.2

**Files:**
- Modify: `wdio.conf.mts` (`OBSIDIAN_VERSION` / `OBSIDIAN_INSTALLER` environment overrides; default 1.15.0), `README.md` (development section)

- [ ] **Step 1:** Run `OBSIDIAN_VERSION=1.7.2 OBSIDIAN_INSTALLER=earliest npm run test:e2e`.
- [ ] **Step 2:** If tests fail because of the app version, either fix the plugin (preferred, with a unit test where possible) or raise `minAppVersion` to the oldest version that passes. Ledger the evidence either way.
- [ ] **Step 3: Commit** `test: e2e against the minimum app version`.

### Task 3: README for users, screenshots, description

**Files:**
- Create: `e2e/readmeImages.e2e.ts` (script `readme:images`), `docs/images/*.png`, `test-vault/demo/Trip planning.md` (demo note)
- Modify: `README.md`, `manifest.json` (description), `package.json` (script)

**README structure:**
1. One-line pitch and hero screenshot.
2. Features.
3. How a note becomes a map: mapping rules, short.
4. Opening a map.
5. Navigation.
6. Commands with suggested hotkeys.
7. Layouts.
8. Frontmatter.
9. Settings.
10. Large notes.
11. Known limits:
    - desktop only;
    - the map is read-only;
    - embeds are shown as links;
    - cross-links only within the same note;
    - lines are not routed around nodes.
12. Installation (manual from release assets; community directory once published).
13. Development.

**Images** (light theme, 1024 × 800, full-screen map):
- `docs/images/circle.png`: demo note, `circle-clockwise`;
- `docs/images/content.png`: blocks note;
- `docs/images/crosslinks.png`

**Description:** "Show any Markdown note as a live mind map: headings, lists and blocks become nodes rendered like reading view." Check the ≤ 250 characters / period / capitalization rules in a unit test against `manifest.json`.

- [ ] **Step 1: Write the failing test** `manifest follows the community submission rules` (id pattern, name words, description length and period, `minAppVersion` equals `versions.json[version]`).
- [ ] **Step 2: Run, update `manifest.json`, run again.** Expected: PASS.
- [ ] **Step 3: Generate images** (`npm run readme:images`), look at them, write the README.
- [ ] **Step 4: Run** `npm run check` and `npm run release` (assets built; inspect `release/0.1.0/`; `release/` is gitignored).
- [ ] **Step 5: Commit** `docs: README for users with screenshots; manifest description`.
