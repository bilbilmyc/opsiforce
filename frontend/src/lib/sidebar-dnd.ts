export const DndType = {
  Workspace: "workspace",
  Project: "project",
} as const;
export type DndType = (typeof DndType)[keyof typeof DndType];

export const PUBLIC_ID = "public";

export const DROP_ZONE_PRIORITY = 1;
