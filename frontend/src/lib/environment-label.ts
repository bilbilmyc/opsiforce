export const ENVIRONMENT_SHORT_NAME_MAX_LENGTH = 5;
export const ENVIRONMENT_SHORT_NAME_PATTERN = /^[A-Za-z0-9]{2,5}$/;

export function isEnvironmentShortNameValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || ENVIRONMENT_SHORT_NAME_PATTERN.test(trimmed);
}

export function deriveEnvironmentShortName(source: string): string {
  const letters = source.replace(/[^a-z0-9]/gi, '');
  if (!letters) return '?';
  const label = letters.length <= ENVIRONMENT_SHORT_NAME_MAX_LENGTH ? letters : letters.slice(0, 3);
  return label.toUpperCase();
}

export function environmentBadgeLabel(env: { shortName: string | null; slug: string; name: string }): string {
  if (env.shortName) return env.shortName.toUpperCase();
  return deriveEnvironmentShortName(env.slug || env.name);
}
