# Admin

> The Organization's operational surface — where a member observes and operates running state, as opposed to configuring it. The sibling of [Settings](settings.md).

**Admin** is reached from the avatar dropdown and built on the same left-rail layout as [Settings](settings.md): one page per area, each independently gated. The dividing line, worth keeping, decides where any future page goes: **if a page shows or acts on what is running right now, it belongs in Admin; if it changes stored configuration, it belongs in Settings.** (The rule is recorded in [`../CONTEXT.md`](../../CONTEXT.md) under Admin/Settings; the rationale for introducing Admin as its own surface and its own backend module — rather than growing the dropdown or folding operational code into the pod-lifecycle module — is [ADR-0014](../adr/0014-admin-section-and-operational-view-module.md).)

## Pages

- **[Pods](../runtime/pods.md)** — read-only view of the Organization's running environment pods and their keep-alive. Currently the only Admin page.

Admin is built to grow: a new operational view is a new entry in the Admin rail config (frontend) plus a new controller in the `admin` module (backend) — no new navigational plumbing. The rail itself is the same shared component Settings uses, driven by a per-section tab config; the layout route redirects to the first permitted page, and the dropdown entry appears only when the member can see at least one Admin page.

## See also

- [Settings](settings.md) — the configuration sibling.
- [Pods](../runtime/pods.md) — the current page ([ADR-0013](../adr/0013-pods-view-reads-live-keepalive-from-redis.md)).
- Code: `frontend/src/routes/admin/`, `frontend/src/components/section-rail.tsx`, `frontend/src/constants/admin-tabs.tsx`; backend operational endpoints in `backend/src/admin/`.
