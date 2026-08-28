# Workspaces

> How projects are grouped and made visible inside an Organization, and the membership-vs-permission rules that govern who sees what. Read this before touching project visibility or the sidebar.

Opsiforce used to be flat: every project in a tenant was visible to everyone with access to it. Workspaces segment projects so a single tenant can house separate customers or internal groups. There are three kinds of grouping:

- **Private workspace** — exactly one per (user, tenant), created automatically on first authentication. Owned by the user, invisible to everyone else, and immutable (can't be renamed, deleted, or have members added). The system maintains it. Can be switched off per tenant — see [Per-tenant toggle](#per-tenant-toggle).
- **Shared workspace** — what "workspace" meant before this feature. Created by holders of `can_manage_workspaces` (the creator is auto-added as a member); has an explicit member list; only members see it.
- **Public** — projects with no workspace (`workspace_id IS NULL`), visible to everyone in the tenant. (This is the surface previously labelled "Unassigned" — same data, clearer name.)

## Visibility is membership, not permission

The load-bearing rule: **the sidebar shows the workspaces you are a member of, full stop.** Permissions do not widen the sidebar — the only way a workspace appears there is a `workspace_members` row (your own private workspace and Public always show). "Invisible" is total: a non-member can't see a workspace or its projects in any listing, and opening one by direct link returns 404 — we don't leak even the existence of workspaces you can't access.

The **one** exception is the management surface `/settings/workspaces`, gated by `can_manage_workspaces`: there a holder sees *every* shared workspace in the tenant (to rename, delete, or join), even ones they aren't a member of. Private workspaces are never listed there — there's nothing to manage.

## The two workspace permissions

Workspace behaviour turns on two permissions (their Keycloak→backend flow is in [Permissions](permissions.md); the *semantics* live here):

- **`can_manage_workspaces`** — an action permission: create/rename/delete shared workspaces, manage members, create projects in Public, and move projects *into* Public. It grants management access via `/settings/workspaces`; it does **not** grant sidebar visibility into workspaces you aren't a member of. Creating in Public is the single conditional entry here — see [Per-tenant toggle](#per-tenant-toggle).
- **`can_move_projects_between_workspaces`** — move a project between two shared workspaces you belong to, or pull a Public project into one. Not a visibility elevator.

Moving into or out of *your own* private workspace needs no permission. Moving *into* Public (widening the audience) needs `can_manage_workspaces`. Moving into another user's private workspace is impossible — that workspace doesn't exist from your point of view, so the drop 404s. Permission-less moves leave the row draggable but the drop is rejected server-side with a surfaced error. Making an existing Public or shared-workspace project private is refused outright — `WorkspaceService.assignProject` throws, and the sidebar and the project's "Move to" menu both mirror that rule client-side so the attempt fails before the round trip. How the sidebar drag itself behaves — rows are draggable but never sortable, so the destination is always a workspace or folder zone — is [ADR-0029](../adr/0029-project-rows-are-draggables-not-sortables.md).

## Per-tenant toggle

Private workspaces are a per-tenant feature, controlled by `tenant_settings.private_workspace_enabled` (default **on**, so existing tenants keep the historical behaviour). Holders of `can_manage_workspaces` flip it from `/settings/workspaces` (`GET`/`PATCH /tenants/config`).

When a tenant switches it **off**:

- No private workspace is auto-provisioned on authentication (`ensurePrivateWorkspace` no-ops).
- Existing private workspaces are **hidden, not deleted**: they disappear from every workspace listing, direct links 404, and their projects vanish from project listings — including for their owners. Writes are closed too, not just reads: creating a project or folder in one, importing into one, or moving a project into one all 404, so no new work can accumulate somewhere invisible. Nothing is mutated, so flipping the flag back restores everything exactly as it was, and users who first signed in while it was off get their Personal workspace on their next request.
- **Public becomes the default destination for new projects.** The sidebar create button, the home-page prompt box, and the import dialog all target Public instead of the private workspace, and `POST /projects` drops its `can_manage_workspaces` requirement for that tenant so every member can use them. This is the one place the permission table below bends: creating a tenant-wide project normally needs `can_manage_workspaces`, but a tenant with no per-user workspace has nowhere else for its members to start. *Moving* an existing project into Public still needs the permission.

## On deletes

Deleting a shared workspace clears its members and drops its projects into Public (nothing else is hard-deleted). Deleting a *user* cascades their private workspace away and drops its projects into Public. A private workspace can't be deleted through the API — only the owner-user cascade removes it.

## See also

- [Permissions](permissions.md) — how the two permission strings flow from Keycloak.
- [Settings](settings.md) — the `/settings/workspaces` management surface.
- Code: `backend/db/schema.ts` (`workspaces`, `workspace_members`; private-workspace backfill in `0023_add-private-workspaces`), `backend/src/project/` (move/visibility enforcement), `frontend/src/pages/workspaces.tsx`.
