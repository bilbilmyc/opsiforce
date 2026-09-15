import { t } from '~/i18n';
import { Boxes, Cable, ChartColumn, Database } from '~/components/icons';
import { Permission } from '~/constants/permissions';
import { firstPermittedRailTab, railTabForPath, type RailTab } from '~/constants/section-rail';

export const ADMIN_GROUP_ORDER = ['Operations'] as const;

export const ADMIN_TABS: RailTab[] = [
  {
    to: '/admin/pods',
    get label() { return t("Pods"); },
    get description() { return t("Running environment pods and their live keep-alive activity."); },
    group: 'Operations',
    icon: Boxes,
    isPermitted: (has) => has(Permission.viewPods),
  },
  {
    to: '/admin/external-services/usage',
    get label() { return t("Usage"); },
    get description() { return t("Monthly inbound external-service message counts per organization."); },
    group: 'Operations',
    icon: ChartColumn,
    isPermitted: (has) => has(Permission.viewExternalServicesUsage),
  },
  {
    to: '/admin/external-services',
    get label() { return t("External services"); },
    get description() { return t("Platform-wide external-service resources, such as the registered WhatsApp channels."); },
    group: 'Operations',
    icon: Cable,
    isPermitted: (has) => has(Permission.manageExternalServices),
  },
  {
    to: '/admin/storage',
    get label() { return t("Storage"); },
    get description() { return t("Disk usage on the shared storage volume, across all organizations."); },
    group: 'Operations',
    icon: Database,
    isPermitted: (has) => has(Permission.viewPlatformStorage),
  },
];

export function firstPermittedAdminTab(hasPermission: (permission: string) => boolean): RailTab | undefined {
  return firstPermittedRailTab(ADMIN_TABS, hasPermission);
}

export function adminTabForPath(pathname: string): RailTab | undefined {
  return railTabForPath(ADMIN_TABS, pathname);
}
