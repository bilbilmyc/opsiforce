import { createSignal } from 'solid-js';
import { translateMessage, type Locale, type Parameters } from './translate';

export const LANGUAGE_STORAGE_KEY = 'opsiforce.language';

function initialLocale(): Locale {
  try { return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh-CN'; }
  catch { return 'zh-CN'; }
}

const [locale, updateLocale] = createSignal<Locale>(initialLocale());
export { locale };
export const intlLocale = () => locale() === 'zh-CN' ? 'zh-CN' : 'en-US';
export const t = (source: string, parameters?: Parameters) => translateMessage(locale(), source, parameters);

export function setLocale(value: Locale) {
  updateLocale(value);
  if (typeof document !== 'undefined') document.documentElement.lang = value;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, value); } catch { /* The switch still works if storage is blocked. */ }
}

if (typeof window !== 'undefined') {
  document.documentElement.lang = locale();
  window.addEventListener('storage', event => {
    if (event.key !== LANGUAGE_STORAGE_KEY) return;
    const value = event.newValue === 'en' ? 'en' : 'zh-CN';
    updateLocale(value);
    document.documentElement.lang = value;
  });
}
