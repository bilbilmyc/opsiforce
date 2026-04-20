import { workspaces } from "../../db/schema"

type WorkspaceRow = typeof workspaces.$inferSelect

export interface WorkspaceResponse extends WorkspaceRow {
  memberCount: number
  projectCount: number
}

export interface CreateWorkspaceDto {
  name: string
  description?: string | null
}

export interface UpdateWorkspaceDto {
  name?: string
  description?: string | null
}

export interface AddWorkspaceMemberDto {
  userId: string
}
