import { getLanguage } from 'obsidian';
import { de } from './de';
import { en, type MessageKey, type Messages } from './en';

export type Locale = 'en' | 'de';

/** German for any `de` code (`de`, `de-DE`, …), English otherwise. */
export function localeFor(code: string): Locale {
  return /^de(?:[-_]|$)/i.test(code) ? 'de' : 'en';
}

const MESSAGES: Record<Locale, Messages> = { en, de };
let messages: Messages = en;

/** Obsidian needs a restart to change its language, so the plugin reads it once on load. */
export function loadLanguage(): void {
  messages = MESSAGES[localeFor(getLanguage())];
}

/** The UI text for `key`, with `{name}` placeholders filled from `params`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
