import { createMemo } from 'solid-js';
import type { Project } from './client';
import { useCurrentUser } from './user';
import { useTenantConfig } from './tenant-config';
import { useCreateUnassignedProject } from './projects';
import { useCreateProjectInWorkspace, useWorkspaces } from './workspaces';

export type ProjectTarget = { kind: 'workspace'; workspaceId: string } | { kind: 'public' } | { kind: 'unknown' };

export function usePrivateWorkspacesDisabled() {
  const tenantConfig = useTenantConfig();
  return () => tenantConfig.data?.privateWorkspaceEnabled === false;
}

export function useDefaultProjectTarget() {
  const currentUser = useCurrentUser();
  const tenantConfig = useTenantConfig();
  const workspaces = useWorkspaces();

  return createMemo<ProjectTarget>(() => {
    const config = tenantConfig.data;
    if (!config) return { kind: 'unknown' };
    if (!config.privateWorkspaceEnabled) return { kind: 'public' };

    const userId = currentUser.data?.id;
    if (!userId) return { kind: 'unknown' };

    const own = (workspaces.data ?? []).find((w) => w.type === 'private' && w.ownerId === userId);
    return own ? { kind: 'workspace', workspaceId: own.id } : { kind: 'unknown' };
  });
}

export function useCreateDefaultProject() {
  const target = useDefaultProjectTarget();
  const createInWorkspace = useCreateProjectInWorkspace();
  const createInPublic = useCreateUnassignedProject();

  const isPending = () => createInWorkspace.isPending || createInPublic.isPending;
  const hasDestination = () => target().kind !== 'unknown';

  const createProject = (dto?: { agentId?: string }): Promise<Project> => {
    const destination = target();
    if (destination.kind === 'unknown') return Promise.reject(new Error('No destination for new projects'));
    if (destination.kind === 'public') return createInPublic.mutateAsync(dto);
    return createInWorkspace.mutateAsync({ workspaceId: destination.workspaceId, dto });
  };

  return { target, createProject, hasDestination, isPending };
}
