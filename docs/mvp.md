
 
- Section: an entry in Obsidian's `metadataCache` sections (paragraph, heading, list, code, table, blockquote, callout, math, ...)
- Node: one box in the map
- Block ID: a `^id` marker at the end of a section or list item
- Block link: a link to a block ID (`[[#^id]]`)
- Container: a section that can hold other content (list item, blockquote, callout)
## Mapping rules (Markdown to Map)
 
- Root node (decided)
  - Exactly one H1 and no content before it: H1 is root
    - "Content" means any section except frontmatter, comments and blank lines
    - `mind-mapper-title` overrides the root label
  - Otherwise (no H1, multiple H1s, or content before the first H1): virtual root
    - Label: `mind-mapper-title`, else file name
    - All H1s and any content before the first H1 become first-level children
    - No H1 at all: the highest heading level present becomes first-level children
- Headings: every heading is a branch node, nested by level
  - Skipped levels (H1 then H3): attach to nearest parent heading
  - Setext headings (`===` or `---` directly under a paragraph, no blank line between) are headings, as reported by the cache: the paragraph becomes an H1 or H2 branch, the content after it hangs under it
    - `***` and `___` never form a heading
- Paragraphs: one leaf node per paragraph section, under its heading
- Lists: one node per list item, nested lists nest the nodes
  - Item node content: the item text plus continuation content indented under it (paragraphs, code), excluding nested list items
  - Ordered lists keep their number, bullet markers are dropped
  - Task lists: checkbox rendered disabled, read-only
- Containers (decided): everything inside a container belongs to that container's node (a list inside a blockquote, code inside a callout); no nested nodes
- Block types: one section = one node, rendered by Obsidian (`MarkdownRenderer.render`)
  - Code block (incl. Mermaid), table, math block, blockquote: node
  - Callout (decided): one node, rendered as in Obsidian
  - Block ID `^id`: hidden in the node
  - Skip: frontmatter, comments `%% %%`, HTML blocks, footnote definitions; footnote references stay as text
- Dividers (decided): thematic breaks in any form (`---`, `***`, `___`, also with spaces like `- - -`; cache type `thematicBreak`) are not nodes; they are drawn between sibling nodes
  - Shown only between two siblings of the same parent; before the first or after the last child: ignored
  - Directly before a heading: ignored (the heading branches already separate those sections)
  - Several in a row count as one
  - Look: extra gap between the two siblings plus a dashed line in the theme's divider color (`--hr-color`), across the width of the wider of the two neighbors; perpendicular to the stacking direction (horizontal line in left/right layouts, vertical line in top/bottom layouts)
  - Circle layouts: drawn on the side it falls on; a divider exactly at the split between right and left side is not drawn
  - A collapsed parent hides its dividers
  - Inside a container (list item, blockquote, callout) a divider is part of that node's content and renders as a line inside the node
- Node size (decided)
  - Max node size 320 x 240 px (about 10 lines at default line height), configurable in plugin settings
  - Text wraps within max width
  - Content larger than max size (long text, wide tables, wide code, large Mermaid): clipped with a fade, an expand icon on the node opens a pop-up overlay with the full content
- Embeds (decided)
  - Image embed `![[img.png]]`: node with thumbnail in a fixed-size box, so the size is known before the image loads
  - All other embeds (`![[Note]]`, `![[Note#Heading]]`, PDF, audio, video): rewritten to plain links before rendering, no transclusion
- Links
  - Internal heading links (`[[#Heading]]`, `[[Note#Heading]]` if it resolves to the same note) and block links (`[[#^id]]`): draw a cross-connection line between nodes
    - Same-note check: resolve the link path with `metadataCache.getFirstLinkpathDest` and compare with the pinned file
    - Nested heading links (`[[#A#B]]`): target is heading B under heading A
    - Heading text matching and duplicate headings: follow Obsidian's resolution (to verify with fixtures, see Open topics)
    - Target or source collapsed (decided): draw the line to the nearest visible ancestor
  - All other links (internal, external): clickable, with hover preview, same behavior as in Obsidian; click does not propagate to the node
    - Wired by the plugin: click handler with `workspace.openLinkText` (modifier keys open in new tab / split), hover preview via `registerHoverLinkSource` and the `hover-link` event
