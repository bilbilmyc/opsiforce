import { Boxes } from '~/components/icons';
import { Permission } from '~/constants/permissions';
import { firstPermittedRailTab, railTabForPath, type RailTab } from '~/constants/section-rail';

export const ADMIN_GROUP_ORDER = ['Operations'] as const;

export const ADMIN_TABS: RailTab[] = [
  {
    to: '/admin/pods',
    label: 'Pods',
    description: 'Running environment pods and their live keep-alive activity.',
    group: 'Operations',
    icon: Boxes,
    isPermitted: (has) => has(Permission.viewPods),
  },
];

export function firstPermittedAdminTab(hasPermission: (permission: string) => boolean): RailTab | undefined {
  return firstPermittedRailTab(ADMIN_TABS, hasPermission);
}

export function adminTabForPath(pathname: string): RailTab | undefined {
  return railTabForPath(ADMIN_TABS, pathname);
}
