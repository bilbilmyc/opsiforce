import type { Component } from 'solid-js';
import { FolderKanban, Layers, Plug, SlidersHorizontal, Users, Wallet } from '~/components/icons';
import { Permission } from '~/constants/permissions';

export type SettingsTabPath =
  | '/settings/workspaces'
  | '/settings/users'
  | '/settings/environments'
  | '/settings/integrations'
  | '/settings/defaults'
  | '/settings/billing';

export type SettingsGroup = 'Access' | 'Configuration' | 'Billing';

export interface SettingsTab {
  to: SettingsTabPath;
  label: string;
  description: string;
  group: SettingsGroup;
  icon: Component<{ class?: string }>;
  isPermitted: (hasPermission: (permission: string) => boolean) => boolean;
}

export const SETTINGS_GROUP_ORDER: SettingsGroup[] = ['Access', 'Configuration', 'Billing'];

export const SETTINGS_TABS: SettingsTab[] = [
  {
    to: '/settings/workspaces',
    label: 'Workspaces',
    description: 'Group and share projects.',
    group: 'Access',
    icon: FolderKanban,
    isPermitted: (has) => has(Permission.manageWorkspaces),
  },
  {
    to: '/settings/users',
    label: 'Users',
    description: 'Manage members and their access.',
    group: 'Access',
    icon: Users,
    isPermitted: (has) => has(Permission.manageUsers),
  },
  {
    to: '/settings/environments',
    label: 'Environments',
    description: 'The publish targets every project can deploy to — Development, Production, and any you add.',
    group: 'Configuration',
    icon: Layers,
    isPermitted: (has) => has(Permission.manageEnvironments),
  },
  {
    to: '/settings/integrations',
    label: 'Integrations',
    description: 'Connect this organization to external systems.',
    group: 'Configuration',
    icon: Plug,
    isPermitted: (has) => has(Permission.manageMakaraIntegration),
  },
  {
    to: '/settings/defaults',
    label: 'Defaults',
    description: 'The starting timeouts and budgets new organizations and projects are created with.',
    group: 'Configuration',
    icon: SlidersHorizontal,
    isPermitted: (has) => has(Permission.managePlatformDefaults) || has(Permission.manageTenantDefaults),
  },
  {
    to: '/settings/billing',
    label: 'Billing',
    description: "This organization's spend and budget.",
    group: 'Billing',
    icon: Wallet,
    isPermitted: (has) => has(Permission.manageTenantBudget),
  },
];

export function firstPermittedSettingsTab(hasPermission: (permission: string) => boolean): SettingsTab | undefined {
  return SETTINGS_TABS.find((tab) => tab.isPermitted(hasPermission));
}

export function settingsTabForPath(pathname: string): SettingsTab | undefined {
  return SETTINGS_TABS.find((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`));
}
