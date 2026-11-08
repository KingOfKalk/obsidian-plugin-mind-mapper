/** Polyfills for Obsidian's DOM helpers on HTMLElement (normally provided by the app). */
interface ElOptions {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
}

function createEl<K extends keyof HTMLElementTagNameMap>(
  this: HTMLElement,
  tag: K,
  options: ElOptions = {},
): HTMLElementTagNameMap[K] {
  const el = this.ownerDocument.createElement(tag);
  if (options.cls) el.className = options.cls;
  if (options.text !== undefined) el.textContent = options.text;
  for (const [name, value] of Object.entries(options.attr ?? {})) el.setAttribute(name, value);
  this.appendChild(el);
  return el;
}

Object.assign(HTMLElement.prototype, {
  createEl,
  createDiv(this: HTMLElement, options?: ElOptions) {
    return createEl.call(this, 'div', options);
  },
  empty(this: HTMLElement) {
    this.replaceChildren();
  },
  addClass(this: HTMLElement, ...classes: string[]) {
    this.classList.add(...classes);
  },
  removeClass(this: HTMLElement, ...classes: string[]) {
    this.classList.remove(...classes);
  },
  setText(this: HTMLElement, text: string) {
    this.textContent = text;
  },
});

Object.assign(Node.prototype, {
  instanceOf(this: Node, type: abstract new () => unknown) {
    return this instanceof type;
  },
});

Object.defineProperty(Node.prototype, 'doc', {
  configurable: true,
  get(this: Node) {
    return this.ownerDocument;
  },
});

Object.defineProperty(Node.prototype, 'win', {
  configurable: true,
  get(this: Node) {
    return this.ownerDocument?.defaultView;
  },
});

// jsdom has no pointer capture; Electron does.
Object.assign(Element.prototype, {
  setPointerCapture() {},
  releasePointerCapture() {},
  hasPointerCapture() {
    return false;
  },
});
