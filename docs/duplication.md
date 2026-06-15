# Project Duplication

Duplication makes a new Project from an existing one, in the **same tenant and workspace**, preserving its working state in full. Where Publishing carries only the App's source into a fresh environment, Duplication carries everything the source has been *living* with — the agent conversation, the App's databases, environment variables, and settings — so the copy opens exactly where the original left off.

It answers a recurring need: a user has built up a working project — an automation wired to email or messaging, a tool with real data in it — and wants a second one just like it to branch from, without rebuilding it by hand.

## What carries, and what doesn't

A duplicate is a faithful copy of the source's **Development** environment, but a fully independent Project:

- **Carried** — the App's source and its git history, the agent's chat/session state, the App's databases, environment variables, the dev environment's auth mode, project settings (timeouts, request logging), Resources, and App Details (name, description, icon).
- **Made fresh** — its own LLM keys and service-gateway key. A duplicate never shares credentials or budget plumbing with its source.
- **Deliberately not carried** — the Makara Pin (a duplicate must not contend for the one catalog slot), and history that belongs to the original (publish jobs, audit logs, run history).
- **Carried but paused** — Schedules. The source's schedules come across switched off, so a duplicate never silently starts firing the same automation — emails, messages — as its original. The user reviews them and turns them on when ready.

Only the Development environment is duplicated. Published environments aren't copied; the user re-creates them by publishing from the duplicate, which already carries the history to do so.

## How it works

Duplication runs on the **same git mechanism as Publishing**. The platform commits the source's working tree, makes the duplicate a local clone of it, and detaches the clone from its origin. Because a clone only ever carries git-*tracked* files, the runtime state that git deliberately ignores — the databases, the agent's session store, the environment file, **and the installed dependency store** — is then copied across separately, skipping only throwaway caches the running app regenerates on its own.

Crucially, the dependency store *is* copied rather than reinstalled. A duplicate is always a **Development** environment, and a dev workspace boots by waiting for its dependencies to already be present (it runs the app directly, it does not install). Publishing is different — a Production environment installs its dependencies on first start — which is why publishing can ship source alone but duplication cannot. Copying the dependencies is also faster and more faithful: they already sit on the same shared filesystem, so the duplicate is a byte-for-byte working copy that runs the instant its pod is up, with no network install and no risk of resolving a different dependency graph.

This is the single most important design choice, and the reasoning behind it — including why runtime state is copied *subtractively* (everything ignored, minus a small skip-list) rather than from a hand-kept preserve-list — is recorded in [ADR-0011](adr/0011-duplication-reuses-git-publish-path.md). The short version: a forgotten skip-list entry only makes a copy slower, while a forgotten preserve-list entry would silently lose a user's data.

Publishing and Duplicating share the git transfer code and cannot run against the same Project at once — starting one while the other is in flight is refused with a clear message, since both begin by committing the same working tree.

## Progress and lifecycle

Duplication is asynchronous and shows **publish-style step progress** on the new project's page: the snapshot, the clone, the runtime-state copy (the one step with a live byte count), then the app starting up. Like publishing, the final step waits for the App to actually respond before the duplicate is marked done — so the project only opens once its App is reachable, never onto a transient "upstream unavailable". The two flows share the same progress presentation and the same SSE transport (a Redis-backed project event stream); only the underlying job records differ.

## Who can use it

Duplication is gated by its own permission and, like every project action, is visible only for projects the user can already see in their current tenant and workspace. The duplicate lands in the **same workspace** as its source — a project in a private workspace duplicates privately, a public one publicly — so duplication never widens who can see a project.

Cross-tenant duplication — copying a project into another tenant the user belongs to — is a planned extension, not part of this version. The mechanism here is tenant-agnostic by design, so it is the foundation that work will build on.

## Where the code lives

The duplication job runs in the `project` module (`backend/src/project/project-duplicate.*`), driving the shared `GitService` (`backend/src/git/`) for the clone and its own runtime-state copier for the ignored files. The progress UI lives alongside the publish progress components in `frontend/src/components/project/`.