## Worked example
 
Note:
 
```markdown
# Project
Intro paragraph.
 
## Tasks
- [ ] Write parser
  Details for the parser.
- [x] Set up CI
 
## Notes
> A quote
```
 
Tree:
 
```text
Project (root, H1)
  Intro paragraph.
  Tasks
    [ ] Write parser / Details for the parser.   (one node)
    [x] Set up CI
  Notes
    > A quote
```
 
- This note and its expected tree are the first parser fixture
## Node identity (decided)
 
- Identity is used for collapse state and selection; it must survive edits in other places
  - Headings: path of heading texts with an occurrence index for duplicate siblings, separator escaped (e.g. `Project/Tasks`, `Project/Notes[2]`; a `/` in a heading is escaped)
  - Other nodes: parent ID + ordinal position among siblings
    - Inserting a sibling shifts later leaf IDs; accepted, because collapse state mostly lives on headings
- Render cache key is separate from identity: content hash of the section text plus node width
  - Cache hits survive ID shifts
- Collapse state kept in memory per ID for the session; persisting per note is a future feature
- Collapse all mode (decided): "Collapse all" switches the map into collapse-all mode until "Expand all"
  - In this mode every node with children whose ID was not in the previous tree starts collapsed (moved nodes get new IDs, new nodes too), so after an edit everything stays collapsed
  - Toggling single nodes does not end the mode
## Frontmatter
 
- Frontmatter is only the `yaml` section the cache reports at the start of the file (`---` on line 1); keys are read only from it
  - A later `--- ... ---` block is not frontmatter: the cache reports a thematic break plus a setext H2 whose text is the block's last line, and the map shows that heading like any other
- Keys are kebab-case and prefixed with the plugin ID `mind-mapper` (decided)

| Key | Type | Values | Default |
|---|---|---|---|
| `mind-mapper-title` | text | any string | single H1, else file name |
| `mind-mapper-layout` | text (enum) | `circle-clockwise`, `circle-counter-clockwise`, `left-to-right`, `right-to-left`, `top-to-bottom`, `bottom-to-top` | plugin setting (initially `circle-clockwise`) |
 
- Theme (decided): the map always follows the active Obsidian theme via CSS variables; no per-note override in MVP
- Validation
  - `mind-mapper-layout` not in the list: fall back to the plugin setting
  - `mind-mapper-title` not a string (YAML number, list, ...): fall back to the default
  - Show a notice once per note and invalid value, not on every save
- Plugin settings tab: global default for layout, frontmatter overrides per note
## Layout (decided)
 
- Input: tree, layout, measured or estimated node sizes; output: positioned nodes and edges; pure function
- Linear layouts (`left-to-right`, `right-to-left`, `top-to-bottom`, `bottom-to-top`): all subtrees grow in the layout direction
- Circle layouts (`circle-clockwise`, `circle-counter-clockwise`): balanced like XMind
  - First half of first-level branches (rounded up) on the right side, rest on the left side
  - Clockwise order: right side top to bottom, then left side bottom to top
  - `circle-counter-clockwise` mirrors it horizontally
  - Each side is laid out as one linear tree: right side left-to-right, left side right-to-left
  - Each side's stack is vertically centered on the root; the two sides are independent, so they can differ in height
  - Visual intent for small maps (clock positions, not fixed angles):
| First-level branches | `circle-clockwise` |
|---|---|
| 1 | 3 o'clock |
| 2 | 3, 9 |
| 3 | 2, 4, 9 |
| 4 | 2, 4, 8, 10 |
| 6 | 1:30, 3, 4:30, 7:30, 9, 10:30 |
 
