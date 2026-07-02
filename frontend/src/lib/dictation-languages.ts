export interface DictationLanguage {
  code: string;
  name: string;
}

const languageDisplayNames = new Intl.DisplayNames(['en'], { type: 'language' });

export function dictationLanguageName(code: string): string {
  try {
    return languageDisplayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function toDictationLanguages(codes: readonly string[]): DictationLanguage[] {
  return codes
    .map((code) => ({ code, name: dictationLanguageName(code) }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}
