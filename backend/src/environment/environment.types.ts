import { environments } from '../../db/schema';

export const DEVELOPMENT_ENVIRONMENT_NAME = 'Development';
export const PRODUCTION_ENVIRONMENT_NAME = 'Production';

export const DEVELOPMENT_ENVIRONMENT_SLUG = 'dev';
export const PRODUCTION_ENVIRONMENT_SLUG = 'prod';

export type EnvironmentRow = typeof environments.$inferSelect;

export interface EnvironmentResponse {
  id: string;
  name: string;
  slug: string;
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
  description?: string | null;
  color?: string;
}

export interface UpdateEnvironmentDto {
  name?: string;
  description?: string | null;
  color?: string;
}
