import { language } from './mocks/obsidian';
import { loadLanguage } from '../src/i18n';

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
  toggleClass(this: HTMLElement, cls: string, value: boolean) {
    this.classList.toggle(cls, value);
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

/** jsdom has no ResizeObserver; tests trigger reports manually via `FakeResizeObserver.trigger`. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  connected = true;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
  }

  disconnect(): void {
    this.observed.clear();
    this.connected = false;
  }

  /** Reports the given elements (default: all observed). */
  static trigger(elements?: Element[]): void {
    for (const observer of FakeResizeObserver.instances) {
      const targets = (elements ?? [...observer.observed]).filter((el) =>
        observer.observed.has(el),
      );
      if (targets.length === 0) continue;
      const entries = targets.map((target) => ({ target }) as unknown as ResizeObserverEntry);
      observer.callback(entries, observer);
    }
  }
}

Object.assign(globalThis, { ResizeObserver: FakeResizeObserver, FakeResizeObserver });

// English unless a test picks another language (`language.code` + `loadLanguage`).
afterEach(() => {
  language.code = 'en';
  loadLanguage();
});
