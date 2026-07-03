import { privateConfig } from '../private-loader';

export interface AppConfig {
  catalogEnabled: boolean;
}

const defaults: AppConfig = {
  catalogEnabled: false,
};

export const config: AppConfig = { ...defaults, ...privateConfig };
