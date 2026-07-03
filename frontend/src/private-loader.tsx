import { createEffect, type Component } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import type { AppConfig } from '~/config/config';
import type { SettingsTab } from '~/constants/settings-tabs';

export interface PrivateExports {
  PRIVATE_ROOT_COMPONENTS: Component[];
  PRIVATE_TABS: SettingsTab[];
  PRIVATE_ROUTES: Partial<Record<PrivateRoute, Component>>;
}

export interface PrivateConfig {
  config: Partial<AppConfig>;
}

export type PrivateRoute = '/settings/users' | '/settings/integrations';

const privateModules = import.meta.glob<PrivateExports>('./private/index.ts', { eager: true });
const privateConfigModules = import.meta.glob<PrivateConfig>('./private/config.ts', { eager: true });

const privateModule = Object.values(privateModules)[0];
const configModule = Object.values(privateConfigModules)[0];

const MissingPrivateRoutePage: Component = () => {
  const navigate = useNavigate();

  createEffect(() => {
    navigate({ to: '/settings', replace: true });
  });

  return null;
};

export const PRIVATE_TABS = privateModule?.PRIVATE_TABS ?? [];
export const PRIVATE_ROOT_COMPONENTS = privateModule?.PRIVATE_ROOT_COMPONENTS ?? [];
export const privateConfig = configModule?.config ?? {};

export function privateRouteComponent(route: PrivateRoute): Component {
  return privateModule?.PRIVATE_ROUTES?.[route] ?? MissingPrivateRoutePage;
}
