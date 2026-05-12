# Workspaces

Named groupings of projects inside a tenant, with per-user visibility and drag-and-drop management.

---

## Why workspaces exist

Opsiforce used to be flat: every project in a tenant was visible to every user with access to that tenant. This worked for small teams but broke down quickly once a single tenant housed projects for multiple customers or internal groups.

Workspaces let users segment projects inside a tenant. Each user gets one **private** workspace of their own that nobody else can see, plus visibility into any **shared** workspaces they've been added to, plus the tenant-wide **Public** bucket.

---

## The three kinds of grouping

```
Tenant
  │
  ├─ Personal       (Alice's private workspace — only Alice sees this)
  │    ├─ project-1
  │    └─ project-2
  │
  ├─ Personal       (Bob's private workspace — only Bob sees this)
  │    └─ project-3
  │
  ├─ Customer apps  (shared workspace — Alice + Bob are members)
  │    └─ project-4
  │
  ├─ Internal tools (shared workspace — Bob only)
  │    └─ project-5
  │
  └─ Public         (every project that lives at the tenant root)
       └─ project-6
```

- **Private workspace** — exactly one per (user, tenant). Created automatically the first time a user authenticates into a tenant; backfilled by migration `0023_add-private-workspaces` for everyone who already existed. Owned by the user, not visible to anyone else (admins included). Can't be renamed, deleted, or have members added — it's an immutable bucket the system maintains.
- **Shared workspace** — what "workspace" meant before this change. Created and managed by admins via the sidebar settings gear or `/settings/workspaces` page. Has an explicit member list; only members see it.
- **Public** — projects with no workspace (`projects.workspace_id IS NULL`). Visible to everyone in the tenant. Admin-only creation. This is the same surface previously labelled "Unassigned" — same data, new name.

---

## Trust tiers

Three levels of access, granted via Keycloak groups:

**Admin** — can create, rename, and delete shared workspaces. Manages the member list of any shared workspace. Creates projects in Public. Can see and use every shared workspace and every Public project in the tenant. Does **not** see other users' private workspaces — that line is hard.

**Power user** — can drag a project between shared workspaces they're a member of. Can't create shared workspaces; can't manage members; can't create projects in Public (admin-only creation), but can see and use existing Public projects.

**Member** — can see and use projects in shared workspaces they belong to plus their own private workspace and the Public bucket. Can create new projects inside any workspace they have access to, including their own private one.

---

## Visibility rules

Everything is enforced on the server. The UI mirrors the same rules, but the backend is the source of truth.

| Viewer | Their own private | Other users' private | Shared they belong to | Shared they don't | Public |
|---|---|---|---|---|---|
| Admin | Visible | **Invisible** | Visible | Visible | Visible |
| Power user / member | Visible | Invisible | Visible | Invisible | Visible |

"Invisible" means a workspace and its projects don't appear in listings at all, and any attempt to open one by direct link returns 404. We don't leak even the existence of workspaces a user can't access — including across the admin boundary for private workspaces.

---

## Creation flows

There are **three** entry points for new projects, each tuned to a different intent:

**Top "+" in the sidebar** — opens a dropdown menu (Google-Drive-style):
- "New workspace" (admin only) — opens the create-workspace dialog.
- "New project ▶ \<agent\>" — submenu listing every row from the `agents` table. Clicking an agent creates a project in **the user's private workspace** with that agent. This is the primary creation path for everyone.

**Per-workspace "+"** on shared workspace rows — creates a project inside that workspace with the default agent. No agent picker; if you need a specific agent, use the top "+".

**Public group "+"** — admin only, creates a project in Public with the default agent.

The home page's "Apply" CTA always creates a project in the caller's private workspace with the default agent — same destination as the top "+" with the default agent. There's no longer any smart-pick logic; everyone has a deterministic default.

---

## Project moves

Drag a project row in the sidebar to move it between groups. Permission rules:

- **Move into or out of your own private workspace** — free, no extra permission required. Filing work into your private space and sharing it back into a shared workspace are both basic actions.
- **Move between two shared workspaces** — requires the `move-projects-between-workspaces` permission, and you must be a member of the target.
- **Move into or out of Public** — admin only (`manage-workspaces`).
- **Move into another user's private workspace** — impossible. The target workspace simply doesn't exist from your point of view, so the drop returns 404.

If a user doesn't have permission to move projects in a given direction, the row remains draggable but the drop is rejected server-side and the UI surfaces the error.

---

## Settings UI

Workspace management happens in two places, both gated to admins, and **only for shared workspaces**:

**Sidebar gear icon** — hover-visible next to each shared workspace. Opens the settings dialog directly. Hidden on private workspaces entirely.

**`/settings/workspaces` route** — full list view with a "New workspace" button. Each row has a "Configure" button. Private workspaces are filtered out of this list too (admins manage their own private workspace by simply using it — there's nothing to configure).

The dialog has three tabs: General (name, description, delete), Members (add/remove users), Projects (move projects in or out of this workspace).

---

## Sidebar behavior

Workspaces render as collapsible groups in the order the user prefers (drag the grab handle to reorder). The private workspace is just another workspace row in the list — fully draggable, included in `user_workspace_preferences.workspace_order` like any other, so a user who wants their Personal at the top puts it there. The system doesn't pin it.

**Fold state is per-user, per-device.** Local to the browser, not synced.

**Workspace order is per-user, synced.** Same user logs in on a different device, same order.

When a user types in the sidebar search, any workspace containing a matching project auto-expands for the duration of the search.

---

## User directory

The member picker (in shared-workspace settings) lists users from the current tenant. A user only appears once they've logged in to opsiforce at least once — first-login creates the `users` row and provisions their private workspace. The directory isn't pre-populated from Keycloak.

---

## What happens on deletes

**Delete a shared workspace** → its member list is cleared. Its projects fall out into Public (`projects.workspace_id` set to NULL). Nothing is hard-deleted beyond the workspace itself.

**Try to delete a private workspace** → rejected. Private workspaces are immutable through the API; the only path that removes one is `ON DELETE CASCADE` triggered by deleting the owner user (via Keycloak sync or direct DB op).

**Remove a user from a shared workspace** → that user immediately loses visibility of the workspace and its projects.

**Delete a user** (Postgres CASCADE chain from `users`) → their private workspace cascades out via `workspaces.owner_id → users.id`. Projects inside fall to Public (workspace_id set NULL by the existing FK on projects). Per-user preferences are removed.

---

## Related docs

- [Permissions](./permissions.md) — full detail on Keycloak groups and the workspace-related permissions.
- [Overview](./overview.md) — high-level opsiforce architecture.
- [Agents](./agents.md) — per-project agent association and pod startup.
