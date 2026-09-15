import { t } from '~/i18n';
import type { Component } from 'solid-js';
import { FolderKanban, Layers, SlidersHorizontal, Wallet } from '~/components/icons';
import { Permission } from '~/constants/permissions';
import { PRIVATE_TABS } from '~/private-loader';

export type SettingsGroup = 'Access' | 'Configuration' | 'Billing';

export interface SettingsTab {
  to: string;
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
    get label() { return t("Workspaces"); },
    get description() { return t("Group and share projects."); },
    group: 'Access',
    icon: FolderKanban,
    isPermitted: (has) => has(Permission.manageWorkspaces),
  },
  {
    to: '/settings/environments',
    get label() { return t("Environments"); },
    get description() { return t("The publish targets every project can deploy to — Development, Production, and any you add."); },
    group: 'Configuration',
    icon: Layers,
    isPermitted: (has) => has(Permission.manageEnvironments),
  },
  ...PRIVATE_TABS,
  {
    to: '/settings/defaults',
    get label() { return t("Defaults"); },
    get description() { return t("Platform model default, timeouts and budgets."); },
    group: 'Configuration',
    icon: SlidersHorizontal,
    isPermitted: (has) => has(Permission.managePlatformDefaults) || has(Permission.manageTenantDefaults),
  },
  {
    to: '/settings/billing',
    get label() { return t("Billing"); },
    get description() { return t("This organization's spend and budget."); },
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
