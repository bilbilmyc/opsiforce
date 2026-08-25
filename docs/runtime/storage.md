# Storage

> The read-only, platform-wide view of disk usage on the shared CephFS claim — how many bytes each Organization, Project, and ProjectEnvironment holds, and what the rest of the volume is doing. The first capability in Opsiforce that deliberately spans every Organization at once.

Every project's durable work lives on one shared 200 Gi claim (see [Persistence](persistence.md)); until now nothing counted it. Storage answers the operator's question "who is using the volume, and does it add up?" — a current-state snapshot, never a trend, and never an action.

## The accounting model

The measured leaf is the **ProjectEnvironment directory**. Everything inside it — the app's source and git history, its SQLite databases, uploaded files, and the redirected `.xdg` state — dissolves into that one number, because operators care about the environment's footprint rather than its internal composition. Environments roll up into their Project, Projects into their Organization.

Deleted work is still on disk for its seven-day recovery window, so each Organization also carries a **pending deletion** aggregate: the tombstoned directories that still name a tenant, counted as one bytes-plus-count figure rather than itemized rows nobody can act on. Those bytes are part of the Organization's total — an org's share of the volume is what it holds, recoverable or not.

What cannot be attributed to an Organization becomes a **bucket** at the volume root: the pending-pool projects waiting to be claimed, tenant-less tombstones (a pool project deleted before anyone claimed it — usually zero, which is itself worth seeing), orphaned directories that match no live row and no tombstone, and the export and import staging areas.

Finally the snapshot reconciles: **unaccounted** is the claim's own used bytes minus everything attributed above. It is signed on the wire — a negative residual means the filesystem's recursive statistics are lagging recent writes, which is a fact about freshness worth surfacing rather than clamping away.

## What the page shows

The Storage tab in the Admin UI leads with a segmented capacity bar: one coloured band per Organization, then the unattributed buckets as a single grey band, the unaccounted residual in amber, and whatever is left as free space — so "how full is the volume, and who dominates it" is answerable before expanding anything. Beneath it sits one expandable ledger drilling Organization → Project → ProjectEnvironment, each row carrying its size, its share of used bytes, and a proportional bar; the on-disk directory is a hover title rather than a column of UUIDs; an Organization that has deleted work also carries its pending-deletion aggregate as an outline badge on the group row, never as itemized tombstone rows. The buckets follow as a trailing section of the same table, with orphaned directories showing a count alongside their bytes so that one large orphan reads differently from a scattering of small leaks, and the unaccounted residual closes the table as a footer row that explains itself on hover.

The residual is the one place where the display deliberately differs from the payload: a negative residual is clamped to zero on screen while the signed value stays on the wire, because lag is worth diagnosing from the API and not worth alarming an operator with. When the quota check reports the claim as suspect the page says so instead of drawing untrustworthy proportions — the capacity figure is replaced by a warning, the bar and the share column renormalise to the composition of what was actually measured, and the residual is withheld rather than presented as fact.

## Where the numbers come from

Nothing is stored. The backend measures on demand at request time and memoizes the whole snapshot in-process for about thirty seconds — the same order as CephFS's own propagation lag, so there is nothing fresher to ask for and therefore no refresh button. The reasoning, and why there is no usage table and no scan job, is recorded in [ADR-0028](../adr/0028-storage-view-computes-usage-on-demand-from-cephfs-rstats.md).

Measurement itself sits behind a strategy chosen by `STORAGE_TYPE`, because the two environments answer the question by completely different means. On CephFS the filesystem already maintains recursive per-directory statistics, so a directory's size is a single constant-time read of its `ceph.dir.rbytes` extended attribute — the cost is one metadata-server round-trip regardless of how large the tree beneath it is. Node has no extended-attribute API, so the strategy shells out to `getfattr`, which is why the backend image carries Alpine's `attr` package. In hostPath development there are no such statistics, so the strategy walks the tree with bounded concurrency and adds up file sizes — affordable only because dev trees are tiny.

A directory that cannot be measured reports an explicit error rather than a fabricated zero, and that error propagates up the rollup so a partial snapshot never masquerades as a complete one. On CephFS there is deliberately no fallback to walking: a walk of a real tenant tree would be ruinously slow, and a slow honest failure is worse than a fast one. The single exception is a directory that no longer exists, which reads as zero in both modes — a row whose workspace has already been removed is empty, not unmeasurable.

Claim capacity and used bytes come from a quota-aware `statfs` on the mount. On CephFS that reports the claim's provisioned size; under hostPath it would report the node's whole filesystem, so the hostPath strategy declares its quota absent and the page falls back to the capacity-unverified rendering — in development only the measured directory numbers are presented as fact.

That quota-awareness is a dependency worth watching, because it fails silently: if the CephFS quota is ever absent, `statfs` reports the whole cluster instead of the claim, and every capacity figure and residual in the view is quietly wrong rather than visibly broken. So the snapshot asks the filesystem directly what limit it is enforcing, by reading the quota extended attribute on the mount root. A quota of zero, or no such attribute at all, *is* the failure — reported as suspect on the wire and in the logs rather than presented as fact. Where a quota is enforced, its value is also compared against what `statfs` reports, which catches the rarer case of the two disagreeing.

Asking the mount rather than trusting configuration is deliberate. The claim size is declared in a different Helm release than the backend, and it has already changed once in this project's life; a copy of that number in the backend's own configuration would eventually disagree with reality and cry wolf on a perfectly healthy volume. The configured claim size (`STORAGE_CLAIM_SIZE`) therefore survives only as a fallback for when the attribute cannot be read at all — an unreadable quota is not evidence of a missing one. The comparison is deliberately coarse, looking for an order-of-magnitude discrepancy rather than accounting overhead. In hostPath mode the mount is not a claim at all, so the quota is reported as absent and the view is always in its unverified-capacity mode there.

## Who can use it

Gated by `can_view_platform_storage`, a [platform-scope permission](../organization/permissions.md): the route resolves no Organization and stamps no tenant context, and Pulumi never grants it as part of the default admin bundle. It is granted on top of an operator's ordinary Organization membership rather than on its own — the app shell assumes every account belongs to one ([ADR-0027](../adr/0027-platform-scope-routes-opt-out-of-tenant-resolution.md)). The view ignores the Organization selector entirely, because the point is the view across all of them.

Operators holding the separate `can_manage_platform_storage` permission also get a **Clean up now** control next to an Organization's pending-deletion badge. Confirming it enqueues the same `workspace-cleanup` job scoped to that Organization with the retention window ignored, reclaiming its tombstoned directories immediately instead of waiting out the seven days; the orphan sweep stays with the nightly run. The permission is deliberately split from the view permission because it destroys the recovery window.

## See also

- [Persistence](persistence.md) — the volume being measured, the workspace layout, and the tombstone/cleanup cycle that pending deletion reflects.
- [Pods](pods.md) — the sibling operational view; same read-only posture, per-Organization scope instead of platform-wide.
- Code: `backend/src/storage/` — the controller (`GET /api/platform/storage`), the memo, the snapshot builder that joins Postgres rows to directories, and the per-`STORAGE_TYPE` measurement strategies.
