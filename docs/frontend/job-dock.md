# Job Dock

> One progress surface for every long-running project process. Publish, duplicate, export, and import are all asynchronous backend jobs that stream step-by-step progress; the dock is the single component that renders all of them, as a stack of cards in the bottom-right corner that expand into a dialog.

A project has four operations that take long enough to need progress feedback: **publishing** an environment, **duplicating** a project, **exporting** one to a file, and **importing** one back. Each is a backend job that reports its status over a Server-Sent-Events stream. Rather than give each its own bespoke progress panel, the frontend funnels all four through a single **job dock** — so they look and behave identically, stack together when several run at once, and stay visible no matter which page you navigate to.

## What the user sees

A running job shows as a compact card pinned to the bottom-right corner, with a title, the current step ("Packaging · step 4 of 5"), and a progress bar. Clicking the card expands it into a dialog with the full step list; closing the dialog drops it back to a card — the job keeps running either way. When a job finishes, the card switches to a terminal state with a kind-specific action: export offers **Download**, import and duplicate offer **Open project**, publish offers **Open app** and **View environment**. A failed job shows the error and a dismiss button. Several jobs can be in flight at once — each is its own card.

## How it's organised

The dock is **mounted once**, app-globally, at the root layout — not per page. That is the whole point: a publish kicked off from the project header, an export started from the actions menu, and an import begun on the home page all surface in the same place and survive navigation between them. A small context (`useJobDock`) exposes `trackPublish` / `trackDuplicate` / `trackExport` / `trackImport`, which any component calls to hand a freshly-started job to the dock.

Everything kind-specific lives in a **per-kind adapter**: how to read the job's phase and current step, what the SSE endpoint is, the card and dialog titles, the byte-progress detail, the terminal actions, and which queries to invalidate when it ends. The host, card, and dialog are entirely generic — they ask the adapter to *describe* an entry and render whatever it returns. Adding a fifth kind of job is writing one adapter, not another panel. Each job is keyed `kind:id` (publish by environment, the rest by project), so the dock can hold, say, a publish and an export for the same project side by side.

The dock's state is **in-memory and ephemeral** — reloading the page clears the cards. The jobs themselves don't care: they run to completion on the backend regardless of who is watching, and each kind has a "latest job" endpoint a future session could use to re-attach the dock on load. (Today it doesn't.)

### Publish's page-scoped actions

Most terminal actions are self-contained (a download, a navigation). Two of publish's are not: **reloading the preview** when you publish the environment you're currently viewing, and **switching the active environment** in place. Those only make sense on the project page, which the global dock has no handle on. So the project page *registers* those two callbacks with the dock for as long as it's mounted (`registerProjectView`); the publish adapter calls them when present and falls back to plain navigation when they aren't. This keeps the dock global without losing the in-page polish.

## Duplicate is just another card

Duplication used to be the odd one out: its progress rode the project's own status stream (as an `operation` field on project state) and rendered as a full-area panel that took over the new project's page until the copy finished. It now works like the other three — its own job-stream endpoint, its own card in the dock — and the new project simply shows as `starting` in the list while the dock shows the steps, exactly as an import does. The `operation` field and the inline panel are gone.

## See also

- [Project Environments](../projects/environments.md) — publishing, the original owner of this progress pattern.
- [Project Duplication](../projects/duplication.md) — what duplicate carries; its progress now flows through the dock.
- [Project Export & Import](../projects/export-import.md) — the file round-trip, also docked.
- Code: `frontend/src/components/project/jobs/` — the host, card, dialog, and per-kind adapters; backend job streams in `backend/src/export/`, `backend/src/project/project-import.*`, and the publish/duplicate stream endpoints.
