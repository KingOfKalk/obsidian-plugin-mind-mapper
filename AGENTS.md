# AGENTS

## Project

- Obsidian plugin "Mind Mapper" (TypeScript): shows any Markdown note as a live mind map.
- Desktop only, read-only map, follows the note while you write.
- Spec: [docs/mvp.md](docs/mvp.md) (binding). User docs: [README.md](README.md).

## Rules

- This is an MVP.
- Work via issues and pull requests: open or claim an issue, branch `<type>/<issue-number>-<slug>` in a worktree, open a PR. The owner merges; PRs are squash-merged and only things that are tested and working.
- This environment is a devcontainer, set up for development of TypeScript projects.
- TDD: write the failing test first, see it fail for the right reason, then implement.
- All gates before opening a PR: `npm run check`, `npm run test:e2e`, and for UI changes `npm run screenshots:e2e` plus a look at the PNGs.
- Agents push their branch to `origin` and open a PR with `gh pr create`: Conventional Commit title, PR template filled in (`Closes #<issue>`, summary, test plan).
- Visible changes get screenshots in the PR (before/after table) and bug issues get a screenshot of the problem, via the `screenshots` branch: [CONTRIBUTING.md](CONTRIBUTING.md) (Screenshots in issues and pull requests).
- Never push to `main` directly. Never force-push. Never commit on `main`. Never merge a PR (the owner does).
- After a merge, run `npm run dev:build` in the main checkout to update the sandbox vault.
- No AI attribution in commits, branch names, issues or PRs.
- MVP scope: YAGNI. Do not add features the spec does not list.
- Obsidian plugin guidelines:
  - No default hotkeys for commands.
  - Popout-safe DOM: use `el.doc` / `el.win` / `instanceOf` instead of `document` / `window` / `instanceof`.
- Code, comments and commit messages in English.
- Format with Prettier (`npx prettier --write <files>`); `*.md` files are ignored by Prettier.

## Workflow

- Git workflow (issues, branches, worktrees, commits, pull requests, releases): [CONTRIBUTING.md](CONTRIBUTING.md).
- Testing, screenshots, devcontainer, sandbox vault: [docs/developer.md](docs/developer.md).
- Anything that only matters once the repo is public (issue links, CI, submission, doc changes): add it to [docs/going-public.md](docs/going-public.md) instead of doing it now.

## Commands

- `npm run check`: format check, lint, typecheck, unit tests, production build
- `npm test`: unit tests (Vitest + jsdom)
- `npm run test:e2e`: E2E in real headless Obsidian
- `npm run dev`: watch build into `sandbox-vault/`
- `npm run dev:build`: one dev build into `sandbox-vault/`, then exit
- `npm run screenshots:e2e`: screenshots to `e2e/screenshots/`
- `npm run fixtures:record`: re-record parser fixtures from real Obsidian
- `npm run perf:e2e`: performance benchmark (1,000 and 5,000 nodes)

## Code map

- `src/parser`: metadata cache + note text to node tree
- `src/layout`: pure layout (tidy tree, node size, edges, cross links, visible tree)
- `src/render`: DOM renderer, controls, culling, pan/zoom input, link handling
- `src/view`: `MindMapView`, collapse state, frontmatter, full screen, link targets
- `src/commands`: command implementations
- `src/main.ts`: plugin entry (commands, ribbon, file menu)
- `src/settings.ts`, `src/settingsTab.ts`: settings and settings tab
- `src/dev`: dev-only code (fixture recording)
- `tests/`: unit and view integration tests; hand-written `obsidian` mock in `tests/mocks/obsidian.ts`
- `e2e/`: E2E specs (`e2e/specs/`), screenshot, README image, fixture recording and perf runs
- `tests/vault/`: versioned test notes, parser fixtures in `tests/vault/fixtures/`
- `sandbox-vault/`: git-ignored vault in the main checkout, shared by all worktrees
