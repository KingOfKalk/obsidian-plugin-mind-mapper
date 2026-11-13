import type { MapLayout, PositionedNode } from '../../src/layout/types';
import { toParserInput } from '../../src/parser/adapter';
import { buildTree } from '../../src/parser/buildTree';
import { allNodes } from '../../src/parser/treeWalk';
import type { MindMapTree } from '../../src/parser/types';
import type { CollapseInfo } from '../../src/render/DomMapRenderer';
import { Camera } from '../../src/view/camera';
import { drilledTree } from '../../src/view/drill';
import { type DrillHost, DrillDown } from '../../src/view/drillDown';
import { loadFixture } from '../fixtures';

/** Drill-down state and transitions of the map view (issue #50), on a real camera. */

const NO_COLLAPSE: CollapseInfo = { hidden: new Map(), hasChildren: () => false };

function fixtureTree(name: string): MindMapTree {
  const { text, cache } = loadFixture(name);
  return buildTree(toParserInput(cache, text), name);
}

/** A stand-in layout: the shown nodes in one column. */
function layoutFor(tree: MindMapTree, centre: string | null): MapLayout {
  const shown = (centre !== null && drilledTree(tree, centre)) || tree;
  const nodes = allNodes(shown).map(
    (node, i) => ({ node, x: 0, y: i * 50, width: 100, height: 40 }) as PositionedNode,
  );
  return {
    nodes,
    edges: [],
    dividers: [],
    bounds: { x: 0, y: 0, width: 100, height: nodes.length * 50 },
  };
}

function setup(name = 'crosslinks') {
  const canvas = document.body.createDiv();
  Object.defineProperty(canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(canvas, 'clientHeight', { value: 600 });
  const state = {
    tree: fixtureTree(name) as MindMapTree | null,
    layout: null as MapLayout | null,
    selected: null as string | null,
  };
  const pathChanged = vi.fn();
  const showCentre = vi.fn();
  // Reduced motion: every animation runs to its end at once.
  const camera = new Camera({
    win: () =>
      ({
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        matchMedia: () => ({ matches: true }),
      }) as unknown as Window,
    canvas: () => canvas,
    showTransform: () => {},
    setOpacity: () => {},
    shown: () => state.layout && { layout: state.layout, collapse: NO_COLLAPSE },
    fitMaxZoom: () => 1,
  });
  const host: DrillHost = {
    tree: () => state.tree,
    layout: () => state.layout,
    selected: () => state.selected,
    select: (id) => (state.selected = id),
    layoutFor: (tree, centre) => ({ layout: layoutFor(tree, centre), collapseInfo: NO_COLLAPSE }),
    showCentre: () => {
      showCentre(drill.centre);
      if (state.tree) state.layout = layoutFor(state.tree, drill.centre);
      // Like the view: a new layout fits when a fit is due.
      if (camera.pendingFit) camera.tryFit();
    },
    pathChanged,
  };
  const drill = new DrillDown(host, camera);
  if (state.tree) state.layout = layoutFor(state.tree, null);
  return { drill, state, camera, pathChanged, showCentre };
}

afterEach(() => document.body.empty());

test('the whole map: nothing to drill until a node with children is selected', () => {
  const { drill, state } = setup();
  expect(drill.isDrilled).toBe(false);
  expect(drill.centre).toBeNull();
  expect(drill.action()).toBeNull();
  // A leaf cannot become the center, nor can the center itself.
  state.selected = 'Links/Alpha/#1';
  expect(drill.canDrillDown()).toBe(false);
  state.selected = 'Links';
  expect(drill.canDrillDown()).toBe(false);
  state.selected = 'Links/Beta';
  expect(drill.canDrillDown()).toBe(true);
  expect(drill.action()).toBe('in');
});

test('down makes the selected node the center, shows it fitted and reports the new path', () => {
  const { drill, state, camera, pathChanged, showCentre } = setup();
  state.selected = 'Links/Beta';
  drill.down();
  expect(drill.path).toEqual(['Links/Beta']);
  expect(drill.centre).toBe('Links/Beta');
  expect(drill.isDrilled).toBe(true);
  expect(pathChanged).toHaveBeenCalledTimes(1);
  expect(showCentre).toHaveBeenCalledWith('Links/Beta');
  expect(camera.fitted).toBe(true);
  // The center itself is selected: the button drills out.
  expect(drill.action()).toBe('out');
});

test('out goes up one level and selects the node drilled out of; whole goes straight back', () => {
  const { drill, state } = setup();
  state.selected = 'Links/Beta';
  drill.down();
  state.selected = 'Links/Beta/Inner';
  expect(drill.canDrillDown()).toBe(true);
  drill.down();
  expect(drill.path).toEqual(['Links/Beta', 'Links/Beta/Inner']);
  drill.out();
  expect(drill.path).toEqual(['Links/Beta']);
  expect(drill.centre).toBe('Links/Beta');
  expect(state.selected).toBe('Links/Beta/Inner');
  drill.whole();
  expect(drill.path).toEqual([]);
  expect(drill.centre).toBeNull();
  expect(state.selected).toBe('Links/Beta');
});

test('drill: in when it can, else out, else nothing', () => {
  const { drill, state } = setup();
  drill.drill();
  expect(drill.isDrilled).toBe(false);
  state.selected = 'Links/Beta';
  drill.drill();
  expect(drill.path).toEqual(['Links/Beta']);
  drill.drill();
  expect(drill.path).toEqual([]);
});

test('restore takes a saved path as is; dropLost drops it when it no longer fits the tree', () => {
  const { drill, state, pathChanged } = setup();
  drill.restore(['Links/Beta']);
  expect(drill.centre).toBe('Links/Beta');
  expect(pathChanged).not.toHaveBeenCalled();
  if (!state.tree) throw new Error('no tree');
  expect(drill.dropLost(state.tree)).toBe(false);
  expect(drill.path).toEqual(['Links/Beta']);
  drill.restore(['Links/Missing']);
  expect(drill.dropLost(state.tree)).toBe(true);
  expect(drill.path).toEqual([]);
  expect(drill.centre).toBeNull();
  expect(pathChanged).toHaveBeenCalledTimes(1);
});

test('dropLost: a step whose ID names another node after an edit drops the path', () => {
  const { drill, state } = setup('drill-shift-before');
  state.selected = 'Shift/#1';
  if (!drill.canDrillDown()) throw new Error('fixture: Shift/#1 has no children');
  drill.down();
  expect(drill.dropLost(fixtureTree('drill-shift-after'))).toBe(true);
  expect(drill.isDrilled).toBe(false);
});

test('key D drills, but not while typing into a text field or with nothing to do', () => {
  const { drill, state } = setup();
  const key = (target: EventTarget | null) => drill.key({ target } as unknown as KeyboardEvent);
  expect(key(null)).toBe(true);
  state.selected = 'Links/Beta';
  const input = document.body.createEl('input');
  expect(key(input)).toBe(true);
  expect(drill.isDrilled).toBe(false);
  expect(key(document.body)).toBe(false);
  expect(drill.path).toEqual(['Links/Beta']);
});

test('without a map nothing drills', () => {
  const { drill, state } = setup();
  state.layout = null;
  state.selected = 'Links/Beta';
  expect(drill.canDrillDown()).toBe(false);
  expect(drill.action()).toBeNull();
});
