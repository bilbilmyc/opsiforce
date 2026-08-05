import { Boxes, ChartColumn, MessageSquare } from '~/components/icons';
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
  {
    to: '/admin/external-services/usage',
    label: 'Usage',
    description: 'Monthly inbound external-service message counts per organization.',
    group: 'Operations',
    icon: ChartColumn,
    isPermitted: (has) => has(Permission.viewExternalServicesUsage),
  },
  {
    to: '/admin/whatsapp',
    label: 'WhatsApp',
    description: 'Whapi channels per organization and the chats allowlisted to each environment.',
    group: 'Operations',
    icon: MessageSquare,
    isPermitted: (has) => has(Permission.manageWhapiChannels),
  },
];

export function firstPermittedAdminTab(hasPermission: (permission: string) => boolean): RailTab | undefined {
  return firstPermittedRailTab(ADMIN_TABS, hasPermission);
}

export function adminTabForPath(pathname: string): RailTab | undefined {
  return railTabForPath(ADMIN_TABS, pathname);
}