- Algorithm (decided for MVP): bounding-box tidy tree
  - Each subtree is a box, sibling boxes are stacked, parent centered on the extent of its children
  - Overlap-free by construction
  - Sibling gap and level gap: constants until M4, then plugin settings
- Optional later: tighter contour-based packing for variable node sizes (non-layered tidy tree, e.g. van der Ploeg 2014); same interface, internal swap, only if maps look too sparse
- Edges: cubic bezier from parent edge to child edge; no routing or crossing avoidance in MVP
## MVP features
 
- Open
  - Command palette: "Open as mind map" (only available for markdown files)
  - File menu entry and ribbon icon
  - Custom view type, opens as tab or split next to the note
  - View binding (decided): pinned to the file it was opened from; following the active note is a future option
- Full screen (decided)
  - Workspace overlay: the map view is shown as a fixed-position layer covering the whole Obsidian window
    - Not the browser Fullscreen API: with element full screen, notices, menus, modals and hover previews (attached to the document body) would be hidden
  - Hidden: all Obsidian chrome, only the map remains
  - Visible: floating controls bottom center (same as normal view), exit button top right, optional title chip
  - Controls fade out after about 2 s idle, reappear on mouse move
  - Exit: Esc (handled by the plugin, after open overlays and modals have consumed it) and exit button
  - Entering: fit to view; exiting: restore previous pan and zoom
  - Jump to source from full screen exits full screen first
  - Static map with free pan and zoom; no step-through (see Future features)
- Map controls (decided): floating Canvas-style controls, bottom center
- Zoom and pan (decided, like Canvas)
  - Mouse wheel / two-finger scroll: pan
  - Ctrl/Cmd + wheel and trackpad pinch (arrives as wheel event with `ctrlKey`): zoom
  - Drag on empty canvas: pan
  - Fit to view (default on open), zoom in, zoom out, reset to 100%, back to root
  - Clipped nodes do not scroll internally; the expand icon opens the overlay
- Collapse / expand: toggle button on the node edge (XMind style) for single node
  - All nodes (decided): one button in the map controls that shows the state; while any node is collapsed it shows "Expand all" and expands everything, otherwise "Collapse all" and collapses everything
  - Two separate commands "Collapse all" and "Expand all" stay, so a hotkey always does the same
- Commands and hotkeys (decided)
  - Every control is also a command: zoom in, zoom out, fit to view, reset to 100%, back to root, collapse all, expand all, toggle full screen
  - Each command is registered in the same milestone as its control
  - Commands use `checkCallback` and act on the active mind map view; hidden when no mind map view is active
  - No default hotkeys (Obsidian plugin guidelines discourage them because of conflicts); users assign their own
  - README lists the commands with suggested bindings
- Interaction model (decided)
  - Single click on node: select only
  - Double click on node: jump to the source line in the editor
  - Expand icon on clipped nodes: overlay with full content
  - Links inside nodes: Obsidian behavior, no node click
  - No click timers needed, double click does not trigger a jump plus something else
- Jump to source target (decided)
  - Note already open in a leaf: reveal the most recently active one and set the cursor
  - Not open: open it in a split next to the map
  - Never replace the map leaf itself
## View lifecycle and error states
 
- View state
  - `getState` / `setState` persist the pinned file path, so the map is restored after an Obsidian restart (views can be deferred until shown)
  - File renamed or moved (`vault` `rename` event): follow the file, update title
  - File deleted: keep the view, show an empty state "Note was deleted"
- Loading and empty states
  - `getFileCache` returns `null` (not indexed yet, e.g. at startup): show a loading state, render on the first `changed` event for the file
  - Empty note or only frontmatter: show the root only with a hint
- Live update
  - Source: `metadataCache.on('changed', (file, data, cache))` for the pinned file only; `data` is the file text matching `cache`, no separate `vault.cachedRead`
  - Debounced (about 300 ms)
  - Generation token: a newer change cancels any in-flight parse, render and measure
  - Pan, zoom, selection and collapse state are kept; fit to view only on open
