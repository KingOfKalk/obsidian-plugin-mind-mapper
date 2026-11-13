# Changelog

## [1.5.1](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/compare/1.5.0...1.5.1) (2026-11-13)


### Bug Fixes

* **parser:** unique node IDs for empty headings ([#54](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/54)) ([6c1a72d](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/6c1a72d4f5e55a4053b3e8548b8c5a6de67ddf97))
* **render:** skeleton thresholds count only nodes in view ([#61](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/61)) ([0c67911](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/0c67911037c94893070b097eb3ea69006fc9dcd9))
* robustness gaps in drill-down, rendering and live updates ([#69](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/69)) ([7cce29e](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/7cce29e33f1f9e1b26a5a9f2509914670b84058f))
* **view:** keep the map working after its tab moves to another window ([#59](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/59)) ([d42378c](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/d42378cf5fd6f2c16d42adf41f57b3da4854ff1d))


### Performance Improvements

* **render:** cap margin DOM nodes at twice the in-view threshold ([#64](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/64)) ([1798ec5](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/1798ec5036fd747e3d7ffefa3449ef4ba9d563e1))


### Documentation

* spec, perf baseline and draft PR workflow ([#68](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/68)) ([e66a268](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/e66a268a82331417b8de2a24f7e6734710bea960))
* sync docs and spec with actual behaviour ([#56](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/56)) ([ec4526d](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/ec4526d99675d73828247ac49bf762fd1c0ba214))


### Code Refactoring

* module boundaries, dead code, linear list parsing, cheaper re-renders ([#67](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/67)) ([db7067a](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/db7067a96a81af33b5b23b9a1161dfcc5d7d8b7b))

## [1.5.0](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/compare/1.4.0...1.5.0) (2026-11-13)


### Features

* kanban layout ([#42](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/42)) ([19f67f6](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/19f67f6e5d8cf222c6642b92cc489deb9e7b58a0))
* stable IDs and names for every plugin element ([#34](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/34)) ([64b7af4](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/64b7af48a501acd1b8566124baae42f776633077))


### Code Refactoring

* element IDs name the element, state goes into data-mm-state ([#38](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/38)) ([f75d44f](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/f75d44f88a0251586c3187156be715f99b6bfe2c))
* style the collapse button from data-mm-state ([#41](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/41)) ([728ca16](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/728ca16ecb0a8d56267ef050af02a9741353cca7))

## [1.4.0](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/compare/1.3.1...1.4.0) (2026-11-09)


### Features

* smooth camera for fit, zoom and layout switches ([#30](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/30)) ([0075f59](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/0075f599185d261470abc49b8a477a3abd40f3b4))

## [1.3.1](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/compare/1.3.0...1.3.1) (2026-11-09)


### Bug Fixes

* fit the map to view after drilling out ([#28](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/28)) ([63d8ab1](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/63d8ab15cc2a9643625c73ab04a687acc5f10684))

## [1.3.0](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/compare/1.2.0...1.3.0) (2026-11-09)


### Features

* drill down into a branch ([#26](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/26)) ([0b74a75](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/0b74a752a862d1cd5bd6537a90c3370162a5ece9))

## [1.2.0](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/compare/1.1.1...1.2.0) (2026-11-09)


### Features

* highlight both ends of a link line when it is clicked ([#22](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/22)) ([953e432](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/953e4323a4fbf840452a8fb4f496a175c74fff56))

## [1.1.1](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/compare/1.1.0...1.1.1) (2026-11-09)


### Bug Fixes

* align node text towards its parent ([#17](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/17)) ([71a9a13](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/71a9a132577825695123a4c5685a2da73ab16643))
* harden the layout and colour theme switcher ([#16](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/16)) ([b1ec664](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/b1ec664eb145558a34ebdf6b554477a03cbeb2b0))


### Documentation

* host screenshots in secret gists instead of the repository ([#15](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/15)) ([1c4baed](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/1c4baed9998b7cb0262356f1fee400c365b8cd20))

## [1.1.0](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/compare/1.0.0...1.1.0) (2026-11-09)


### Features

* switch layout and colour theme from the control bar ([#9](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/9)) ([f52fb45](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/f52fb458af208a23a27f4ca562cd6b80f31a4120))


### Documentation

* screenshots in issues and pull requests ([#10](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/10)) ([70f340a](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/70f340afeccf481d55fc0fa0981e2f4386590aa6))

## [1.0.0](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/compare/0.1.0...1.0.0) (2026-11-09)


### Features

* collapse and expand branches, pan, zoom with presets, fit to view and full screen ([19aeb0f](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/19aeb0f1974fef1bd9e5fc0106abb2c07e277fd8))
* dashed lines for links to headings and blocks in the same note, and dividers between sections ([19aeb0f](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/19aeb0f1974fef1bd9e5fc0106abb2c07e277fd8))
* English and German ([19aeb0f](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/19aeb0f1974fef1bd9e5fc0106abb2c07e277fd8))
* first public release ([19aeb0f](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/19aeb0f1974fef1bd9e5fc0106abb2c07e277fd8))
* headings, lists and blocks become nodes, rendered like reading view, including code, tables, math, callouts, Mermaid and images ([19aeb0f](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/19aeb0f1974fef1bd9e5fc0106abb2c07e277fd8))
* show any Markdown note as a live mind map that follows the note while you write ([19aeb0f](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/19aeb0f1974fef1bd9e5fc0106abb2c07e277fd8))
* six layouts and colour themes per branch, set per note via frontmatter or as defaults in the settings ([19aeb0f](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/19aeb0f1974fef1bd9e5fc0106abb2c07e277fd8))


### Continuous Integration

* pin runners to ubuntu-26.04 ([#3](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/issues/3)) ([745e473](https://github.com/KingOfKalk/obsidian-plugin-mind-mapper/commit/745e4736a0678d40d688eff06cd4813ad65d38d1))
