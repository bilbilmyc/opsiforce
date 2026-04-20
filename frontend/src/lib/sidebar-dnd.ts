/**
 * Shared constants for the sidebar's drag-and-drop wiring so the strings don't
 * drift between the `<DragDropProvider>` handler and the sortable descendants.
 */
export const DndType = {
  Workspace: "workspace",
  Project: "project",
} as const
export type DndType = (typeof DndType)[keyof typeof DndType]

/**
 * Sentinel id for the "Unassigned" bucket. Used both as a DnD group name and
 * (in the drag-end handler) to translate group → workspaceId (null).
 */
export const UNASSIGNED_ID = "unassigned"
