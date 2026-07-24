import { createSignal } from 'solid-js';

export const DndType = {
  Workspace: 'workspace',
  Project: 'project',
  Folder: 'folder',
} as const;
export type DndType = (typeof DndType)[keyof typeof DndType];

export const PUBLIC_ID = 'public';

const [activeDragType, setActiveDragType] = createSignal<DndType | null>(null);
export { activeDragType, setActiveDragType };

export const DROP_ZONE_PRIORITY = 1;
export const FOLDER_DROP_ZONE_PRIORITY = 2;

const FOLDER_GROUP_PREFIX = 'folder:';

export function folderDragId(folderId: string): string {
  return `folder-drag:${folderId}`;
}

export function folderMoveTargetId(workspaceId: string): string {
  return `folder-move:${workspaceId}`;
}

export function folderGroupId(workspaceId: string, folderId: string): string {
  return `${FOLDER_GROUP_PREFIX}${workspaceId}:${folderId}`;
}

export interface Placement {
  workspaceId: string | null;
  folderId: string | null;
}

export interface FolderDragData {
  folderId: string;
  workspaceId: string;
  folderName: string;
}

export function toFolderDragData(value: object): FolderDragData | null {
  if (!('folderId' in value) || !('workspaceId' in value) || !('folderName' in value)) return null;
  const { folderId, workspaceId, folderName } = value;
  if (typeof folderId !== 'string' || typeof workspaceId !== 'string' || typeof folderName !== 'string') return null;
  return { folderId, workspaceId, folderName };
}

export function readDropWorkspaceId(value: object): string | undefined {
  if (!('workspaceId' in value)) return undefined;
  return typeof value.workspaceId === 'string' ? value.workspaceId : undefined;
}

export function parseGroupId(groupId: string): Placement {
  if (groupId === PUBLIC_ID) return { workspaceId: null, folderId: null };
  if (groupId.startsWith(FOLDER_GROUP_PREFIX)) {
    const [workspaceId, folderId] = groupId.slice(FOLDER_GROUP_PREFIX.length).split(':');
    return { workspaceId, folderId };
  }
  return { workspaceId: groupId, folderId: null };
}
