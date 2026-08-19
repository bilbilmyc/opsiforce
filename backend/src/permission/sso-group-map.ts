export interface SsoGroupGrant {
  permissions?: string[];
  tenants?: string[];
}

export type SsoGroupMap = Record<string, SsoGroupGrant>;

function parseSsoGroupMap(raw: string | undefined): SsoGroupMap | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SsoGroupMap;
  } catch (err) {
    throw new Error(`SSO_GROUP_MAP is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
}

const ssoGroupMap = parseSsoGroupMap(process.env.SSO_GROUP_MAP);

export function splitGroupsHeader(groupsHeader: string): string[] {
  return groupsHeader
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

function collectGrants(groupsHeader: string, grant: keyof SsoGroupGrant): string[] | null {
  if (!ssoGroupMap) return null;
  const granted = new Set<string>();
  for (const group of splitGroupsHeader(groupsHeader)) {
    for (const value of ssoGroupMap[group]?.[grant] ?? []) {
      granted.add(value);
    }
  }
  return [...granted];
}

export function mapGroupsToPermissions(groupsHeader: string): string[] | null {
  return collectGrants(groupsHeader, 'permissions');
}

export function mapGroupsToTenants(groupsHeader: string): string[] | null {
  return collectGrants(groupsHeader, 'tenants');
}

export function getDefaultTenantName(): string | null {
  return process.env.DEFAULT_TENANT_NAME || null;
}
