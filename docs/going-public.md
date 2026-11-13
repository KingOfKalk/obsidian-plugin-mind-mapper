# Going public

The repository is public and Mind Mapper is released (1.0.0 and later, via release-please; BRAT works for friends). This file lists only what is still open.

## Open

- [ ] `manifest.json`: add `authorUrl` (and `fundingUrl` if wanted)
- [ ] `package.json`: add `repository`, `bugs` and `homepage`
- [ ] "Report an issue" row in the settings tab's About group, linking to the issue tracker (code change, own issue and PR)
- [ ] Social preview image (`docs/images/hero.png`) set in the repository settings (not checkable from the API)

## Community directory (postponed)

Not planned yet. Keep these for when the owner decides to submit. The kit below ([Submission kit](#submission-kit)) has the commands, texts and steps; this list is what is left to do on the day.

- [ ] Run the [pre-flight checklist](#pre-flight-checklist) and fix whatever it finds
- [ ] Bump the `obsidian` types to the matching version once published (1.15.x types were not on npm on 2026-11-09)
- [ ] Submit the plugin through the [Obsidian Community directory](https://community.obsidian.md) (not a pull request, see below); answer the automated review
- [ ] README "Installation": switch to the [prepared final wording](#final-readme-installation) once the plugin is listed
- [ ] Delete this file once everything is done

## Submission kit

Prepared for #52 (research date 2026-11-13). The owner submits; nothing here was sent anywhere.

### How submission works today

- **Not a pull request any more.** The old route (PR to `obsidianmd/obsidian-releases` adding an entry to `community-plugins.json`, with a PR template) is gone: plugins are submitted at [community.obsidian.md](https://community.obsidian.md) and reviewed automatically. `obsidian-releases` only keeps an hourly mirror of the directory's JSON (workflow `mirror-community-json.yml`; the file is `https://community.obsidian.md/assets/community-plugins.json`). Do not open a PR there.
- The old PR template does not exist any more: `.github/pull_request_template.md` in `obsidian-releases` only links to `?template=plugin.md` and `theme.md`, and neither file exists (checked 2026-11-13 against `master`; last change to that file 2021-07-23). So there is no PR text to mirror; the texts below are for the portal and for questions from reviewers.
- Sources (read 2026-11-13, from the [obsidian-developer-docs](https://github.com/obsidianmd/obsidian-developer-docs) repository, folder `en/Community directory/`):
  - [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
  - [Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim) (the submission form)
  - [Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
  - [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
  - [Manage your plugin or theme](https://docs.obsidian.md/community-directory/manage-entry) (review results, listing)
  - [FAQ](https://docs.obsidian.md/community-directory/faq)
  - [Manifest reference](https://docs.obsidian.md/Reference/Manifest) (rules for `id`, `name`)
- What the directory reads: `manifest.json` at the HEAD of the default branch (`main`), the README, and the GitHub release whose tag equals the manifest `version`. The automated review scans manifest, release assets, source code, and verifies the production build matches the release.

### Pre-flight checklist

Run from the repository root on the day, on `main` with the latest release published. All commands are read-only. Expected results in the comments.

1. Id and name are free in the directory (the live list; the `obsidian-releases` copy is an hourly mirror of it):

   ```bash
   curl -fsSL https://community.obsidian.md/assets/community-plugins.json \
     | jq -c 'map(select(.id == "mind-mapper" or (.name | ascii_downcase) == "mind mapper"))'
   # expect: []   (also search "Mind Mapper" on https://community.obsidian.md/plugins)
   ```

2. Newest public Obsidian vs `minAppVersion` (owner decision 2026-11-13: keep `1.15.0`; the requirement says to use the latest stable build if unsure; 1.15.1 was current on that day):

   ```bash
   gh api repos/obsidianmd/obsidian-releases/contents/desktop-releases.json -H "Accept: application/vnd.github.raw" | jq -r .latestVersion
   jq -r .minAppVersion manifest.json
   # expect: minAppVersion <= latestVersion; decide again if it is far behind
   ```

3. Manifest rules (`id`: lowercase letters and hyphens, no `obsidian`, not ending in `plugin`; `name`: no "Obsidian", no "Plugin", Basic Latin only; description: at most 250 characters, ends with a period, no emoji; no `fundingUrl` because there is no donation link; `isDesktopOnly` true):

   ```bash
   jq '{id, name, version, minAppVersion, author, authorUrl, isDesktopOnly, fundingUrl, descriptionLength: (.description | length), endsWithPeriod: (.description | endswith("."))}' manifest.json
   # expect: id "mind-mapper", name "Mind Mapper", descriptionLength <= 250, endsWithPeriod true, fundingUrl null, isDesktopOnly true
   jq -r .description manifest.json
   # expect exactly the text in "Listing texts" below
   ```

4. `versions.json` has the manifest version and matches it:

   ```bash
   jq -e --arg v "$(jq -r .version manifest.json)" --arg m "$(jq -r .minAppVersion manifest.json)" '.[$v] == $m' versions.json
   # expect: true
   ```

5. The latest release: tag equals the version (no `v`), published (not draft, not pre-release), with `main.js`, `manifest.json` and `styles.css` attached, and the attached `manifest.json` equals the one in the repository:

   ```bash
   V=$(jq -r .version manifest.json)
   gh release view "$V" --json tagName,isDraft,isPrerelease,assets \
     | jq -c '{tagName, isDraft, isPrerelease, assets: [.assets[].name]}'
   # expect: tagName == $V, both false, assets contain main.js, manifest.json, styles.css
   gh release download "$V" -p manifest.json -O - | diff - manifest.json && echo same
   # expect: same
   ```

6. The scanner builds with the first script found of `build`, `build:plugin`, `compile`: ours is `build` (production). The release must match a fresh production build of its commit (checked for 1.5.1 on 2026-11-13: `main.js` and `styles.css` were byte-identical to a local `npm run build` at the tag). Re-check for the submitted version:

   ```bash
   git worktree add --detach .worktrees/verify "$V"
   cd .worktrees/verify && npm ci && npm run build && sha256sum main.js styles.css
   gh release download "$V" -D /tmp/rel-check --clobber -p main.js -p styles.css && sha256sum /tmp/rel-check/*
   # expect: the hashes match; then cd back and `git worktree remove --force .worktrees/verify`
   ```

7. Code gates, plus the directory's own review rules (the `obsidianmd` ESLint plugin is already part of `npm run lint`):

   ```bash
   npm run check
   # expect: exit 0 (one known warning: obsidianmd/settings-tab/prefer-setting-definitions)
   ```

8. Repository files and README: `LICENSE` in the root is recognized by GitHub (GPL-3.0), README describes purpose and usage, and states network use, accounts, payment (see "Developer policies" below):

   ```bash
   gh repo view KingOfKalk/obsidian-plugin-mind-mapper --json licenseInfo --jq .licenseInfo.spdxId
   # expect: GPL-3.0
   grep -n -A12 "^## Installation" README.md
   # expect: Requires Obsidian line, BRAT and manual steps, "Community directory: planned"
   ```

9. Developer policies, as of 2026-11-13 (checked on 1.5.1): no obfuscation, no ads, no telemetry, no self-update, no network use, no account or payment, no files outside the vault, GPL-3.0 `LICENSE` present. The production bundle's only `require` is `obsidian`; it contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `requestUrl` or `eval`. Re-check:

   ```bash
   grep -o -E 'require\("[a-z:_/]+"\)' main.js | sort -u
   grep -c -E 'fetch\(|XMLHttpRequest|WebSocket|requestUrl|eval\(' main.js
   # expect: only require("obsidian"); count 0
   ```

10. Sign-in prerequisites: an Obsidian account, and the GitHub account `KingOfKalk` connected on the community profile page.

### Listing texts

- `manifest.json` `description` (decided in #80; must equal `manifest.json` on submission day, the directory reads it from there; 146 characters):

  ```text
  Show any note as a live, read-only mind map that follows you while you write: headings, lists and blocks become nodes, rendered like reading view.
  ```

- Fields of the submission form: **GitHub repository URL** `https://github.com/KingOfKalk/obsidian-plugin-mind-mapper`; **Owner**: yourself; tick the Developer policies agreement and the support confirmation.
- Fields of **Edit listing** (after the first submission): icon, short and long description, categories, payment type, screenshots.
  - Payment type: **Free** (no payment, no paid service, no trial).
  - Short description: the manifest description above.
  - Long description (draft): "Mind Mapper shows any Markdown note as a mind map and keeps it up to date while you write. Headings, list items, paragraphs, code, tables, math, callouts and more become nodes; nodes render like reading view, so links, tags, image thumbnails and Mermaid diagrams work. Pan, zoom, collapse and expand branches, drill into a branch, switch layouts, and jump from a node to its place in the note. The map is read-only: you edit the note, the map follows. Desktop only. No network access, no telemetry, no account."
  - Categories: choose what the form offers (unknown until signed in).
  - Screenshots: up to 5 desktop images at 1200 by 800 px, JPEG, PNG or WebP, up to 5 MB each. `docs/images/hero.png` is 800 by 600 and the annotated `ui-elements*.png` are not suitable: fresh ones at 1200 by 800 are in `docs/images/listing/` (`npm run listing:images`, five PNGs; re-run it first if visible labels changed). Not checked against the form, it may accept other sizes.

### Reviewer notes

For the long description, the README or a reply if a reviewer or the `#community-directory` Discord channel asks. The automated review has no free-text field.

- Desktop only (`isDesktopOnly: true`). No Node or Electron API is used (the bundle's only `require` is `obsidian`); the flag is kept on purpose (owner decision 2026-11-13): the spec scopes the plugin to desktop.
- No network use, no telemetry, no accounts, no payment, no files outside the vault, no `fundingUrl`.
- Private Obsidian APIs used, each guarded (a missing or changed API makes the feature a no-op, never an error):
  1. Tag click opens the search (`src/render/linkHandling.ts`, `openTagSearch`): `app.internalPlugins.getEnabledPluginById('global-search').openGlobalSearch('tag:<tag>')`. Reading view does the same; there is no public API for opening the search. Typed as optional, returns false when missing or when the search core plugin is disabled.
  2. View header title (`src/view/MindMapView.ts`, `updateHeaderTitle`): sets the text of `.view-header-title` in the view's own `containerEl`. Obsidian fills the header title once, before `setState` knows the note, and refreshes only the tab title; there is no public hook for the header. Does nothing if the element is not found.
  3. Esc in popout windows and full screen (`src/view/MindMapView.ts`, `keepTabOnEscape`, `keepTabOnRelayedEscape`): calls `preventDefault()` on `Escape` while the map is the active view, via a `keydown` listener on the main document and a catch-all key handler (`scope.register(null, null, ...)`, public `Scope` API) for popouts, which relay keys to the main window before the popout sees them. Without it the workspace treats a bare Esc (or one that closed a menu of the control bar) as "go to the most recent note tab" and takes the active tab from the map. The map is not a navigation view on purpose, so that a note opened in the current tab does not replace it.
- Keyboard: the `D` key (drill into the selected branch) is registered in the map view's own `Scope`, so it only works while the map leaf is active and never as a global hotkey; it leaves text fields (the zoom input) alone. Commands exist for the main actions (including drill down), with no default hotkeys, so users can bind their own.
- Not met yet (separate feature, decided 2026-11-13): nodes are not keyboard focusable; selection needs a mouse.

### Step by step for the owner

1. Do the [pre-flight checklist](#pre-flight-checklist); fix problems through issues and PRs as usual. If anything changed in `manifest.json`, make sure it is on `main` and released (the release tag must equal the version).
2. Sign in at [community.obsidian.md](https://community.obsidian.md) with your Obsidian account (create one if needed).
3. On the community profile page, under **GitHub**, select **Connect**, authorize read-only access (the directory checks you own the repository). Optionally turn on **Action required notifications** (email when a review fails).
4. Sidebar **Plugins**, **New plugin**. Enter the repository URL and Owner (see "Listing texts"), agree to the Developer policies, confirm you will keep supporting the plugin, **Submit**.
5. Open the entry from **Plugins**. The automated review (Manifest, Releases, Source code, Build verification; each result is Error, Warning, Recommendation or Pass) runs on the release. Errors block installation; warnings do not, but fix what is reasonable. To test without a release: **Review branch** (blank = default branch) and **Run preview scan**. If a new release is not noticed, **...** then **Check for new releases**; to force a recheck, **...** then **Request review**.
6. To fix a finding: change the repository and publish a new release with an incremented version (release-please does this); the review runs again. No resubmission is needed for updates, ever.
7. **Edit listing**: icon, long description, categories, payment type Free, screenshots (see "Listing texts"), **Save**. Edit the description and select **Publish** (the plugin cannot be installed until all errors are resolved).
8. Questions or an "invalid identifier" error: Discord, channel `#community-directory` ([FAQ](https://docs.obsidian.md/community-directory/faq)). The id cannot change after publishing.
9. After it is listed: switch the README ([final wording](#final-readme-installation)), update [CONTRIBUTING.md](../CONTRIBUTING.md) ("Install channel for now: BRAT ..."), tell BRAT users they can switch (BRAT keeps working; a note in the release or on the forum is enough), check the plugin shows up under Settings, Community plugins, Browse. Optional: announce in [Share & showcase](https://forum.obsidian.md/c/share-showcase/9) and in `#updates` on [Discord](https://discord.gg/veuWUTm) (needs the `developer` role).

### Final README "Installation"

Copy-paste replacement for the "Installation" section of `README.md` once the plugin is listed (do not apply before):

```markdown
## Installation

Requires Obsidian 1.15.0 or later (desktop).

1. Community plugins (recommended, updates automatically):
   - Open Settings > Community plugins and turn off Restricted mode if it is on
   - Select Browse, search for "Mind Mapper", select Install, then Enable
2. Via [BRAT](https://github.com/TfTHacker/obsidian42-brat) (to try versions before they are in the directory):
   - Install the BRAT community plugin and enable it
   - Run the command "BRAT: Add a beta plugin for testing" and enter `KingOfKalk/obsidian-plugin-mind-mapper`
   - Enable Mind Mapper in Settings > Community plugins
3. Manually from the [latest release](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/releases/latest):
   - Download `main.js`, `manifest.json` and `styles.css`
   - Put them into `<vault>/.obsidian/plugins/mind-mapper/`
   - Enable Mind Mapper in Settings > Community plugins
```

### Legacy fallback: `community-plugins.json` entry

Only for the case that Obsidian brings the pull request route back (then fetch the current template again; the entry format is unchanged on 2026-11-13). Values must equal `manifest.json` on the day:

```json
{
  "id": "mind-mapper",
  "name": "Mind Mapper",
  "author": "KingOfKalk",
  "description": "Show any note as a live, read-only mind map that follows you while you write: headings, lists and blocks become nodes, rendered like reading view.",
  "repo": "KingOfKalk/obsidian-plugin-mind-mapper"
}
```
