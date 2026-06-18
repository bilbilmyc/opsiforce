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

Deleting a project does not remove its files immediately — it writes a tombstone (`deleted_projects` / `deleted_project_environments`). A daily BullMQ `workspace-cleanup` job (3 AM) then does two things: removes workspaces whose tombstone is older than **7 days** (and prunes now-empty tenant directories), and removes orphaned directories that have no row in either `projects` or the tombstones. The 7-day window allows recovery from an accidental delete.

## See also

- [Pod Lifecycle](pod-lifecycle.md) — pod replacement, suspension, and the deterministic naming that makes the volume re-attach.
- [Project Environments](../projects/environments.md) — why each environment has its own directory and session store.
- Code: `backend/db/schema.ts` (`project_environments`, `deleted_projects`), `backend/src/pod/pod.template.ts` (XDG + `subPath`), `backend/src/cleanup/` (the workspace-cleanup queue/cron).
