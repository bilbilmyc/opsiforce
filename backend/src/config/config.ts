import { privateConfig } from '../private-loader';

export interface AppConfig {}

const defaults: AppConfig = {};

export const config: AppConfig = { ...defaults, ...privateConfig };
