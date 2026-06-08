# Publish via git: a production environment is a checkout of the dev repo

Status: accepted

The agent workspace is already a git repository whose `.gitignore` separates app source (tracked) from runtime state (`data/` — the SQLite DBs, `node_modules`, `**/.yarn/cache`, `**/.pnp.*` — ignored). Publishing commits dev's working tree and makes each production `ProjectEnvironment` a `git clone --local` of the dev directory, `reset --hard` to the chosen commit; the deployed commit SHA is recorded on the env row.

We chose this over full re-copy or rsync because the `.gitignore` *is* already the deploy boundary, `reset --hard` is incremental and deletion-correct, git-ignored runtime state (the production database, installed deps) is preserved across redeploys **by construction**, and rollback is `reset --hard <prevSHA>`.

## Considered options

- **Full re-copy each publish** — simple, but slow on large apps, must hand-handle deleted files and explicitly preserve prod's DB/node_modules, and gives no rollback or history.
- **rsync-style incremental** — incremental, but no history/rollback and introduces a second ignore file to keep in sync with `.gitignore`.

## Consequences

- The publish worker needs the `git` binary; it auto-commits dev's working tree on publish (the repo is platform-managed and invisible to users — commit on `main`, tag per deploy).
- `dist/` should be git-ignored so production builds fresh rather than shipping stale dev artifacts.
- Deploy is **in-place, restart-only-on-success**: `reset --hard` + `yarn install` + build + migrate happen before any restart, so a failed deploy never touches the running production app; on success the app process is restarted (a few-seconds blip). Migrations are therefore **forward-only** (a git rollback of code does not roll back schema).
- **Rollback restores more than code.** A re-publish also mutates two things git does not track: the env file (`app/opsiforce.env.json`, which is git-ignored) and the environment's schedule set. The env file is snapshotted before it is overwritten and written back if the deploy fails — `reset --hard` cannot restore it. Schedules are applied **after** the health gate, not before: the target's set is reconciled (upsert the desired, remove only the now-stale) once the app is confirmed ready, so a failed publish never mutates the live schedule set, and a reconcile that fails on an already-healthy deploy is logged without failing the publish. (Cleaning up the cloned directory, gateway key, and env row orphaned by a failed **first** publish is a separate, still-open concern.)
- Zero-downtime (blue-green) and keeping production warm against idle-suspension are explicit later refinements, not in the first version.
