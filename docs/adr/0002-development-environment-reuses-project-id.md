# The Development `ProjectEnvironment` reuses the `Project`'s id

Status: accepted

Public routing keys off an opaque id in the subdomain (`{id}.apps.dev`, `…code.dev`, `…db.dev`), pod names derive from it (`opsiforce-agent-{id[:8]}`), and the workspace directory is `projects/{id}`. When introducing per-environment instances, the migration sets each project's Development `ProjectEnvironment.id = projectId`; only non-default (published) environments get fresh uuids.

This is deliberate: reusing the projectId keeps every existing URL, pod name, on-disk directory, and satellite FK **byte-for-byte valid**. It turns what would be a high-risk data migration (rename CephFS directories, recreate pods, break live app URLs and Makara pins, issue redirects) into a metadata-only one — insert env rows and set `environmentId = projectId` (the value the satellite rows already hold).

## Consequences

- A future reader will notice that Development env ids look like project ids while other env ids are random uuids. **This asymmetry is intentional — do not "normalize" it.** Giving Development a fresh uuid would require a coordinated URL/pod/directory migration plus a redirect map for live links and catalog pins.
- The routing key is uniformly "the env id"; Development's simply equals its project's id. The Go proxy's hostname regex and `ensure` flow are unchanged.
- Partially superseded by ADR 0011: the public app hostname now appends an environment slug (`{envId}-{slug}`) and the hostname regexes widened accordingly. The env id remains the routing key, and its fixed 36-char uuid length became load-bearing for parsing the slug off the label.
