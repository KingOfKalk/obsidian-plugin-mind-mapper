# Contributing

Work happens through issues and pull requests on [GitHub](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper). This doc defines the issue, branch, commit, pull request and release workflow.

## Before You Start

- Read [AGENTS.md](AGENTS.md) (rules) and [docs/mvp.md](docs/mvp.md) (binding spec).
- Set up and run things as described in [docs/developer.md](docs/developer.md).
- Open an issue first (bug report or feature request template), or claim an existing one. Wait for a go before starting larger changes: the scope is small on purpose (a read-only live map of a note).
- Name parts of the plugin by their ID from [docs/ui-elements.md](docs/ui-elements.md) in issues, pull requests and reviews (`controls.fit`, `node.toggle`); the ID names what an element is and never changes with its state, the state is `data-mm-state` (`[data-mm-id="node.toggle"][data-mm-state="collapsed"]`).
- Never push to `main` directly.

## Branching

- One branch per issue.
- Naming: `<type>/<issue-number>-<slug>`, e.g. `feat/42-dashed-dividers`, `fix/57-collapse-all`. Without an issue (rare, e.g. a typo): `<type>/<slug>`.
- `<type>` is the dominant Conventional Commit type of the change; `<slug>` is a short kebab-case description.
- Each branch lives in its own git worktree at `.worktrees/<branch>` in the repo root, with `/` in the branch name replaced by `-`:
  - `git worktree add -b docs/12-project-docs .worktrees/docs-12-project-docs`
  - `.worktrees/` is listed in `.git/info/exclude`.
  - Keep the main checkout on `main`.
  - Remove the worktree after the branch is merged or abandoned.
- Never commit directly to `main`. Never force-push.

## Commits

- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
- Format: `<type>[optional scope][!]: <description>`, e.g. `fix(view): keep new branches collapsed`.
- Types:
  - `feat`: new feature
  - `fix`: bug fix
  - `docs`: documentation only
  - `style`: formatting, no code change
  - `refactor`: code change that neither fixes a bug nor adds a feature
  - `perf`: performance improvement
  - `test`: add or fix tests
  - `build`: build system or dependencies
  - `ci`: CI configuration
  - `chore`: maintenance, no production code change
  - `revert`: revert a previous commit
- Scope: optional, lowercase, names the logical area (e.g. `parser`, `layout`, `render`, `view`), not a file path. Omit for cross-cutting changes.
- Description: imperative mood, lowercase, no trailing period.
- Breaking changes: add `!` after type/scope and a `BREAKING CHANGE: <details>` footer.
- Atomic: one logical concern per commit. Do not mix unrelated changes.
- No AI attribution: no `Co-Authored-By` trailers, no "generated with" lines, not in commits, branch names, issues or pull requests.
- Format with Prettier before committing (`npm run format`); `*.md` files are ignored by Prettier.

## Pull requests

- Push the branch to `origin` and open a draft pull request against `main` (`gh pr create --draft` or the web UI). Fill in the pull request template: `Closes #<issue>`, summary, test plan.
  - Keep it a draft while work is in progress; mark it "Ready for review" (`gh pr ready`) only when it is done: gates pass, CI is green and nothing more will be pushed. The owner merges only pull requests that are not drafts.
  - Changes after "Ready for review" go back to draft first (`gh pr ready --undo`). Never push to the branch of a merged pull request; start a new branch from `origin/main`.
- The PR title is a Conventional Commit (`<type>[optional scope][!]: <description>`). It becomes the squash commit message, and release-please builds the changelog from it.
- Before opening the PR, all gates pass locally:
  - `npm run check` (format, lint, typecheck, unit tests, build)
  - `npm run test:e2e` (real headless Obsidian)
  - UI changes: `npm run screenshots:e2e`, then look at the PNGs in `e2e/screenshots/`
