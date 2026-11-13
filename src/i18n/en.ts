/** English UI strings: the source of truth for the keys. `{name}` marks a placeholder for `t`. */
export const en = {
  // Plugin: command, ribbon, file menu, notices
  openAsMindMap: 'Open as mind map',
  openNoteFirst: 'Open a Markdown note first',
  couldNotOpenMap: 'Mind Mapper: could not open the mind map',
  couldNotOpenNote: 'Could not open the note',

  // View commands and map controls
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitToView: 'Fit to view',
  resetZoom: 'Reset zoom to 100%',
  zoomPercent: '{percent}%',
  zoomLevel: 'Zoom level',
  zoomPresets: 'Zoom presets',
  collapseAll: 'Collapse all',
  expandAll: 'Expand all',
  backToRoot: 'Back to root',
  toggleFullScreen: 'Toggle full screen',
  exitFullScreen: 'Exit full screen',
  drillDown: 'Drill down into selection',
  drillOut: 'Drill out one level',
  showWholeMap: 'Show the whole map',

  // Layout and colour theme of the map view (control bar menus and commands)
  layoutMenu: 'Layout',
  themeMenu: 'Color theme',
  changeLayout: 'Change layout…',
  nextLayout: 'Next layout',
  changeTheme: 'Change color theme…',
  nextTheme: 'Next color theme',
  useNoteLayout: "Use the note's layout",
  useNoteTheme: "Use the note's theme",
  layoutCircleClockwise: 'Balanced clockwise',
  layoutCircleCounterClockwise: 'Balanced counter-clockwise',
  layoutLeftToRight: 'Left → right',
  layoutRightToLeft: 'Right → left',
  layoutTopToBottom: 'Top → bottom',
  layoutBottomToTop: 'Bottom → top',
  layoutKanban: 'Kanban',

  // Nodes
  collapseNode: 'Collapse',
  expandNode: 'Expand',
  showFullContent: 'Show full content',
  drillCentre: 'Drilled-in center',
  cardCountOne: '{count} card',
  cardCountOther: '{count} cards',

  // View
  viewTitle: 'Mind map',
  noNoteSelected: 'No note selected',
  noteNotFound: 'Note not found: {path}',
  loading: 'Loading…',
  couldNotReadNote: 'Could not read note',
  noteDeleted: 'Note was deleted',
  noContentYet: 'This note has no content yet',
  couldNotShowNote: 'Could not show the note',
  couldNotUpdateMap: 'Could not update the map. Showing the last version.',

  // Frontmatter notices
  invalidLayout: 'Mind Mapper: unknown mind-mapper-layout "{value}" in {path}, using {layout}',
  invalidCollapsed:
    'Mind Mapper: mind-mapper-collapsed "{value}" in {path} is not true or false, using {collapsed}',
  invalidTitle: 'Mind Mapper: mind-mapper-title in {path} is not text, using the default title',
  invalidTheme: 'Mind Mapper: unknown mind-mapper-theme "{value}" in {path}, using {theme}',

  // Settings
  mapHeading: 'Map',
  nodesHeading: 'Nodes',
  spacingHeading: 'Spacing',
  aboutHeading: 'About',
  defaultLayoutName: 'Default layout',
  defaultLayoutDesc: 'For notes without mind-mapper-layout in their frontmatter.',
  startCollapsedName: 'Start collapsed',
  startCollapsedDesc:
    'Open maps with only the root and the first level visible, for notes without mind-mapper-collapsed in their frontmatter.',
  defaultThemeName: 'Default theme',
  defaultThemeDesc:
    'Colors each first-level branch and everything below it, for notes without mind-mapper-theme in their frontmatter.',
  fitMaxZoomName: 'Max zoom for fit',
  fitMaxZoomDesc:
    'Fit to view enlarges small maps up to this zoom. Open maps use it the next time they fit.',
  themeNone: 'None',
  themeRainbow: 'Rainbow',
  themeOcean: 'Ocean',
  themeForest: 'Forest',
  themeAccent: 'Accent color',
  maxNodeWidthName: 'Max node width',
  maxNodeWidthDesc: 'Wider content is clipped with a fade.',
  maxNodeHeightName: 'Max node height',
  maxNodeHeightDesc: 'Taller content is clipped with a fade.',
  siblingGapName: 'Sibling gap',
  siblingGapDesc: 'Space between neighboring branches.',
  levelGapName: 'Level gap',
  levelGapDesc: 'Space between a node and its children.',
  pixels: '{value} px',
  versionName: 'Version',
  sourceCodeName: 'Source code',
  reportIssueName: 'Report an issue',
};

export type MessageKey = keyof typeof en;
/** A translation: exactly the English keys (a missing or extra key fails to compile). */
export type Messages = Record<MessageKey, string>;
