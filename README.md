# Obsidian Mind Mapper

Obsidian plugin that renders a Markdown note as a mind map.

- Spec: [docs/mvp.md](docs/mvp.md)
- License: [GPL-3.0](LICENSE)

## Commands

No command has a default hotkey (Obsidian plugin guidelines); assign your own in Settings > Hotkeys. Avoid `Ctrl/Cmd + =`, `Ctrl/Cmd + -` and `Ctrl/Cmd + 0`: Obsidian uses them to zoom the whole app.

| Command | Available | Suggested hotkey |
|---|---|---|
| Open as mind map | a markdown note is active | |
| Zoom in | a mind map is active | `Ctrl/Cmd + Shift + =` |
| Zoom out | a mind map is active | `Ctrl/Cmd + Shift + -` |
| Fit to view | a mind map is active | `Shift + 1` |
| Reset zoom to 100% | a mind map is active | `Shift + 0` |

## Map navigation

- Mouse wheel / two-finger scroll: pan
- `Ctrl/Cmd` + wheel, trackpad pinch: zoom at the pointer
- Drag on empty canvas: pan
- Floating controls (bottom center): zoom out, current zoom (click resets to 100%), zoom in, fit to view

## Development

- Requirements: Node.js and npm (the devcontainer has both)
- `npm install`
- Vaults
  - `test-vault/`: versioned test notes (source, tracked in git)
  - `dev-vault/` in the main checkout: the one vault you open in Obsidian, ignored by git, shared by all worktrees
- `npm run dev` (from the main checkout or any worktree): watch build into `dev-vault/.obsidian/plugins/mind-mapper/` (also copies `manifest.json`, `styles.css`, writes `.hotreload`)
  - On start it copies the current checkout's `test-vault/` notes into `dev-vault/` and enables Mind Mapper there; notes of the same name are overwritten (edit test notes in `test-vault/`, not in `dev-vault/`), nothing is deleted, recordings (`*.cache.json`) are never overwritten
  - `MIND_MAPPER_PLUGIN_DIR=<vault>/.obsidian/plugins/mind-mapper npm run dev` targets another vault instead (plugin files only, no notes copied)
- One-time setup on the host: open `dev-vault/` of the main checkout as a vault in Obsidian, turn on community plugins; optionally install [Hot Reload](https://github.com/pjeby/hot-reload) into it
- Parser fixtures: notes in `test-vault/fixtures/`; in Obsidian run "Record parser fixtures (dev)", then `npm run fixtures:pull` copies the recorded `*.cache.json` into `test-vault/fixtures/`; commit them
- `npm run check`: format check, lint, typecheck, unit tests, production build; must pass before merging into `main`
- `npm test` / `npm run test:watch`: unit tests (Vitest, `obsidian` is mocked in `tests/mocks/obsidian.ts`)

## Release (local)

- `npm version <patch|minor|major>`: bumps `package.json`, syncs `manifest.json` and `versions.json`, commits and tags
- `npm run release`: runs `npm run check`, then writes `release/mind-mapper-<version>.zip` with `main.js`, `manifest.json`, `styles.css`
