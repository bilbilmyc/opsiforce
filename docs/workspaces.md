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

- **Private workspace** — exactly one per (user, tenant). Created automatically the first time a user authenticates into a tenant; backfilled by migration `0023_add-private-workspaces` for everyone who already existed. Owned by the user, not visible to anyone else. Can't be renamed, deleted, or have members added — it's an immutable bucket the system maintains.
- **Shared workspace** — what "workspace" meant before this change. Created by users holding `can_manage_workspaces`; the creator is auto-added as a member. Has an explicit member list; only members see it in the sidebar. Manageable from `/settings/workspaces` by anyone holding `can_manage_workspaces`, even if they're not currently a member.
- **Public** — projects with no workspace (`projects.workspace_id IS NULL`). Visible to everyone in the tenant. Creation gated by `can_manage_workspaces`. This is the same surface previously labelled "Unassigned" — same data, new name.

---

## Permissions, not roles

There are no "roles" in opsiforce — only flat permission strings issued via Keycloak groups. The two permissions that govern workspace behavior are:

- **`can_manage_workspaces`** — an *action* permission. Required to create a shared workspace, rename or delete one, add/remove members, create projects in Public, or move projects into Public. Holding this permission does **not** automatically grant visibility into workspaces you're not a member of from the sidebar; it grants management access from `/settings/workspaces`.
- **`can_move_projects_between_workspaces`** — required to drag a project between two shared workspaces you're a member of, and to pull a Public project into a shared workspace you belong to. Not a visibility elevator.

Any other permission (`can_disable_project`, `can_restart_project`, etc.) gates a per-project action independently — none affect workspace visibility.

A Keycloak group called `opsiforce-admin` exists as a convenience bundle that grants every permission, but the backend never asks "is this user an admin" — it always checks specific permission strings. A user could be granted just `can_manage_workspaces` through some other group and they'd behave identically to a member of the admin bundle, for workspace purposes.

---

## Visibility rules — the sidebar

The sidebar shows workspaces you're a **member of**, full stop. Permissions don't widen this view; the only way to see a workspace in your sidebar is to be in its `workspace_members` row. The rule is uniform across every user:

| Viewer | Their own private | Other users' private | Shared they belong to | Shared they don't | Public |
|---|---|---|---|---|---|
| Every user | Visible | Invisible | Visible | **Invisible** | Visible |

The sidebar's project listing follows the same shape: projects in workspaces you don't belong to don't appear (your own private projects do, Public projects do).

"Invisible" means a workspace and its projects don't appear in listings at all, and any attempt to open one by direct link returns 404. We don't leak even the existence of workspaces you can't access.

---

## Visibility rules — the settings page

`/settings/workspaces` is the management surface, gated entirely by `can_manage_workspaces`. Users holding this permission see **every shared workspace in the tenant** there, including ones they aren't members of — so they can rename, delete, or join them. Private workspaces are never listed in settings (there's nothing to manage about a private workspace; it's immutable by design).

This is the only context in which `can_manage_workspaces` widens visibility. Everywhere else, the rule is membership.

---

## Creation flows

There are **three** entry points for new projects, each tuned to a different intent:

**Top "+" in the sidebar** — opens a dropdown menu (Google-Drive-style):
- "New workspace" (visible only to users holding `can_manage_workspaces`) — opens the create-workspace dialog. The creator is auto-added as a member of the new workspace.
- "New project ▶ \<agent\>" — submenu listing every row from the `agents` table. Clicking an agent creates a project in **the user's private workspace** with that agent. This is the primary creation path for everyone.

**Per-workspace "+"** on shared workspace rows — creates a project inside that workspace with the default agent. No agent picker; if you need a specific agent, use the top "+".

**Public group "+"** — gated by `can_manage_workspaces`. Creates a project in Public with the default agent.

The home page's "Apply" CTA always creates a project in the caller's private workspace with the default agent — same destination as the top "+" with the default agent. There's no longer any smart-pick logic; everyone has a deterministic default.

---

## Project moves

Drag a project row in the sidebar to move it between groups. Permission rules:

- **Move into or out of your own private workspace** — free, no extra permission required. Filing work into your private space and sharing it back into a shared workspace are both basic actions.
- **Move between two shared workspaces** — requires `can_move_projects_between_workspaces`, and you must be a member of the target.
- **Move OUT of Public** into a shared workspace — requires `can_move_projects_between_workspaces` + membership in the target. Anyone in the tenant can see Public projects, so "promoting" a Public project into a team workspace is a normal-user action.
- **Move INTO Public** — requires `can_manage_workspaces`. Pushing a project back into the tenant-wide bucket widens its audience, so it's gated.
- **Move into another user's private workspace** — impossible. The target workspace simply doesn't exist from your point of view, so the drop returns 404.

If a user doesn't have permission to move projects in a given direction, the row remains draggable but the drop is rejected server-side and the UI surfaces the error.

---

## Settings UI

Workspace management happens in two places, both gated to users holding `can_manage_workspaces`, and **only for shared workspaces**:

**Sidebar gear icon** — hover-visible next to each shared workspace **you're a member of**. Opens the settings dialog directly. Hidden on private workspaces entirely. Not shown for shared workspaces you're not a member of, even if you hold `can_manage_workspaces` (use `/settings/workspaces` for those).

**`/settings/workspaces` route** — full list view of every shared workspace in the tenant, plus a "New workspace" button. Each row has a "Configure" button. Private workspaces are filtered out of this list entirely.

The settings dialog has three tabs: General (name, description, delete), Members (add/remove users), Projects (move projects in or out of this workspace).

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

**Try to delete a private workspace** → rejected. Private workspaces are immutable through the API; the only path that removes one is `ON DELETE CASCADE` triggered by deleting the owner user.

**Remove a user from a shared workspace** → that user immediately loses visibility of the workspace and its projects.

**Delete a user** (Postgres CASCADE chain from `users`) → their private workspace cascades out via `workspaces.owner_id → users.id`. Projects inside fall to Public (workspace_id set NULL by the existing FK on projects). Per-user preferences are removed.

---

## Related docs

- [Permissions](./permissions.md) — full detail on Keycloak groups and the permission strings referenced above.
- [Overview](./overview.md) — high-level opsiforce architecture.
- [Agents](./agents.md) — per-project agent association and pod startup.
