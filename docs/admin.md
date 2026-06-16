# Admin

**Admin** is the operational counterpart to [Settings](settings.md). Settings is where a member *configures* an Organization — its Workspaces, Users, Environments, Integrations, Defaults, and Billing. Admin is where a member *observes and operates* the same Organization's **running state**. Both are permission-gated destinations reached from the avatar dropdown, and both are built on the same left-rail layout: one page per area, each independently gated, so a member sees only the areas they may use.

The dividing line is simple and worth keeping: **if a page shows or acts on what is running right now, it belongs in Admin; if it changes stored configuration, it belongs in Settings.** That test is what decides where any future page goes (the rule is recorded in [CONTEXT.md](../CONTEXT.md) under the Admin and Settings terms, and the rationale for introducing Admin as a separate surface — rather than growing the dropdown or folding operational code into the pod lifecycle module — is in [ADR-0014](adr/0014-admin-section-and-operational-view-module.md)).

## Pages

- **[Pods](pods.md)** — the read-only view of the Organization's running environment pods: their status, age, Resources, configured timeouts, and live keep-alive activity. Currently the only Admin page.

Admin is deliberately ready to grow: adding another operational view (for example live sessions, runtime logs, or pod actions) is a new entry in the Admin rail config on the frontend and a new controller in the `admin` module on the backend — no new navigational plumbing.

## How it is built

Admin reuses the exact rail the Settings section uses. The rail is a single shared component driven by a per-section tab config (label, icon, target route, permission predicate); Settings and Admin each supply their own config and render the same rail. The Admin layout route redirects to the first page the member is permitted to see, and the avatar-dropdown "Admin" entry appears only when the member can see at least one Admin page.

Code: the layout and rail live at `frontend/src/routes/admin/`, `frontend/src/components/section-rail.tsx`, and `frontend/src/constants/admin-tabs.tsx`; the backend operational endpoints live in `backend/src/admin/`.
