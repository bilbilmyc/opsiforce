import { config as privateConfig } from '../private/config';

export interface AppConfig {
  catalogEnabled: boolean;
}

const defaults: AppConfig = {
  catalogEnabled: false,
};

export const config: AppConfig = { ...defaults, ...privateConfig };