- Render ownership
  - The view is a `Component`; each rendered node gets a child `Component` passed to `MarkdownRenderer.render`
  - Child components are unloaded when a node is culled, replaced by an update, or the view closes
  - All listeners via `registerEvent` / `registerDomEvent`, so they are removed on unload
  - Plugin `onunload` does not detach leaves (Obsidian guideline)
- Re-measure all nodes on theme or font change (`workspace` `css-change` event)
- Render failure (exception or timeout): node shows the raw source as plain text with an error marker and a fallback size
- Popout windows: use the view's own `document` and `window`, never the global ones
## Future features
 
- Presentation mode: step through branches one by one (next / previous, focus and zoom to the current branch, dim the rest)
- Custom themes
- Per-note theme override (`mind-mapper-theme`: `system`, `dark`, `light`)
- Map follows the active note (like Outline)
- Labels / comments on connection lines
- Editing in the map (writes back to markdown)
- Export as PNG / SVG
- Persist collapse state per note
- Search and highlight nodes
- Minimap
- Node colors via tags or frontmatter
- Cross-note heading links
- three.js renderer for very large maps
- Mobile support
- Callouts as title node with content as children, color by callout type
- Embeds: show embedded note content
- Dividers as groups: a thematic break splits a section's children into named or framed groups
## Implementation
 
- TypeScript, Obsidian plugin API
- TDD, everything tested, testing pyramid
  - Unit (most): parser (cache + text to tree), layout engine (tree + sizes to coordinates per layout), frontmatter validation
  - Integration: view lifecycle, live update, settings, with mocked Obsidian API
  - E2E (few): real Obsidian instance, e.g. `wdio-obsidian-service`
  - Fixtures include non-ASCII text (umlauts, Greek, emoji); cache positions are character offsets, slicing JS strings by them is correct, but test it
- Architecture: keep three layers separate and pure where possible
  - Parser (decided): `metadataCache` (headings, sections, listItems, links, blocks, frontmatter) plus the file text from the `changed` event
    - Cache gives structure and positions, text is sliced from the file content by offset
    - Adapter maps it to its own plain data structure, tree builder stays pure
    - Unit tests use recorded cache snapshots plus note text as fixtures, no Obsidian needed
    - Line positions from the cache enable jump to source
  - Layout (decided): see Layout section
  - Renderer: positioned nodes to screen
