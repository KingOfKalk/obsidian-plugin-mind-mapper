# Mind Mapper user manual

Mind Mapper shows a Markdown note as a mind map in Obsidian. Headings, paragraphs, lists and blocks become nodes, rendered the way reading view renders them. The map follows the note while you write; you edit the note, never the map.

- Requires Obsidian 1.15.0 or later, desktop only
- Installation: see the [README](../README.md#installation)

## Contents

- [Open a map](#open-a-map)
- [How a note becomes a map](#how-a-note-becomes-a-map)
- [Move around the map](#move-around-the-map)
- [Select nodes and jump to the note](#select-nodes-and-jump-to-the-note)
- [Collapse and expand](#collapse-and-expand)
- [Full screen](#full-screen)
- [Layouts](#layouts)
- [Frontmatter keys](#frontmatter-keys)
- [Settings](#settings)
- [Commands](#commands)
- [Languages](#languages)
- [Large notes](#large-notes)
- [Known limits](#known-limits)
- [Troubleshooting](#troubleshooting)

## Open a map

Make the note active, then use one of:

| Where | What to click |
|---|---|
| Command palette | "Mind Mapper: Open as mind map" |
| File menu (right-click the note in the file explorer, or the tab's `⋮` menu) | "Open as mind map" |
| Ribbon (left edge) | the "Open as mind map" icon (opens the active note) |

- The map opens in a split next to the note
- It stays pinned to that note: switching to another note does not change the map; a rename is followed
- Opening the same note again shows the map that is already open
- The ribbon icon without an active Markdown note shows "Open a markdown note first"
- An open map is restored after an Obsidian restart

![A note on the left and its map on the right, laid out top to bottom](images/manual/note-and-map.png)

## How a note becomes a map

### Root

| The note has | The root is |
|---|---|
| exactly one H1 and nothing before it | that H1 |
| no H1, several H1s, or content before the first H1 | the file name; all H1s and the content before them hang under it |
| `mind-mapper-title` in its frontmatter | that title, in both cases above |

- Without any H1, the highest heading level in the note forms the first level

### Nodes

| In the note | In the map |
|---|---|
| Heading | a branch; nested by level, a skipped level (H1 then H3) attaches to the nearest heading above |
| Paragraph | one node under its heading |
| List item | one node; nested items nest their nodes; text indented under an item stays in its node |
| Ordered list item | one node, keeps its number |
| Task | one node with its checkbox (read-only) |
| Code block, Mermaid diagram, table, math block | one node, rendered like reading view |
| Quote, callout | one node with everything inside it |
| Image embed `![[image.png]]` | a node with a thumbnail |
| Other embeds (`![[Note]]`, PDF, audio, video) | a plain link, the content is not shown |
| Block ID `^id` | hidden in the node |
| Frontmatter, comments `%% %%`, HTML blocks, footnote definitions | left out |

- Large content is clipped at the max node size with a fade; the expand icon in the node's corner shows all of it in an overlay (`Esc` closes it)

![A long list item clipped with a fade and an expand icon in its corner](images/manual/clipped-node.png)

### Dividers

- `---`, `***`, `___` (also `- - -`) are not nodes: they show as a dashed line in a wider gap between the two nodes they separate
- Not shown: directly before a heading, before the first or after the last node of a section; several in a row count as one
- Inside a list item, quote or callout a divider is part of that node
- Gotcha: `---` directly under a line of text turns that text into a heading (Markdown rule, same in reading view). Leave a blank line above the divider, or use `***`

```markdown
Day 1: old town.        <- becomes a heading
---

Day 1: old town.        <- stays a paragraph, the divider is a line

---
```

### Links

- Links in nodes work like in Obsidian: click opens, `Ctrl/Cmd` + click opens in a new tab, hover shows the page preview
- Links to a heading or block in the same note are also drawn as dashed lines between the two nodes:
  - `[[#Heading]]`, `[[#Heading#Subheading]]`, `[[#^block-id]]`, `[[This note#Heading]]`
  - If one end is inside a collapsed branch, the line ends at the nearest visible node above it

![Dashed lines from two links to their target nodes, and a divider between Day 1 and Day 2](images/manual/links-and-divider.png)

## Move around the map

| Action | How |
|---|---|
| Pan | mouse wheel, two-finger scroll, or drag on the empty canvas |
| Zoom at the pointer | `Ctrl/Cmd` + wheel, or trackpad pinch (10 % to 400 %) |

The controls bar at the bottom center, left to right:

| Button | Does |
|---|---|
| Zoom out | zooms out one step |
| Zoom level (e.g. `60%`) | shows the zoom; click resets it to 100 % |
| Zoom in | zooms in one step |
| Fit to view | shows the whole map (also done when the map opens) |
| Collapse all / Expand all | one button: highlighted while anything is collapsed, then a click expands all; otherwise a click collapses all |
| Back to root | centers the root |
| Full screen | see [Full screen](#full-screen) |

![A collapsed Vegetables branch with its badge 4, and the highlighted collapse button in the controls bar](images/manual/collapsed.png)

## Select nodes and jump to the note

- Click a node: selects it; click the empty canvas: clears the selection
- Double click a node: jumps to its line in the note
  - In the tab where the note is open (the most recently used one), else in a new split next to the map
  - From full screen, full screen closes first
- Clicking a link inside a node opens the link, it does not select the node

## Collapse and expand

- Round button on a node's edge: collapses or expands its branch
  - Collapsed, it shows the number of hidden nodes
  - A collapse that hides the selected node selects the nearest visible node above it
- Collapse all (button or command): only the root and the first level stay visible
  - The map stays in this mode until Expand all: branches added or moved by later edits start collapsed too
  - Branches you expand by hand stay expanded
- Expand all: shows everything and ends the Collapse all mode
- Start collapsed: open a map like after Collapse all
  - For all notes: setting "Start collapsed"
  - For one note: `mind-mapper-collapsed: true` in its frontmatter (overrides the setting)
  - Changing the value while the map is open collapses or expands all once; other edits keep what you collapsed or expanded
- Collapsed branches are kept while the map is open, not across Obsidian restarts

## Full screen

- Full screen button or command "Toggle full screen": the map covers the whole Obsidian window
- Shows the map, the controls, a title chip on top and an exit button top right
- Controls fade after 2 s without mouse movement; move the mouse to show them
- Exit: `Esc` or the exit button; the previous pan and zoom come back
- Page previews, menus and notices still show on top

![The feature tour note in full screen with title, exit button and controls](images/manual/full-screen.png)

## Layouts

| Layout | Shape |
|---|---|
| `circle-clockwise` (default) | balanced: the first half of the first-level branches on the right (top to bottom), the rest on the left (bottom to top) |
| `circle-counter-clockwise` | the same, mirrored |
| `left-to-right` | all branches grow to the right |
| `right-to-left` | all branches grow to the left |
| `top-to-bottom` | all branches grow downwards |
| `bottom-to-top` | all branches grow upwards |

- For all notes: setting "Default layout"
- For one note: `mind-mapper-layout` in its frontmatter

`circle-clockwise`:

![A balanced map: Vegetables and Watering on the right, To do and Ideas on the left](images/manual/layout-balanced.png)

`top-to-bottom`:

![A map growing downwards: Agenda, Travel and Food with two items each](images/manual/layout-top-to-bottom.png)

## Frontmatter keys

| Key | Values | Default |
|---|---|---|
| `mind-mapper-title` | any text | the single H1, else the file name |
| `mind-mapper-layout` | one of the [layouts](#layouts) | setting "Default layout" |
| `mind-mapper-collapsed` | `true` or `false` (a checkbox in Properties) | setting "Start collapsed" |

```yaml
---
mind-mapper-title: Lumen 2.0
mind-mapper-layout: top-to-bottom
mind-mapper-collapsed: true
---
```

- Only the frontmatter at the very top of the note counts
- A missing key or a key without a value uses the default silently
- An invalid value uses the default and shows a notice once per note and value (per session), e.g. `Mind Mapper: unknown mind-mapper-layout "sideways" in Note.md, using circle-clockwise`
  - Invalid: an unknown layout, a title that is not text (a number, a list), a `mind-mapper-collapsed` that is not `true`/`false` (`yes`, `"true"`, `1`)

## Settings

Settings → Community plugins → Mind Mapper. All rows also show up in Obsidian's settings search. Changes apply to open maps right away.

| Setting | Range | Default | Does |
|---|---|---|---|
| Default layout | the six [layouts](#layouts) | `circle-clockwise` | for notes without `mind-mapper-layout` |
| Start collapsed | on / off | off | for notes without `mind-mapper-collapsed` |
| Max node width | 160–800 px | 320 px | wider content is clipped with a fade |
| Max node height | 120–800 px | 240 px | taller content is clipped with a fade |
| Sibling gap | 0–200 px | 12 px | space between neighbouring branches |
| Level gap | 20–400 px | 60 px | space between a node and its children |

- Number fields apply on `Enter` or when you leave the field; a value outside the range is set to the nearest limit

![The Mind Mapper settings tab with all six rows](images/manual/settings.png)

## Commands

Find them in the command palette under "Mind Mapper: …". None has a default hotkey; assign your own in Settings → Hotkeys. Avoid `Ctrl/Cmd + =`, `Ctrl/Cmd + -` and `Ctrl/Cmd + 0`: Obsidian uses them to zoom the whole app.

| Command | Available when | Suggested hotkey |
|---|---|---|
| Open as mind map | a Markdown note is active | |
| Zoom in | a mind map is active | `Ctrl/Cmd + Shift + =` |
| Zoom out | a mind map is active | `Ctrl/Cmd + Shift + -` |
| Fit to view | a mind map is active | `Shift + 1` |
| Reset zoom to 100% | a mind map is active | `Shift + 0` |
| Collapse all | a mind map is active | `Ctrl/Cmd + Shift + [` |
| Expand all | a mind map is active | `Ctrl/Cmd + Shift + ]` |
| Back to root | a mind map is active | `Shift + H` |
| Toggle full screen | a mind map is active | `Ctrl/Cmd + Shift + F11` |

- Collapse all and Expand all are two commands, so a hotkey always does the same; the controls bar has one button for both

## Languages

- English and German
- Follows Obsidian's language (Settings → General → Language); German when Obsidian is German, else English
- Obsidian applies a language change after a restart
- Frontmatter keys and layout names stay English in every language

## Large notes

- Only nodes in and near the visible area are rendered; more appear as you pan
- Zoomed far out (below 20 %) with more than 60 nodes in view, nodes are drawn as outlines without text; with more than 300 nodes in view always. Zoom in to read
- Lines between nodes and link lines are always complete
- 1,000 nodes open in about 0.1 s and pan and zoom smoothly

## Known limits

- Desktop only
- Read-only: edit the note, not the map; checkboxes in nodes cannot be ticked
- Embedded notes, PDFs and media are links, not shown inline
- Dashed link lines only connect headings and blocks within the same note; they are not routed around nodes
- The map updates when Obsidian saves the note (about 2 s after you stop typing), not on every keystroke
- Collapsed branches are not remembered across restarts
- A second `--- … ---` block in the middle of a note is not frontmatter: its last line becomes a heading
- No export, no search, no editing in the map

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| The map does not show my latest typing | Obsidian saves about 2 s after you stop typing; the map follows then. Pan, zoom, selection and collapsed branches are kept |
| A line of text became a heading | a `---` directly under it (see [Dividers](#dividers)); add a blank line above the `---` or use `***` |
| Notice `Mind Mapper: unknown mind-mapper-layout …` | the layout name is misspelled; use one of the [layouts](#layouts) |
| Notice `Mind Mapper: mind-mapper-collapsed … is not true or false …` | use `true` or `false` without quotes, or the checkbox in Properties |
| Notice `Mind Mapper: mind-mapper-title … is not text …` | the title is a number or a list; quote it: `mind-mapper-title: "2026"` |
| Notice `Open a markdown note first` | the ribbon icon needs an active Markdown note |
| Notice `Mind Mapper: could not open the mind map` | try again; if it repeats, reload Obsidian |
| The map shows "Note was deleted" | the note was deleted; close the map |
| A hotkey does nothing | view commands only act on the active map: click into the map first |
| A node shows only part of its content | it is larger than the max node size: use the expand icon, or raise Max node width / height |
| Text in the map is not readable when zoomed out | large map drawn as outlines: zoom in |