- CI must pass before a merge. It runs Lint (Prettier, ESLint, TypeScript) → Test (unit: Vitest with coverage; e2e: headless Obsidian; in parallel) → Build (production build, plugin artifact, bundle size vs `main`). Required checks: "Lint", "Test (unit)", "Test (e2e)", "Build". Details: [docs/developer.md](docs/developer.md) (Release, CI).
- The owner reviews and merges. Pull requests are squash-merged; the branch is deleted afterwards.
- After a merge, run `npm run dev:build` in the main checkout so `sandbox-vault/` has the new build.
- Keep scope tight: unrelated work goes on a separate issue and branch.
- New elements: a pull request that adds a visible element gives it an ID (`src/elementIds.ts`, set as `data-mm-id`; its states, if any, go into `ELEMENT_STATES` and `data-mm-state`, never into the ID) and a row in [docs/ui-elements.md](docs/ui-elements.md); new commands, settings rows, notices and frontmatter keys get a row too (`npm run check` fails otherwise). Re-run `npm run ui:images` when the reference images change. See [docs/developer.md](docs/developer.md) (Element IDs).

## Screenshots in issues and pull requests

Add screenshots whenever something is visible: they make reviews and bug reports much faster.

- Bug issues: a screenshot of the problem (and the note's Markdown in the form).
- Pull requests with a visible change: before and after, side by side in a table. For colour or styling changes, also a loud-palette shot (see [docs/developer.md](docs/developer.md), Screenshots).
- Make them with the headless screenshot run: `npm run screenshots:e2e` on the branch ("after") and in a worktree of `origin/main` ("before"); use the same spec step for both so they are comparable.

Screenshots never go into this repository (no branch, no folder): they would bloat every clone. They live in one secret gist per issue or PR, owned by the maintainer, and are linked by their raw URL (which contains the file's revision, so the link stays stable). `gh` cannot upload images directly, but a gist is a git repository:

```sh
# per issue or PR (label e.g. pr-12 or issue-13)
mkdir -p /tmp/gist-pr-<n> && cd /tmp/gist-pr-<n>
echo "Screenshots for KingOfKalk/obsidian-plugin-mind-mapper pr-<n>" > README.md
gh gist create README.md --desc "mind-mapper screenshots: pr-<n>"   # prints the gist URL
git clone https://gist.github.com/<gist-id>.git g
cp before.png after.png g/
cd g && git add . && git commit -m "screenshots for pr-<n>" && git push
gh api gists/<gist-id> --jq '.files[] | "\(.filename) \(.raw_url)"'   # raw URLs for the links
```

Link them in the PR description or a comment:

```markdown
| Before | After |
|---|---|
| ![before](<raw url of before.png>) | ![after](<raw url of after.png>) |
```

Dragging an image into the GitHub web editor works too (GitHub stores it outside the repository). Deleting a gist removes its images; old links then break.

## Releases

- Releases are automated with [release-please](https://github.com/googleapis/release-please). Do not bump versions or tag by hand; do not edit `manifest.json` / `versions.json` versions by hand.
- release-please keeps a release pull request open on `main`. It collects the Conventional Commits since the last release, proposes the next version (`feat` = minor; `fix`, `perf`, `revert`, `docs`, `refactor` = patch; `!` = major) and updates the changelog, `package.json`, `manifest.json` and `versions.json`.
- `chore`, `ci`, `test`, `build` and `style` commits are hidden: they do not appear in the changelog and do not trigger a release on their own.
- The owner merges the release pull request. That publishes the GitHub release and the tag, and CI attaches `main.js`, `manifest.json` and `styles.css` to it.
- Tags and release titles have no `v` prefix (`release-please-config.json`): Obsidian needs the tag to equal the manifest version, e.g. `1.0.0`.
- Install channel for now: [BRAT](https://github.com/TfTHacker/obsidian42-brat) picks up each GitHub release. The community directory submission comes later (see [docs/going-public.md](docs/going-public.md)).
- Details of the release workflow and CI: [docs/developer.md](docs/developer.md) (Release).