- Measuring (decided)
  - Initial sizes are estimated from section type and text length, so the first layout is instant at any note size
  - A node is measured when it is first rendered: in an attached off-screen container with `visibility: hidden` at zoom 1 (never `display: none`, which measures 0)
  - `ResizeObserver` per rendered node catches late size changes (images, Mermaid, math, other plugins' post processors)
  - Size changes trigger a debounced re-layout that keeps the viewport anchored on the selected node, else the view center
  - Measured sizes are cached by render cache key
- Rendering (decided): SVG / DOM for MVP
  - Own pan/zoom (or d3-zoom), node content via `MarkdownRenderer.render` (not the deprecated `renderMarkdown`), theming via Obsidian CSS variables
  - Keep renderer behind an interface, three.js renderer as future option for very large maps
- Performance (decided)
  - Target: 1,000 nodes pan/zoom smooth at 60 fps, 5,000 nodes still usable
  - Render only nodes in the viewport plus a margin; edges and cross-connection lines are kept even when one endpoint is off screen
  - Render cache and measured size cache by content hash, reused on live update
  - Verified with a benchmark harness on generated notes (frame times logged, compared against a baseline) plus a manual gate; no fps assertions in CI, they are flaky
- Platform (decided): desktop only (`isDesktopOnly: true`); `minAppVersion` set to the oldest Obsidian version that has every API used
## Suggested milestones
 
Each milestone ends in something installable and usable in a real vault. Order is by risk and value: the parser and layout core first, polish last.
 
- M0 - Walking skeleton
  - Plugin loads in Obsidian, empty view opens via command palette (markdown files only)
  - View state persistence (`getState` / `setState`) from the start
  - Dev loop: hot reload into a test vault, CI with lint, unit tests, build, release workflow (GitHub release + BRAT installable)
  - Value: installable from day one, every later milestone ships via BRAT
- M1 - Outline map
  - Parser: headings only (cache + text), root rules without `mind-mapper-title` (H1 or file name), skipped levels, occurrence-indexed heading IDs
  - Worked example as first fixture
  - Layout: `left-to-right` bounding-box tidy tree with fixed node size, constant gaps, bezier edges
  - Renderer: plain text nodes, pan and zoom like Canvas, fit to view on open
  - Floating controls with their commands: zoom in, zoom out, fit to view, reset to 100%
  - Value: a usable overview map of any note's structure; parser and layout core are tested and in place
- M2 - Full content
  - Parser: paragraphs, lists, task lists, containers, blocks, embeds, skip rules
  - Nodes rendered via `MarkdownRenderer.render` with child components and cleanup
  - Estimated sizes, measure on render, `ResizeObserver`, anchored re-layout, `css-change` re-measure
  - Max node size with clipping, expand icon and overlay; embed rewriting; disabled checkboxes
  - Link click handling and hover preview wired
  - Render failure fallback
  - Performance spike: generated 1,000 and 5,000 node notes, validate that estimate-then-measure works before building further
  - Value: real notes render as they look in Obsidian; the main technical risk (render + measure + layout at scale) is retired
- M3 - Live companion
  - Live update via the `changed` event, debounce, generation token, viewport and selection kept
  - Stable node IDs, render and size cache by content hash
  - Collapse/expand: node toggle plus collapse all and expand all commands
  - Selection, double click jump to source with the target leaf rules
  - Rename, delete, loading and empty states
  - Value: the map is useful while writing, not only for reading
- M4 - XMind look
  - `circle-clockwise` and `circle-counter-clockwise` layouts, remaining linear directions
  - Frontmatter `mind-mapper-title` and `mind-mapper-layout`, validation with once-per-value notice
  - Settings tab: default layout, max node size, sibling and level gap
  - `circle-clockwise` becomes the default
  - Contour-based packing only if maps look too sparse
  - Value: the promised XMind-like map; per-note configuration
- M5 - Navigation and polish
  - Cross-connection lines for heading and block links, collapsed-ancestor rule, culling-safe
  - Back to root and full screen (workspace overlay) with their commands, file menu entry, ribbon icon
  - Popout window support
  - Value: feature-complete MVP for daily use
- M6 - Scale
  - Viewport culling with child component unloading, benchmark harness, tuning against the 1,000 / 5,000 node target
  - Value: large notes stay smooth; performance target is verified, not assumed
- M7 - Release
  - Plugin id `mind-mapper` (the id must not contain "obsidian"), name "Mind Mapper"; check for name clashes with existing mind map plugins
  - Community submission checklist: LICENSE, `manifest.json`, `versions.json`, release assets (`main.js`, `manifest.json`, `styles.css`)
  - README with screenshots, command list with suggested hotkeys, settings docs
  - Value: public release, feedback loop with real users
## Open topics
 
No open design decisions for MVP scope. The following facts are unverified and should be checked with small spikes or fixtures early (M1/M2):
 
- Obsidian's heading link resolution: text normalization and behavior with duplicate headings
- Whether `ListItemCache` positions include continuation content and nested items
- Actual delay between typing and the `changed` event (autosave timing)
- Whether any link click handling works out of the box in a custom view, or everything has to be wired
- Exact community plugin naming rules beyond "no obsidian in the id"
## Links
 
- [GitHub: Obsidian Plugin Mind Mapper](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper)
- [Obsidian: Build a plugin](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
