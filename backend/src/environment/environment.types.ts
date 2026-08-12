import { environments } from '../../db/schema';

export const DEVELOPMENT_ENVIRONMENT_NAME = 'Development';
export const PRODUCTION_ENVIRONMENT_NAME = 'Production';

export const DEVELOPMENT_ENVIRONMENT_SLUG = 'dev';
export const PRODUCTION_ENVIRONMENT_SLUG = 'prod';

export const DEVELOPMENT_ENVIRONMENT_SHORT_NAME = 'DEV';
export const PRODUCTION_ENVIRONMENT_SHORT_NAME = 'PROD';

export type EnvironmentRow = typeof environments.$inferSelect;

export interface EnvironmentResponse {
  id: string;
  name: string;
  slug: string;
  shortName: string | null;
  description: string | null;
  color: string;
  isDefault: boolean;
  isProtected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEnvironmentDto {
  name?: string;
  slug?: string;
  shortName?: string | null;
  description?: string | null;
  color?: string;
}

export interface UpdateEnvironmentDto {
  name?: string;
  shortName?: string | null;
  description?: string | null;
  color?: string;
}
