import type { DynamicModule, Type } from '@nestjs/common';
import path from 'node:path';
import type { AppConfig } from './config/config';

export interface PrivateModules {
  PRIVATE_MODULES: Array<Type | DynamicModule>;
}

export interface PrivateConfig {
  config: Partial<AppConfig>;
}

function isMissingOptionalModule(error: unknown, id: string): boolean {
  if (!(error instanceof Error)) return false;
  const maybeNodeError = error as NodeJS.ErrnoException & { pnpCode?: string };
  if (maybeNodeError.code !== 'MODULE_NOT_FOUND') return false;
  if (error.message.startsWith(`Cannot find module '${id}'`)) return true;

  const sourcePathLine = `Source path: ${path.resolve(__dirname, id)}`;
  return (
    maybeNodeError.pnpCode === 'QUALIFIED_PATH_RESOLUTION_FAILED' &&
    error.message.split('\n').some((line) => line === sourcePathLine)
  );
}

function optionalRequire(id: string): unknown {
  try {
    return require(id);
  } catch (error) {
    if (isMissingOptionalModule(error, id)) {
      return undefined;
    }
    throw error;
  }
}

const privateModules = optionalRequire('./private') as PrivateModules | undefined;
const configModule = optionalRequire('./private/config') as PrivateConfig | undefined;

export const PRIVATE_MODULES = privateModules?.PRIVATE_MODULES ?? [];
export const privateConfig = configModule?.config ?? {};
