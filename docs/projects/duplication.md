# Project Duplication

> Copying a whole project — working state and all — into a new, independent project. The sibling of publishing: where publishing carries only app *source* into a fresh environment, duplication carries everything the source has been *living* with.

Duplication makes a new Project from an existing one, in the **same tenant and workspace**, preserving its working state so the copy opens exactly where the original left off — the agent conversation, the app's databases, environment variables, and settings. It answers a recurring need: branch from a working project (an automation wired to email, a tool with real data) without rebuilding it by hand.

## What carries, and what doesn't

A duplicate is a faithful copy of the source's **Development** environment, but a fully independent Project:

- **Carried** — app source + git history, the agent's chat/session state, the app's databases, environment variables, the dev auth mode, project settings (timeouts, request logging), [Resources](../runtime/resources.md), and App Details (name, description, icon).
- **Made fresh** — its own LLM keys and service-gateway key. A duplicate never shares credentials or budget plumbing with its source.
- **Deliberately not carried** — the Makara Pin (a duplicate must not contend for the one catalog slot), and history belonging to the original (publish jobs, audit logs).
- **Carried but paused** — Schedules. They come across switched off, so a duplicate never silently fires the same automation as its original; the user reviews and enables them.

Only the Development environment is duplicated; published environments are re-created by publishing from the duplicate.

## How it works

Duplication runs on the **same git mechanism as publishing**: commit the source's working tree, make the duplicate a local clone, detach it from its origin. Because a clone carries only git-*tracked* files, the runtime state git ignores — databases, the session store, the env file, **and the installed dependency store** — is then copied across separately, skipping only throwaway caches the app regenerates on its own.

Crucially the dependency store is **copied, not reinstalled**. A duplicate is always a Development environment, and a dev workspace boots by running the app directly against dependencies that must already be present — it never installs (only a published *Production* environment installs on first start, which is why publishing can ship source alone and duplication cannot). Copying is also faster and more faithful than a network reinstall, since the artifacts already sit on the shared filesystem. This single most-important choice — and why runtime state is copied **subtractively** (everything ignored, minus a small skip-list) rather than from a preserve-list — is [ADR-0011](../adr/0011-duplication-reuses-git-publish-path.md): a forgotten skip-list entry only makes a copy slower, while a forgotten preserve-list entry would silently lose user data.

Publishing and duplicating share the git transfer code and can't run against the same project at once (both begin by committing the same working tree).

## Progress and access

Duplication is asynchronous and shows **publish-style step progress** on the new project's page (snapshot → clone → runtime-state copy → app starting), over the same Redis-backed SSE stream publishing uses. The final step waits for the app to actually respond, so the project opens only once its app is reachable. It is gated by its own permission, lands in the **same workspace** as its source (so it never widens who can see a project), and — being tenant-agnostic by design — is the foundation for planned cross-tenant duplication.

## See also

- [Project Environments](environments.md) — publishing, the git path duplication reuses ([ADR-0004](../adr/0004-git-based-incremental-publish.md)).
- [ADR-0011](../adr/0011-duplication-reuses-git-publish-path.md) — the subtractive runtime-state copy and the dependency-store decision.
- Code: `backend/src/project/project-duplicate.*` (the job), `backend/src/git/` (`GitService`), progress UI in `frontend/src/components/project/`.
