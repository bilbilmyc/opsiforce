import { privateConfig } from '~/private-loader';

export interface AppConfig {
  managedAuthLabel: string;
  managedAuthDescription: string;
  managedAuthEnabled: boolean;
}

const defaults: AppConfig = {
  managedAuthLabel: 'Single sign-on',
  managedAuthDescription: 'Sign in via the identity provider configured by this platform — no per-app setup needed.',
  managedAuthEnabled: false,
};

export const config: AppConfig = { ...defaults, ...privateConfig };
