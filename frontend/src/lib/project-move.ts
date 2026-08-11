import type { Workspace } from '~/api/client';

export const PRIVATE_MOVE_BLOCKED_MESSAGE = "Public and workspace projects can't be made private";

export function projectMoveBlockReason(params: {
  workspaces: Workspace[];
  fromWorkspaceId: string | null;
  toWorkspaceId: string | null;
}): string | null {
  const { workspaces, fromWorkspaceId, toWorkspaceId } = params;
  if (toWorkspaceId === null || toWorkspaceId === fromWorkspaceId) return null;
  const target = workspaces.find((w) => w.id === toWorkspaceId);
  return target?.type === 'private' ? PRIVATE_MOVE_BLOCKED_MESSAGE : null;
}
