# Mind Mapper: specification

## Glossary

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
  - A divider marks the next node, heading or not, under whatever parent that node lands in (for a heading: after the heading stack pops); it is shown if that parent already has at least one child before it
  - Ignored: before a parent's first child, after the last child (no next node)
  - Several in a row count as one; skipped sections in between (comments, HTML, ...) keep it pending
  - Look: extra gap between the two siblings plus a dashed line in the theme's divider color (`--hr-color`); the line divides whole branches: it runs from the child column to the far edge of the deepest visible descendant of either neighbor (a collapsed branch counts only with its visible part); perpendicular to the stacking direction (horizontal line in left/right layouts, vertical line in top/bottom layouts), mirrored with its nodes (right-to-left, bottom-to-top, left side of the circle layouts); kanban: see "Kanban"
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
    - Link highlight (decided, issue #21): an invisible ~12 px wide hit area along each line; hover shows a pointer and a slightly thicker line; a click (less than 4 px of movement) highlights the connection: both end nodes get the selection ring (accent colour), the line turns thicker and stays dashed (a link, not a tree edge) and is drawn above all nodes (all other lines stay behind the nodes); it is its own state, not a node selection; clicking the empty canvas, a node or another line ends it; a drag starting on a line pans; a collapsed end highlights the nearest visible ancestor; selecting a node never highlights links or linked nodes
    - Double click on a line: jump to the source line of the link (like a node double click); no fit
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
  - In this mode every node that newly has children starts collapsed: its ID was not in the previous tree (moved nodes get new IDs, new nodes too) or it had no children before; so after an edit everything stays collapsed
  - Branches expanded by hand stay expanded
  - Toggling single nodes does not end the mode
- Start collapsed (decided): frontmatter `mind-mapper-collapsed`, else the plugin setting "Start collapsed" (default off)
  - When true, a note starts like after "Collapse all" whenever the view loads it (opening the map, restoring the workspace, switching the view to the note): root and first level visible, collapse-all mode on
  - While the map is open, a change of the effective value (frontmatter edited, or the setting changed for a note without the key) is applied once: false to true runs "Collapse all", true to false runs "Expand all"
  - Any other live edit or settings change keeps the user's collapse state (clicks win); a renamed, or deleted and recreated, note keeps it as well
## Frontmatter
 
- Frontmatter is only the `yaml` section the cache reports at the start of the file (`---` on line 1); keys are read only from it
  - A later `--- ... ---` block is not frontmatter: the cache reports a thematic break plus a setext H2 whose text is the block's last line, and the map shows that heading like any other
- Keys are kebab-case and prefixed with the plugin ID `mind-mapper` (decided)

| Key | Type | Values | Default |
|---|---|---|---|
| `mind-mapper-title` | text | any string | single H1, else file name |
| `mind-mapper-layout` | text (enum) | `circle-clockwise`, `circle-counter-clockwise`, `left-to-right`, `right-to-left`, `top-to-bottom`, `bottom-to-top`, `kanban` | plugin setting (initially `circle-clockwise`) |
| `mind-mapper-collapsed` | checkbox (YAML boolean) | `true`, `false` | plugin setting "Start collapsed" (initially `false`) |
| `mind-mapper-theme` | text (enum) | `none`, `rainbow`, `ocean`, `forest`, `accent` | plugin setting "Default theme" (initially `rainbow`) |
 
- Light and dark (decided): the map always follows the active Obsidian theme via CSS variables; no per-note light/dark override. `mind-mapper-theme` only picks a colour theme (see Colour themes)
- Validation
  - `mind-mapper-layout` not in the list: fall back to the plugin setting
  - `mind-mapper-title` not a string (YAML number, list, ...): fall back to the default
  - `mind-mapper-collapsed` not a YAML boolean (`yes`, `"true"`, `1`, a list, ...): fall back to the plugin setting
  - `mind-mapper-theme` not in the list (case-sensitive, like `mind-mapper-layout`): fall back to the plugin setting
  - Absent keys and keys without a value fall back silently
  - Show a notice once per note and invalid value, not on every save
- Plugin settings tab: global defaults for layout, start collapsed and colour theme, frontmatter overrides per note
  - Declarative settings (Obsidian's `getSettingDefinitions`), in groups with headings: Map (default layout, start collapsed, default theme, max zoom for fit), Nodes (max node width and height), Spacing (sibling gap, level gap), About (plugin version, link to the repository)
  - Numeric settings are Obsidian's built-in sliders over their allowed range (steps: 10 px; sibling gap 2 px), showing the value in px, with "Restore default"; saved values are sanitized (clamped) as before
  - "Max zoom for fit" is a slider in percent (100–400, steps of 25, default 150), shown as "150%" (German "150 %" with a no-break space); saved values stay
  - "Default theme" is a dropdown: the values are the theme names, the labels are translated
## Colour themes (decided)
 
- Colour per branch: each first-level node starts a branch with its own colour from the palette, in source order (branch 1 colour 1, branch 2 colour 2, …); colours repeat when there are more branches than colours
  - Everything below a first-level node takes its branch colour: the nodes and the lines leading into them
  - The root has no branch colour
  - Circle layouts: branch order is the order of the root's children in the note, regardless of side
- Emphasis per level (every theme, also `none`)
  - Root: large bold text (1.5 times the normal size), no border, no visible box (its background is the canvas background, so lines behind it do not show through the text); the selection ring still shows
  - Level 1: box filled with the branch colour mixed into the background (50 % in light mode, 35 % in dark mode), normal text colour, no border; text contrast at least 4.5:1 (WCAG AA) on every palette colour in light and dark mode
  - Level 2: light tint of the branch colour (18 %), no border
  - Level 3 and deeper: plain text, no visible box (canvas background, like the root); the coloured line leads into it
  - Blocks (code, tables, math, quotes, callouts, Mermaid diagrams, image embeds) keep their box at every level: the normal background and a thin border in the branch colour
  - Lines: branch colour; lines into first-level nodes slightly thicker
  - Every theme and level has the same node size (borders stay, transparent), so a theme switch never changes the layout
- Not coloured: cross-link lines, dividers, collapse toggles and badges, the selection ring; the expand button sits on the node's background (the canvas background on nodes without a box)
- Themes

| Theme | Branch colours |
|---|---|
| `rainbow` (default) | red, orange, yellow, green, cyan, blue, purple |
| `ocean` | blue, cyan, green, purple |
| `forest` | green, yellow, orange, olive (green and orange mixed) |
| `accent` | every branch in Obsidian's accent colour |
| `none` | greys: level 1 and 2 from the faint text colour, lines faint, block borders the normal border colour |
 
- Colours come only from Obsidian's CSS variables (`--color-red`, …, `--interactive-accent`, `--text-faint`, `--background-primary`), so light and dark mode and community themes keep working
- Choice: the map view's own choice (controls bar, see "Layout and colour theme switcher"), else frontmatter `mind-mapper-theme`, else the plugin setting "Default theme" (default `rainbow`; a saved setting is kept)
- Live: a changed key or setting re-applies the theme while the map is open, without a re-layout
## Layout (decided)
 
- Input: tree, layout, measured or estimated node sizes; output: positioned nodes and edges; pure function
- Linear layouts (`left-to-right`, `right-to-left`, `top-to-bottom`, `bottom-to-top`): all subtrees grow in the layout direction
- Circle layouts (`circle-clockwise`, `circle-counter-clockwise`): balanced
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
- Text alignment: text nodes (headings, paragraphs, list items) sit flush towards the edge their line attaches to
  - Right side: left-aligned; left side: right-aligned; `top-to-bottom`, `bottom-to-top`: centred
  - Root: centred in circle and vertical layouts, right-aligned in `left-to-right`, left-aligned in `right-to-left`
  - Blocks (code, tables, math, quotes, callouts, diagrams, images) keep their own alignment; alignment never changes node sizes or positions
- Kanban (decided, issue #32): `kanban`, a board instead of a tree, minimal
  - Root: the headline, centred above the board (centred text); the level gap between it and the column headers
  - Level 1: columns side by side, left to right in source order, top-aligned; every column as wide as the widest header (plus its count bubble), card or subtask (plus its indent) of the whole board, at most the max node width (never narrower than a node itself, e.g. an image thumbnail); wider content is clipped with the fade as everywhere; gap between columns: twice the sibling gap
  - Level 2: cards stacked downwards in their column, from below the tallest header, as wide as the column
  - Level 3 and deeper: subtasks, still separate nodes (selection, double click, links), stacked below their card in note order, indented 20 px per level below the card (less when the node would not fit the column; never narrower than the node), reaching to the column's right edge
  - Gaps within a column: the sibling gap; text flush left; heights are the nodes' own; overlap-free (disjoint columns, one stack per column)
  - Look: the level emphasis of the colour themes (root large and bold without a box, headers filled, cards tinted, subtasks plain text); no connection lines, no lane backgrounds
  - Card count: each column header shows the number of its direct children in the note (also while collapsed) in a bubble at its right end, styled like the count of a collapsed toggle (accent fill); the layout leaves room for it; information only, a click selects the header; 0 for an empty column
  - No collapse toggles on nodes: collapse only via the controls bar and commands; "Collapse all" leaves root and column headers (an overview with counts); a collapse state from another layout stays in effect
  - Dividers: between two columns a vertical dashed line in the middle of the widened gap, from the top of the headers to the end of the longer of the two columns; between two cards or two subtasks a horizontal dashed line in the widened gap, from the node's (indented) left edge to the column's right edge
  - Unchanged: link lines, drill-down (the centre becomes the headline, its children the columns), colour themes, smooth camera, full screen
  - Later (not MVP): lane backgrounds, clickable counts, per-column collapse
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
    - Esc that closes a menu of the controls (zoom presets, layout, colour theme) only closes the menu; Esc on the map, in or out of full screen, never makes another tab active
  - Entering: fit to view; exiting: restore previous pan and zoom
  - Jump to source from full screen exits full screen first
  - Static map with free pan and zoom; no step-through (see Future features)
- Map controls (decided): floating Canvas-style controls, bottom center: zoom out, zoom field, zoom in, fit to view, collapse / expand all, back to root, drill down, layout, colour theme, full screen
  - Zoom field (decided): an editable input that shows the current zoom ("129%", German "129 %"); focus selects the text; typing a number (with or without "%", German comma decimals like "87,5") and Enter applies it, clamped to 10–400 %, centred on the canvas; Esc, leaving the input or invalid input restore the shown value; keys typed there never reach map or Obsidian hotkeys (Esc in the input does not leave full screen)
  - Next to it a chevron opens a menu: 50 %, 75 %, 100 %, 125 %, 150 %, 200 %, a separator, Fit to view; the current preset is checked
- Layout and colour theme switcher (decided, issues #6 and #7): change the layout or colour theme of one map view without changing the note
  - Two buttons in the controls bar (also in full screen), between back to root and full screen: layout (Lucide `workflow`, boxes joined by a line) and colour theme (Lucide `palette`); both distinct from fit (`group`) and the view icon (`network`)
  - Each opens an Obsidian `Menu` above the button, in the button's document (popout safe): the seven layouts (balanced clockwise, balanced counter-clockwise, left → right, right → left, top → bottom, bottom → top, kanban) or the five themes (None, Rainbow, Ocean, Forest, Accent colour), translated labels, the shown value checked; a separator; "Use the note's layout" / "Use the note's theme" clears the choice (frontmatter, else the setting)
  - Choosing a layout re-lays out and fits to view (like a frontmatter layout change); choosing the same layout that is shown only marks it as chosen. Choosing a theme applies it live without a re-layout
  - The choice (override) is per map view: stored in the view state (`layout`, `theme` next to `file`), so it survives an Obsidian restart and follows a rename (also of a deferred tab); the note and its frontmatter are never written. A view state without the keys (older versions) or with an unknown value has no override. A map opened anew (command, file menu, ribbon) starts without overrides
  - Precedence: override, else frontmatter, else plugin setting. An active override wins over later frontmatter edits and setting changes; while active, its button is highlighted (`is-active`, like the collapse button)
  - Commands (no default hotkeys, `checkCallback` on an active map view): "Change layout…" and "Change colour theme…" open the same menus at their buttons (Obsidian's menu works with arrow keys and Enter; one picker for mouse and keyboard, no second UI); "Next layout" and "Next colour theme" step to the next value in menu order from the shown one, wrapping after the last
- Drill-down (decided, issue #23): show one branch as a map of its own; the note is never changed
  - Drilling in: a selected node with children, then the control-bar button (Lucide `arrow-down-to-dot`, between back to root and layout), the key `D` or the command "Drill down into selection". The node becomes the centre, styled like the root (kind `root`: large, bold, no box, no collapse toggle, never collapsed even when collapsed in the whole map); only it and its subtree are shown; its children are level 1, branch colours recomputed from the new centre; the map is fitted
  - Key `D` (no modifiers): registered in the view's `Scope` (active with the map's leaf), not a command hotkey; ignored while typing in a text field (the zoom field, any input, textarea or contenteditable), so the editor and the zoom field are unaffected
  - Stacking: inside a drilled view, another selected node with children drills further; the drill path holds the drilled node IDs, outermost first, each inside the one before
  - Drilling out: the button and `D` go back one level when no node to drill into is selected (the centre, nothing, a leaf), the command "Drill out one level" always; "Show the whole map" goes straight back. After drilling out the node drilled out of (whole map: the outermost one) is selected and the shown map is fitted: the same transform as "Fit to view" (margin, bounds with toggles and badges, "Max zoom for fit"), and it counts as fitted afterwards
  - Indicators: the centre carries `is-drill-centre` and a small Lucide `focus` icon centred above it (below it when its children grow upwards); the button is highlighted (`is-active`) while drilled in, labelled "Drill out one level" when it drills out, and disabled when there is nothing to drill into or out of
  - Link lines to nodes outside the drilled part (also to its ancestors) are hidden
  - Robustness: when a live edit removes or renames a drilled node (the path no longer fits the tree), the map quietly shows the whole note, fitted, and saves the empty path
  - Persistence: the path is stored in the view state (`drill`, next to `layout` and `theme`), restored after a restart (fitted), kept on a rename; a view state without `drill` (older versions) or with a malformed one shows the whole map
  - Unchanged: collapse state, layout, theme, full screen and jump to source; "Back to root" centres the current centre; "Collapse all" keeps collapsing all nodes of the note (the centre and its children stay visible)
  - Animation: drilling in, the view glides (about 250 ms, ease in-out, transform only) until the node sits where and as large as it will be in the fitted drilled view; then the map fades out and the drilled map fades in (about 150 ms each, opacity only). Drilling out reverses it: fade out, swap with the node kept in place, fade in, then glide to the fitted map (with reduced motion: straight to it). With `prefers-reduced-motion: reduce` (the view's window) it switches instantly. A new drill step, pan, zoom, fit, collapse, layout choice or live edit during an animation first finishes it at once (no pile-up). The canvas has `is-animating` while it runs; the drill state (path, selection, commands) changes at once
  - Commands (no default hotkeys): "Drill down into selection" (a node with children selected), "Drill out one level" and "Show the whole map" (drilled in)
- Zoom and pan (decided, like Canvas)
  - Mouse wheel / two-finger scroll: pan
  - Ctrl/Cmd + wheel and trackpad pinch (arrives as wheel event with `ctrlKey`): zoom
  - Drag on empty canvas: pan
  - Double click on empty canvas: fit to view, also in full screen; only when both presses were clicks without dragging, so a pan never fits
  - Fit to view (default on open), zoom in, zoom out, reset to 100%, back to root
  - Zoom steps (decided): zoom in / out (controls and commands) snap to 10, 25, 50, 75, 100, 125, 150, 200, 300, 400 %: zoom in goes to the next step above the current zoom, zoom out to the next step below (from 129 %: in 150 %, out 125 %); at either end they stay; centred on the canvas; wheel and pinch zoom stay smooth
  - Fit margin (decided): per side 8 % of the shorter canvas side, at least 48 px (screen pixels); the fitted area includes the collapse toggles and hidden-count badges outside the node boxes (none in kanban)
  - Fit zoom cap (decided): fit shows the whole map at the largest zoom that fits, at most the plugin setting "Max zoom for fit" (100 % to 400 %, steps of 25 %, default 150 %), so a small map (e.g. after Collapse all) is enlarged and a large one still shrinks; applies to every fit (open, control and command, double click, full screen, layout change); changing the setting does not re-fit open maps, the next fit uses it
  - Smooth camera (decided, issue #24): Fit to view (control, command, zoom-preset menu, double click), zoom in / out, reset to 100 %, the zoom presets, a typed zoom and Back to root (when it moves the view) glide to the transform they used to set at once (about 250 ms, ease in-out, transform only); the zoom field follows on the way. A layout change (switcher, commands, a frontmatter or setting change) cross-fades like drilling out: the map fades out, the new layout fades in with the node at the view centre (or the selected one on screen) kept in place, then the view glides to the new fit. Same rules as drill-down: instant with `prefers-reduced-motion: reduce`, a new action (or pan and zoom input) finishes a running animation at once, `is-animating` on the canvas while it runs. A re-layout from measuring during a glide moves its target with the map (a fit glide lands on the new fit). Stay instant: wheel and trackpad pan / zoom, drag, opening a note (first fit), entering and leaving full screen, collapse and live edits (anchored as before)
  - Fit to view icon: Lucide `group` (two boxes in a frame: the whole map in view), visually distinct from full screen (`maximize-2`, diagonal arrows) and back to root (`locate`, crosshair)
  - Clipped nodes do not scroll internally; the expand icon opens the overlay
- Collapse / expand: toggle button on the node edge for single node (not in kanban)
  - All nodes (decided): one button in the map controls that shows the state; while any node is collapsed it shows "Expand all" and expands everything, otherwise "Collapse all" and collapses everything
  - Two separate commands "Collapse all" and "Expand all" stay, so a hotkey always does the same
- Commands and hotkeys (decided)
  - Every control is also a command: zoom in, zoom out, fit to view, reset to 100%, back to root, collapse all, expand all, toggle full screen, change layout…, next layout, change colour theme…, next colour theme, drill down into selection, drill out one level, show the whole map
  - Each command is registered in the same milestone as its control
  - Commands use `checkCallback` and act on the active mind map view; hidden when no mind map view is active
  - No default hotkeys (Obsidian plugin guidelines discourage them because of conflicts); users assign their own
  - README lists the commands with suggested bindings
- Interaction model (decided)
  - Single click on node: select only
  - A collapse that hides the selected node (single branch, "Collapse all", start collapsed) moves the selection to its nearest visible ancestor, which keeps its place on screen
  - Double click on node: jump to the source line in the editor
  - Double click on empty canvas: fit to view (see "Zoom and pan"); links, buttons, collapse toggles, link lines and the controls keep their own behavior
  - Expand icon on clipped nodes: overlay with full content
  - Links inside nodes: Obsidian behavior, no node click
  - No click timers needed, double click does not trigger a jump plus something else
- Jump to source target (decided)
  - Note already open in a leaf: reveal the most recently active one and set the cursor
  - Not open: open it in a split next to the map
  - Never replace the map leaf itself
## View lifecycle and error states
 
- View state
  - `getState` / `setState` persist the pinned file path, the view's layout and theme overrides (see "Layout and colour theme switcher") and the drill-down path (see "Drill-down"), so the map is restored after an Obsidian restart (views can be deferred until shown)
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
  - Listeners on long-lived objects (workspace, vault, metadata cache, the document) go through `registerEvent` / `registerDomEvent`, so they are removed on unload
  - Listeners on elements the plugin creates itself (control bar, nodes, collapse and expand buttons, full screen overlay) may use `addEventListener`: they are removed together with the element
  - Plugin `onunload` does not detach leaves (Obsidian guideline)
- Re-measure all nodes on theme or font change (`workspace` `css-change` event)
- Render failure (exception or timeout): node shows the raw source as plain text with an error marker and a fallback size
- Popout windows: use the view's own `document` and `window`, never the global ones
## Known limits

- Renaming the root H1 resets collapse state, selection and drill-down, because node IDs start with the root text
- Links in nodes show the page preview on `Ctrl/Cmd` + hover (the hover source is registered with `defaultMod: true`, like other plugin views); Obsidian's "Page preview" setting can change the modifier

## Future features
 
- Presentation mode: step through branches one by one (next / previous, focus and zoom to the current branch, dim the rest)
- Custom themes
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
  - A node is measured when it is first rendered: in place, in the map's own world container: the layout size (`offsetWidth` / `scrollWidth`) ignores the zoom transform, so it is the size at zoom 1; a hidden tab reports 0 and keeps the sizes measured before
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
- Platform (decided): desktop only (`isDesktopOnly: true`); `minAppVersion` 1.15.0, the newest public Obsidian release (betas do not count); it unlocks the declarative settings API, so the settings appear in Obsidian's settings search
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
- M4 - Map look
  - `circle-clockwise` and `circle-counter-clockwise` layouts, remaining linear directions
  - Frontmatter `mind-mapper-title` and `mind-mapper-layout`, validation with once-per-value notice
  - Settings tab: default layout, start collapsed, max node size, sibling and level gap
  - `circle-clockwise` becomes the default
  - Contour-based packing only if maps look too sparse
  - Value: the promised balanced map; per-note configuration
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
