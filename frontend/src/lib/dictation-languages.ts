import { intlLocale } from '~/i18n';
export interface DictationLanguage {
  code: string;
  name: string;
}

const displayNames = { 'en-US': new Intl.DisplayNames(['en'], { type: 'language' }), 'zh-CN': new Intl.DisplayNames(['zh-CN'], { type: 'language' }) };

export function dictationLanguageName(code: string): string {
  try {
    return displayNames[intlLocale()].of(code) ?? code;
  } catch {
    return code;
  }
}

export function toDictationLanguages(codes: readonly string[]): DictationLanguage[] {
  return codes
    .map((code) => ({ code, name: dictationLanguageName(code) }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}
