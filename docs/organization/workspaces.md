# Workspaces

> How projects are grouped and made visible inside an Organization, and the membership-vs-permission rules that govern who sees what. Read this before touching project visibility or the sidebar.

Opsiforce used to be flat: every project in a tenant was visible to everyone with access to it. Workspaces segment projects so a single tenant can house separate customers or internal groups. There are three kinds of grouping:

- **Private workspace** — exactly one per (user, tenant), created automatically on first authentication. Owned by the user, invisible to everyone else, and immutable (can't be renamed, deleted, or have members added). The system maintains it.
- **Shared workspace** — what "workspace" meant before this feature. Created by holders of `can_manage_workspaces` (the creator is auto-added as a member); has an explicit member list; only members see it.
- **Public** — projects with no workspace (`workspace_id IS NULL`), visible to everyone in the tenant. (This is the surface previously labelled "Unassigned" — same data, clearer name.)

## Visibility is membership, not permission

The load-bearing rule: **the sidebar shows the workspaces you are a member of, full stop.** Permissions do not widen the sidebar — the only way a workspace appears there is a `workspace_members` row (your own private workspace and Public always show). "Invisible" is total: a non-member can't see a workspace or its projects in any listing, and opening one by direct link returns 404 — we don't leak even the existence of workspaces you can't access.

The **one** exception is the management surface `/settings/workspaces`, gated by `can_manage_workspaces`: there a holder sees *every* shared workspace in the tenant (to rename, delete, or join), even ones they aren't a member of. Private workspaces are never listed there — there's nothing to manage.

## The two workspace permissions

Workspace behaviour turns on two permissions (their Keycloak→backend flow is in [Permissions](permissions.md); the *semantics* live here):

- **`can_manage_workspaces`** — an action permission: create/rename/delete shared workspaces, manage members, create projects in Public, and move projects *into* Public. It grants management access via `/settings/workspaces`; it does **not** grant sidebar visibility into workspaces you aren't a member of.
- **`can_move_projects_between_workspaces`** — move a project between two shared workspaces you belong to, or pull a Public project into one. Not a visibility elevator.

Moving into or out of *your own* private workspace needs no permission. Moving *into* Public (widening the audience) needs `can_manage_workspaces`. Moving into another user's private workspace is impossible — that workspace doesn't exist from your point of view, so the drop 404s. Permission-less moves leave the row draggable but the drop is rejected server-side with a surfaced error.

## On deletes

Deleting a shared workspace clears its members and drops its projects into Public (nothing else is hard-deleted). Deleting a *user* cascades their private workspace away and drops its projects into Public. A private workspace can't be deleted through the API — only the owner-user cascade removes it.

## See also

- [Permissions](permissions.md) — how the two permission strings flow from Keycloak.
- [Settings](settings.md) — the `/settings/workspaces` management surface.
- Code: `backend/db/schema.ts` (`workspaces`, `workspace_members`; private-workspace backfill in `0023_add-private-workspaces`), `backend/src/project/` (move/visibility enforcement), `frontend/src/pages/workspaces.tsx`.
