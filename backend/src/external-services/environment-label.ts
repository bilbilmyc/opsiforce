export function environmentLabel(environmentName: string | null, isDefault: boolean): string {
  return environmentName ?? (isDefault ? 'Development' : 'Environment');
}
