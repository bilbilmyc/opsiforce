import { chinese, englishAliases } from './messages';

const reverseChinese = Object.fromEntries(Object.entries(chinese).map(([en, zh]) => [zh, en]));

export type Locale = 'zh-CN' | 'en';
export type Parameters = Record<string, string | number | undefined | null>;

export function translateMessage(language: Locale, source: string, parameters: Parameters = {}): string {
  const key = source.trim();
  if (!key) return source;
  const english = englishAliases[key] ?? reverseChinese[key] ?? key;
  const translated = language === 'zh-CN' ? (chinese[key] ?? key) : english;
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  return leading + translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    parameters[name] === undefined || parameters[name] === null ? match : String(parameters[name])) + trailing;
}
