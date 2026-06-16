import type { Component } from 'solid-js';

export interface RailTab {
  to: string;
  label: string;
  description: string;
  group: string;
  icon: Component<{ class?: string }>;
  isPermitted: (hasPermission: (permission: string) => boolean) => boolean;
}

export function firstPermittedRailTab(
  tabs: RailTab[],
  hasPermission: (permission: string) => boolean
): RailTab | undefined {
  return tabs.find((tab) => tab.isPermitted(hasPermission));
}

export function railTabForPath(tabs: RailTab[], pathname: string): RailTab | undefined {
  return tabs.find((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`));
}
