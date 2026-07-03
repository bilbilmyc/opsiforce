import { privateConfig } from '~/private-loader';

export interface AppConfig {
  catalogLabel: string;
  catalogEnabled: boolean;
  managedAuthLabel: string;
  managedAuthDescription: string;
  managedAuthEnabled: boolean;
}

const defaults: AppConfig = {
  catalogLabel: 'App catalog',
  catalogEnabled: false,
  managedAuthLabel: 'Single sign-on',
  managedAuthDescription: 'Sign in via the identity provider configured by this platform — no per-app setup needed.',
  managedAuthEnabled: false,
};

export const config: AppConfig = { ...defaults, ...privateConfig };
