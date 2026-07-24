import { folders, workspaces } from '../../db/schema';
import type { CreateProjectDto } from '../project/project.types';

type WorkspaceRow = typeof workspaces.$inferSelect;

export interface WorkspaceResponse extends WorkspaceRow {
  memberCount: number;
  projectCount: number;
}

type FolderRow = typeof folders.$inferSelect;

export interface FolderResponse extends FolderRow {
  projectCount: number;
}

export interface WorkspaceAccessParams {
  workspaceId: string;
  tenantId: string;
  userId: string;
  canManageWorkspaces: boolean;
}

export interface CreateFolderDto {
  name: string;
}

export interface RenameFolderDto {
  name: string;
}

export interface MoveFolderDto {
  toWorkspaceId: string;
}

export interface AssignProjectDto {
  folderId?: string | null;
}

export interface CreateProjectInWorkspaceDto extends CreateProjectDto {
  folderId?: string | null;
}

export interface CreateWorkspaceDto {
  name: string;
  description?: string | null;
}

export interface UpdateWorkspaceDto {
  name?: string;
  description?: string | null;
}

export interface AddWorkspaceMemberDto {
  userId: string;
}
