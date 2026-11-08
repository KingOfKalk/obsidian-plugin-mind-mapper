/** Polyfills for Obsidian's DOM helpers on HTMLElement (normally provided by the app). */
interface ElOptions {
  cls?: string;
  text?: string;
}

function createEl<K extends keyof HTMLElementTagNameMap>(
  this: HTMLElement,
  tag: K,
  options: ElOptions = {},
): HTMLElementTagNameMap[K] {
  const el = this.ownerDocument.createElement(tag);
  if (options.cls) el.className = options.cls;
  if (options.text !== undefined) el.textContent = options.text;
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
  setText(this: HTMLElement, text: string) {
    this.textContent = text;
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
