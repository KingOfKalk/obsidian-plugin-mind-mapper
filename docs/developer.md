# Developer guide

## Development

- Requirements: Node.js and npm (the devcontainer has both)
- `npm install`
- Vaults
  - `tests/vault/`: versioned test notes (source, tracked in git)
  - `sandbox-vault/` in the main checkout: the one vault you open in Obsidian, ignored by git, shared by all worktrees
    - Renamed from `dev-vault/`: if you opened the old folder in Obsidian, reopen the vault once via "Open folder as vault"
- `npm run dev` (from the main checkout or any worktree): watch build into `sandbox-vault/.obsidian/plugins/mind-mapper/` (also copies `manifest.json`, `styles.css`, writes `.hotreload`)
  - On start it copies the current checkout's `tests/vault/` notes into `sandbox-vault/` and enables Mind Mapper there; notes of the same name are overwritten (edit test notes in `tests/vault/`, not in `sandbox-vault/`), recordings (`*.cache.json`) are never overwritten
  - It also copies the docs so you can read them (and open them as mind maps) in Obsidian: `docs/user-manual.md` becomes `Docs/User manual.md`, `docs/developer.md` becomes `Docs/Developer guide.md`, and `docs/images/` becomes `Docs/images/` (so the manual's relative image links work). Other docs (`mvp.md`, `going-public.md`, `superpowers/`) are not copied. Edit the docs in `docs/`, not in `sandbox-vault/`; links that leave `docs/` (e.g. `../README.md`) do not resolve inside the vault
  - Pruning: test notes and docs share one sync (`syncFiles` in `scripts/sandbox-vault.mjs`, fed by `notesMappings` and `docsMappings`) and one manifest. Each sync writes the copied paths to `sandbox-vault/.mind-mapper-sync.json` (a dot file in the vault root, which Obsidian does not index). The next sync deletes the files listed there that `tests/vault/` or the docs no longer have, then the folders they leave empty. Notes you create in `sandbox-vault/` are in no manifest and are never deleted; `.obsidian/` and recordings are never touched; without a manifest (first run) nothing is deleted
  - `MIND_MAPPER_PLUGIN_DIR=<vault>/.obsidian/plugins/mind-mapper npm run dev` targets another vault instead (plugin files only, no notes copied)
- `npm run dev:build`: the same dev build and note sync once, then exits (no watch)
- One-time setup on the host: open `sandbox-vault/` of the main checkout as a vault in Obsidian, turn on community plugins; optionally install [Hot Reload](https://github.com/pjeby/hot-reload) into it
- README images: `npm run readme:images` (headless, writes `docs/images/`)
- User manual images: `npm run manual:images` (headless, writes `docs/images/manual/`)
- E2E against another Obsidian version: `OBSIDIAN_VERSION=<version> OBSIDIAN_INSTALLER=<version|earliest|latest> npm run test:e2e` (default 1.15.0, the minimum supported version)
- Parser fixtures: notes in `tests/vault/fixtures/`, recordings of Obsidian's metadata cache next to them (`*.cache.json`)
  - Headless (preferred): `npm run fixtures:record` records all of them in real Obsidian; commit them
  - Manual: in Obsidian run "Record parser fixtures (dev)", then `npm run fixtures:pull`
- `npm run check`: format check, lint, typecheck, unit tests, production build
- `npm test` / `npm run test:watch`: unit tests (Vitest, `obsidian` is mocked in `tests/mocks/obsidian.ts`)
- `npm run test:e2e`: end-to-end tests in real, headless Obsidian (`e2e/specs/`)
  - Uses [wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service), which downloads Obsidian into `.obsidian-cache/` and opens a temp copy of `tests/vault/`
  - Needs Xvfb and Electron libraries: `scripts/install-e2e-deps.sh` (run automatically when the devcontainer is created)
- `npm run perf:e2e`: performance spike on generated 1,000 and 5,000 node notes in headless Obsidian
  - Prints time to first layout, time until the layout settles, re-layout count and the longest frame while panning; writes `e2e/perf/last-run.json`
  - No timing assertions; compare against `e2e/perf/baseline.json` by hand
- Merge gate: `npm run check` and `npm run test:e2e` pass

## Release

- Automated with [release-please](https://github.com/googleapis/release-please) (`.github/workflows/release.yml`); there is no local release command
  - Config: `release-please-config.json` (release type `node`, also bumps `manifest.json` `version`), current version: `.release-please-manifest.json`
  - Every push to `main` updates the release PR ("chore(main): release x.y.z"): version from the Conventional Commits since the last release (`fix` = patch, `feat` = minor, `!`/`BREAKING CHANGE` = major), `CHANGELOG.md`, `package.json`, `package-lock.json`, `manifest.json`
  - A second job adds `"<version>": "<minAppVersion>"` to `versions.json` on the release PR branch (commit `chore: add <version> to versions.json`)
  - Merging the release PR creates the tag and the GitHub release `x.y.z` (no `v` prefix: Obsidian needs the tag to equal the manifest version), builds, and uploads `main.js`, `manifest.json`, `styles.css`, `versions.json` and `mind-mapper-x.y.z.zip` (folder `mind-mapper/` with the three plugin files)
  - Force a version: a commit on `main` with the footer `Release-As: x.y.z`
  - Commit messages on `main` (squash-merge titles) are the changelog: keep them Conventional Commits
- CI (`.github/workflows/`)
  - `ci.yml` on pushes to and pull requests into `main`: job `check` (`npm run check`, uploads the plugin files as artifact `mind-mapper-<sha>`) and job `e2e` (`scripts/install-e2e-deps.sh`, then `npm run test:e2e`; `.obsidian-cache` cached by the Obsidian version in `wdio.conf.mts`)
  - `codeql.yml`: CodeQL (security-and-quality) on push, pull request and weekly
  - `.github/dependabot.yml`: weekly npm and GitHub Actions updates, grouped; `dependabot-auto-merge.yml` approves and auto-merges minor and patch updates of dev dependencies and actions
  - `notify-failure.yml`: opens (or comments on) an issue labelled `workflow-failure` when CI or Release fails on `main`
  - Node.js version: `engines.node` in `package.json` (shared setup in `.github/actions/setup/action.yml`)
- Community submission: the manifest follows the directory rules (checked in `tests/manifest.test.ts`); the id `mind-mapper` and the name "Mind Mapper" were not taken on 2026-11-08

## Testing strategy

- Unit tests (`npm test`, `npm run test:watch`)
  - Vitest with jsdom (`vitest.config.ts`); files in `tests/**/*.test.ts`
  - `obsidian` is aliased to the hand-written mock `tests/mocks/obsidian.ts`; `tests/setup.ts` polyfills Obsidian's DOM helpers (`createEl` etc.)
  - Cover parser, layout (pure), renderer and controls, commands, settings, manifest, and the dev scripts (`tests/scripts/`)
- Recorded parser fixtures
  - Notes in `tests/vault/fixtures/*.md`; next to each one `*.cache.json` = `{ obsidianVersion, text, cache }`, the metadata cache as real Obsidian produced it
  - `tests/parser/fixtures.test.ts` builds trees from these without Obsidian
  - Re-record (after adding or changing a fixture note, or when Obsidian changes its cache): `npm run fixtures:record` (headless, all fixtures), then commit the `*.cache.json` files
  - Manual alternative: dev command "Record parser fixtures (dev)" in Obsidian, then `npm run fixtures:pull`
- View integration tests
  - `tests/view/` (`MindMapView`, collapse state, frontmatter, full screen, link targets) run in the same Vitest setup with the mock; part of `npm test`
- E2E (`npm run test:e2e`)
  - Real headless Obsidian via wdio-obsidian-service, WebdriverIO + Mocha; specs in `e2e/specs/*.e2e.ts`
  - Opens a temp copy of `tests/vault/` with this checkout as plugin (`plugins: ['.']`); builds first (`npm run build`)
  - Not part of `npm run check`: run it before every merge
- Performance benchmark (`npm run perf:e2e`)
  - Generated notes with 1,000 and 5,000 nodes (`e2e/perf/generateNote.ts`)
  - No timing assertions (frame times are flaky); it prints a diff against the committed `e2e/perf/baseline.json` and writes `e2e/perf/last-run.json` (git-ignored)
  - Update `baseline.json` by hand only when a change is meant to move the numbers
- Screenshot runs (`npm run screenshots:e2e`, `npm run readme:images`, `npm run manual:images`): see below

## Screenshots

- Visual check (`npm run screenshots:e2e`)
  - Runs `e2e/screenshots.e2e.ts` in headless Obsidian; not part of `test:e2e`
  - Writes PNGs to `e2e/screenshots/` (git-ignored); `SCREENSHOT_DIR=<dir>` overrides the directory
  - Run it for every UI change, then open the PNGs and look at them: tests have missed visual bugs (checkboxes, code, diagrams)
  - Look for: clipped or overlapping nodes, wrong fades, missing content (code, Mermaid, math, tables, callouts), edges not attached to nodes, dashed link lines and dividers, layout direction and balance, controls and collapse buttons
- Loud palette (same run, `loud-*.png`)
  - Obsidian's real colours are subtle, so a colour on the wrong element is hard to see; the spec injects `<style id="loud-palette">` (body variables, `!important`) around the loud shots and removes it afterwards; test-only, not shipped
  - Shots: `loud-rainbow-deep` (8 levels, selected node), `loud-{rainbow,none}-branches` (9 branches with blocks at level 3), `loud-rainbow-tour` and `-tour-window` (collapsed branch with badge, cross-links, divider; full screen and in the window), `loud-rainbow-clipped` (expand button), `loud-{none,accent,ocean,forest}-tour`, `loud-none-full-screen`
  - Legend (variable: loud colour; used by):
    - `--color-red`: magenta; rainbow branch 1 and 8
    - `--color-orange`: lime; rainbow branch 2 and 9, forest branch 3
    - `--color-yellow`: blue; rainbow branch 3, forest branch 2
    - `--color-green`: yellow; rainbow branch 4, ocean branch 3, forest branch 1
    - `--color-cyan`: black; rainbow branch 5, ocean branch 2
    - `--color-blue`: red; rainbow branch 6, ocean branch 1
    - `--color-purple`: cyan; rainbow branch 7, ocean branch 4
    - Branch colours: level 1 fill 50 %, level 2 tint 18 % (mixed into `--background-primary`), lines and block borders 100 %
    - `--color-pink`: orange; unused by the plugin
    - `--interactive-accent` (and `--color-accent`): violet; selection ring, cross-links, collapsed badge, accent theme
    - `--text-on-accent`: gold; count in the collapsed badge
    - `--text-faint`: sky blue; theme none: lines, level 1 fill and level 2 tint
    - `--hr-color`: teal; dividers
    - `--background-modifier-border`: brown; block border with theme none, collapse button and controls border, skeleton stroke
    - `--background-primary`: pale yellow; canvas, fill and tint base, blocks, expand button on plain nodes, buttons, controls
    - `--background-secondary`: pale pink; skeleton rects (below 20 % zoom)
    - `--text-normal`: dark purple; node text
    - `--text-muted`: dark green; title chip, collapse button text, controls, expand button
    - `--text-error`: raspberry; render-error node border
  - Anything that Obsidian styles itself (checkboxes, links, table borders, list markers, code background) also takes the loud colours; ignore those
- README images (`npm run readme:images`)
  - Runs `e2e/readmeImages.e2e.ts`; writes the committed image `docs/images/hero.png` (800 x 600 px window with the file explorer and the map of `tests/vault/demo/Feature tour.md`)
  - Window resized through Electron (WebDriver window commands do not work in Obsidian), one branch collapsed, fit to view, window buttons hidden; re-run, look at it and commit when the look changes
  - `tests/vault/Welcome.md` is the first note to open in the sandbox vault (how to open a map, where the notes are, frontmatter keys)
  - Demo notes in `tests/vault/demo/`: `Simple note.md` (a small everyday note) and `Feature tour.md` (nearly every feature of the map)
- User manual images (`npm run manual:images`)
  - Runs `e2e/manualImages.e2e.ts`; writes the committed images in `docs/images/manual/`, used by `docs/user-manual.md`
  - One topic per image, cropped by the window size (Electron `setContentSize`), not by image editing; sidebars closed, window buttons and status bar hidden
  - Uses `tests/vault/demo/` notes plus small notes written by the spec into the temporary vault (`Trip to Lisbon.md`, `Reading notes.md`, `Team offsite.md`)
  - Not part of `test:e2e` (`wdio.conf.mts` only runs `e2e/specs/`); re-run, look at every image and commit when the look changes

## Devcontainer and headless Obsidian

- `.devcontainer/devcontainer.json`
  - Image `mcr.microsoft.com/devcontainers/typescript-node` (Node.js, npm, git)
  - Features: Claude Code, home persistence for `~/.claude` and `~/.claude.json`
  - VS Code: EditorConfig, Prettier, Markdown All in One; format on save
  - `postCreateCommand`: `bash scripts/install-e2e-deps.sh`
- `scripts/install-e2e-deps.sh` installs (idempotent, uses `sudo apt-get`)
  - Xvfb and xauth: virtual display; the npm scripts run `xvfb-run -a wdio run ./wdio.conf.mts`
  - Electron runtime libraries: `libnss3`, `libgtk-3-0t64`, `libgbm1`, `libasound2t64`, `libxss1`, `libxtst6`, `libsecret-1-0`, `libdrm2`, `libxkbcommon0`, `libatk-bridge2.0-0t64`, `libcups2t64`
  - Outside the devcontainer, install the same packages yourself (Debian/Ubuntu names)
- `wdio.conf.mts`
  - Obsidian 1.15.0 is pinned (the minimum supported version): `browserVersion` and `installerVersion`
  - `OBSIDIAN_VERSION` and `OBSIDIAN_INSTALLER` override them, e.g. to run the suite against another version
  - Vault `tests/vault`, plugin `.` (the checkout), `maxInstances: 1`, Mocha timeout 120 s
- Obsidian download cache `.obsidian-cache/` (git-ignored)
  - Holds the Obsidian installer, app and chromedriver; the first E2E run downloads them (GitHub sometimes answers with 504: retry)
  - The installer is the AppImage for the host architecture, extracted; on ARM64 hosts (e.g. Apple silicon in Docker) that is the arm64 AppImage
  - Every git worktree has its own `.obsidian-cache/`: symlink it to the main checkout's to avoid a second download: `ln -s <main-checkout>/.obsidian-cache .obsidian-cache`
- Sandbox vault flow
  - `npm run dev` (watch) or `npm run dev:build` (once) always build into `sandbox-vault/` of the main checkout, from any worktree (`scripts/dev-paths.mjs` resolves it via the git common dir)
  - `MIND_MAPPER_PLUGIN_DIR=<vault>/.obsidian/plugins/mind-mapper` targets another vault's plugin folder; then no notes are synced
  - After every merge run `npm run dev:build` so `sandbox-vault/` has the merged build
