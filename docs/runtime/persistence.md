# Persistence & Storage

> What survives a pod being replaced, where it lives, and how a project resumes its session. Read this to understand why a pod is disposable but a project's work is not.

A ProjectEnvironment's pod is ephemeral; its **workspace directory on shared storage is the durable thing**. The pod mounts that directory by `subPath` (`projects/{projectId}` for the Development environment, which reuses the project id; published environments get their own directories), so deleting and recreating the pod — for timeout, eviction, crash, or reassignment — loses nothing. Runtime state that must survive lives on the volume; everything in-process does not.

| Persists (on the volume) | Does not (in the pod) |
|---|---|
| OpenCode session DB, chat history, app source + git history | in-memory process state, PTY sessions |
| the app's SQLite databases and generated output | live network connections, in-flight streams |
| agent config/skills copied onto the workspace | temp files outside `/workspace` |
| code-server settings and extensions, uploaded files | |

## XDG redirection makes session state durable

OpenCode and code-server write their state into XDG directories, which default to ephemeral container paths. The pod template redirects all four (`XDG_{DATA,CONFIG,CACHE,STATE}_HOME`) under `/workspace/.xdg/…`, so session databases, config, and extensions land on the persistent volume instead of vanishing with the pod.

## Pod replacement

When a pod is replaced, the workspace `subPath` stays intact, a new pod with the same deterministic name mounts it, OpenCode starts against the persisted XDG state, the backend caches the new pod IP and flips the environment to `active`, and the frontend reconnects. Project identity is stable even though pod identity changes. (The full state model is in [Pod Lifecycle](pod-lifecycle.md).)

## Resume

Resume is frontend-owned and scoped to the **active environment**, because each environment is its own deployment with its own OpenCode session store. The remembered session is pinned per environment (`project_environments.session_id`, Development included): the frontend asks the active environment for its root sessions, opens the pinned one if it still exists, otherwise opens (and pins) the oldest. Pinning the oldest anchors the UI to the canonical chat and ignores out-of-band sessions; validating the pinned id against the live list is also what stops a Development session id from leaking into a freshly published environment, where it would 404.

## Workspace cleanup

Deleting a project or environment does not remove its files immediately — each environment gets a tombstone row in `deleted_project_environments`, written before the live rows are removed so a directory is never untracked. A daily BullMQ `workspace-cleanup` job (3 AM) then does two things: removes workspaces whose tombstone is older than **7 days** (a tombstone row is only deleted once its directory removal actually succeeds, so a failed removal retries on the next run), and sweeps the `projects/` root for orphaned directories that have neither a live environment row nor a tombstone. Hidden dot-directories (the `.<id>.copying` / `.<id>.git-rebuild` temp dirs that duplication and publish create there) are exempt from the orphan sweep until they are older than the same 7-day window, so an in-flight operation is never swept but a crashed one still gets reaped. The 7-day window allows recovery from an accidental delete. Operators with `can_manage_platform_storage` can skip the wait for one Organization from the [Storage page](storage.md) — that enqueues the same job scoped to the Organization with the retention window ignored.

## See also

- [Storage](storage.md) — how the bytes on this volume are counted and attributed back to Organizations.
- [Pod Lifecycle](pod-lifecycle.md) — pod replacement, suspension, and the deterministic naming that makes the volume re-attach.
- [Project Environments](../projects/environments.md) — why each environment has its own directory and session store.
- Code: `backend/db/schema.ts` (`project_environments`, `deleted_project_environments`), `backend/src/pod/pod.template.ts` (XDG + `subPath`), `backend/src/cleanup/` (the workspace-cleanup queue/cron).
