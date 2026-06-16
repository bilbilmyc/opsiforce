# Operational views live in an "Admin" section, in their own aggregator module — not folded into `pod`

Status: accepted

The platform already has **Settings**: a permission-gated, left-rail surface for *configuring* an Organization (Workspaces, Users, Environments, Integrations, Defaults, Billing). The first operational view — **Pods** — is a different kind of thing: it shows the Organization's *running* state, not its stored configuration. Rather than leave Pods as a loose avatar-dropdown item (and grow the dropdown one entry at a time as more operational views appear), we introduce **Admin**: a sibling destination to Settings, reached the same way, built on the same left rail, holding the operational views. The dividing line is *configure vs operate*: a page that changes stored configuration belongs to Settings; a page that shows or acts on what is running now belongs to Admin. Admin's first (and currently only) page is Pods; Schedules stays a standalone dropdown item for now and may join later.

## Why the rail is shared, not duplicated

Settings already owns a rail component, a tab-config shape, and a layout route that redirects to the first permitted tab. Admin needs the identical behaviour. We generalize the Settings rail into one shared rail driven by a tab config, and both sections render it. Two rails would drift; one rail keeps the two sections visually and behaviourally identical for free.

## Why a separate backend module instead of reusing `pod`

The operational view is an **aggregator**: it joins the Kubernetes pod informer (owned by `PodModule`) with the Redis keep-alive (owned by `TimeoutModule`). `TimeoutModule` already depends on `PodModule`. Folding the view into `PodModule` would make `PodModule` depend on `TimeoutModule` in return — a circular module dependency resolvable only with `forwardRef`, a known NestJS smell, and it would mix read-only view code into the pod lifecycle/informer module. So the view keeps its own module that imports both. The original mistake was naming that module `pods` (plural), one letter from the lifecycle module `pod` (singular) — genuinely confusing. We name it `admin` instead, mirroring the product section it serves; `pod` stays exactly what it was (pod lifecycle and the informer cache). The HTTP route is unchanged (`GET /api/pods`) — a resource name, independent of the module that serves it.

## Consequences

- Pods moves from the top-level route `/pods` to `/admin/pods`; the avatar dropdown gains an **Admin** entry (gated by having any permitted Admin page — today, `can_view_pods`) in place of the direct Pods item.
- Adding a future operational view is config-only on the frontend (a new entry in the Admin tab config) and a new controller/service in the `admin` module on the backend.
- The configure-vs-operate split is recorded in [CONTEXT.md](../../CONTEXT.md) under **Admin** and **Settings**; it is the test for where any future page belongs.
- This is the same authority model as [ADR-0013](0013-pods-view-reads-live-keepalive-from-redis.md): Admin observes running state; it does not become a new source of truth.
