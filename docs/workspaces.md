# Workspaces

Named groupings of projects inside a tenant, with per-user visibility and drag-and-drop management.

---

## Why workspaces exist

Opsiforce used to be flat: every project in a tenant was visible to every user with access to that tenant. This worked for small teams but broke down quickly once a single tenant housed projects for multiple customers or internal groups.

Workspaces let admins segment projects inside a tenant, and control which users can see which segment. A single "acme" tenant might now contain:

- **Customer apps** (visible to customer-success + engineering)
- **Internal tools** (visible to ops only)
- **Unassigned** (admin-only scratch space)

A user who isn't a member of a workspace doesn't see the workspace, and doesn't see any of its projects. Projects are never orphaned — they live in exactly one workspace, or in the admin-only Unassigned bucket.

---

## The hierarchy

```
Tenant
  │
  ├─ Workspace A ── members: alice, bob
  │    ├─ project-1
  │    └─ project-2
  │
  ├─ Workspace B ── members: alice, carol
  │    └─ project-3
  │
  └─ Unassigned (admin-only)
       └─ legacy-project
```

- **Workspaces** live inside exactly one tenant.
- **Projects** live inside exactly one workspace, or in Unassigned.
- **Membership** is a flat list — no roles within a workspace. Either you're in, or you aren't.
- **Unassigned** isn't a real workspace. It's what shows in the sidebar for admins to see projects that haven't been filed anywhere.

---

## Trust tiers

Three levels of access, granted via Keycloak groups:

**Admin** — can create, rename, and delete workspaces. Manages the member list of any workspace. Sees Unassigned. Can move projects to or from Unassigned.

**Power user** — can drag a project from one workspace to another, as long as they're a member of both. Can't manage workspaces themselves, can't see Unassigned.

**Member** — can see and use projects in workspaces they belong to. Can create new projects inside those workspaces. Can't move projects out.

A given user is usually just one tier, but the tiers stack — an admin implicitly has power-user and member abilities too.

---

## Visibility rules

Everything is enforced on the server. The interface mirrors the same rules, but the backend is the source of truth.

| Viewer type | Workspaces they belong to | Workspaces they don't | Unassigned |
|---|---|---|---|
| Admin | Visible | Visible | Visible |
| Power user / member | Visible | Invisible | Invisible |

"Invisible" means a workspace and its projects don't appear in listings at all, and any attempt to open one by direct link behaves as if it doesn't exist. This is intentional — we don't want to leak even the existence of workspaces a user can't access.

Project listings are pre-filtered the same way: non-admins only ever see projects that belong to a workspace they're a member of.

---

## Settings UI

Workspace management happens in two places, both gated to admins:

**Sidebar gear icon** (hover-visible next to each workspace) — opens a settings dialog directly. This is the fast path for day-to-day use.

**`/settings/workspaces` route** — a full list view with a "New workspace" button. Useful for onboarding and bulk review. Each row has a "Configure" button that opens the same dialog.

The dialog has three tabs:

- **General** — name, description, and a "Delete workspace" action.
- **Members** — add or remove users. Users appear in the picker only after they've logged in at least once.
- **Projects** — add existing (Unassigned) projects to this workspace, or remove them back to Unassigned.

---

## Sidebar behavior

Workspaces render as collapsible groups. Each group shows its name, a count of projects, and — on hover — a gear icon (admin only) plus a "+" button.

**Fold state is per-user, per-device.** If an admin collapses "Internal tools" on their laptop, it stays collapsed across reloads, but doesn't affect their phone or anyone else's view.

**Workspace order is per-user, synced.** If a user drags "Customer apps" to the top, that order sticks on every device they log in from. Two users can see the same workspaces in different orders.

When a user searches, any workspace containing a matching project auto-expands for the duration of the search.

---

## Drag and drop

The sidebar supports two kinds of drag:

**Reorder workspaces.** A grab-dots handle appears on hover at the left of each workspace row. Dragging it up or down reorders workspaces for the current user (nobody else sees the change). The reorder is intentionally locked behind a handle — clicking the row itself folds/unfolds, which is the much more frequent action, and we don't want accidental drags when users toggle quickly.

**Move projects.** Project rows are whole-row draggable. A short activation distance keeps single-click navigation working normally, but holding and moving triggers a drag. Projects can be dropped:

- Onto another workspace → project moves into it.
- Onto Unassigned (admin only) → project becomes unassigned.
- From Unassigned onto a workspace (admin only) → project gains a home.

If a user doesn't have permission to move projects, the rows simply aren't draggable — no grab cursor, no drag response. The backend also rejects forged attempts.

---

## Project creation flows

Two distinct "+" buttons, each with clear semantics:

**Top "+" (sidebar header, home-page form)** — admin-only. Creates an **unassigned** project. Non-admins never see this button because they can't see unassigned projects, so giving them a button that creates invisible work would be confusing.

**"+" on each workspace row** — visible to any member of that workspace. Creates a project **inside** that workspace. This is the primary creation path for non-admin users.

The home page's "Apply" button smart-picks the right flow:

- Admin → creates unassigned (matching the top "+").
- Non-admin with exactly one workspace → creates inside it automatically.
- Non-admin with multiple workspaces → the button disables with a tooltip directing them to the sidebar, because it can't guess which workspace they meant.

---

## User directory

The member picker lists users from the current tenant. A user only appears once they've logged in to opsiforce at least once — we don't pre-populate the directory from Keycloak.

**Implication**: an admin adding a brand-new hire to a workspace on the hire's first day may not find them in the picker until the hire has loaded the app. The member tab surfaces this with an info tooltip, but it's worth knowing when onboarding.

---

## What happens when things get deleted

**Delete a workspace** → its member list is cleared. Its projects stay in the tenant, but their workspace association is removed, so they fall into Unassigned (admin-only-visible). Nothing is hard-deleted beyond the workspace itself.

**Remove a user from a workspace** → that user immediately loses visibility of the workspace and its projects. No grace period, no delay. If they had a tab open, their next action there returns a "not found" response.

**Delete a user** (Keycloak-side) → all their memberships and per-user preferences vanish. Any workspace order they had configured is gone; other users are unaffected.

---

## Related docs

- [Permissions](./permissions.md) — full detail on Keycloak groups and the two workspace-related permissions.
- [Overview](./overview.md) — high-level opsiforce architecture.
