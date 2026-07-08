# Project Export & Import

> Carrying a whole Project — working state and all — to a *different* Opsiforce deployment, as a single downloadable file. The cross-deployment sibling of [Duplication](duplication.md): duplication copies a project into a new one on the **same** instance; export/import does it **across** instances, so a workflow built on one deployment can be handed to a self-hosted customer running their own.

_Status: implemented end to end — the export → import round-trip stands up a new, bootable Project, the manifest carries the Project's database-row state (settings, App Details, Resources by class, and paused schedules), and import is hardened: hostile archives (path-traversal and escaping symlinks) are rejected without writing outside the new project's directory, and a failed or interrupted import cleans up after itself._

Export and import answer a need duplication can't: a customer self-hosts Opsiforce, and you want to ship them a workflow you already built — moving it from your development instance to their production one. **Export** seals a Project's Development working state into an opaque file (a *Project export*); **Import** rehydrates that file into a new, independent Project on another deployment. The customer then publishes from the imported project to their own Production, exactly as they would for any project — which completes the "developed here, runs there" path.

It is, by design, [Duplication](duplication.md) stretched across the deployment boundary: the same working state crosses, with the same "new independent project, fresh keys, paused schedules" semantics — only the transport differs (a file, not a local clone). Why it ships as a faithful full copy rather than the sanitized, rebuilt shape [publishing](environments.md) uses is [ADR-0017](../adr/0017-project-export-is-a-faithful-full-workspace-zip.md).

## What crosses, and what doesn't

Only the **Development** environment is exported — published environments are re-created by publishing from the import. A Project export is two things zipped together: the **workspace files** and a small **manifest** of the things that are database rows rather than files.

The **files** cross as a faithful copy — app source, full git history, the full agent conversation, the app's databases and generated output, uploaded files, the environment file **with its values**, and the installed **dependency store** — everything on the volume except the throwaway caches. The git repository is copied intact, so the imported conversation stays attached to it.

The **manifest** carries what duplication copies between database rows — title and description, project settings, App Details, and schedules (which arrive **paused**, like a duplicate's) — and records the cross-deployment references that have to be *re-resolved* on the far side rather than copied verbatim:

- **Agent by name.** A project references its agent by an id that is meaningless on another deployment, so the manifest carries the agent's stable name and import resolves it against the target — falling back to the target's default agent if it isn't present. This matters at runtime: the pod's startup copies the agent's skills and instructions from the image by name, so an unresolved agent would have nothing to load.
- **Environment binding.** Import binds the new Development environment to the *target's* Development, never the source's.
- **Resources by class.** The pod size crosses as its class (Small/Medium/Large); the target re-resolves what that class means for its own hardware. A Custom size carries its explicit CPU/memory, since there is no preset to re-resolve.

A few things are deliberately **not** carried and are set on arrival: the project's identity, tenant, and workspace (import assigns them); its LLM and service-gateway keys (minted fresh — the live credentials were never in the files anyway, since the platform injects them as pod environment variables); all history; and the **timezone**, which is set at import the way project creation sets it, with the paused schedules re-stamped to it. **Auth mode resets to `public`**, because a carried `manual`/`managed` mode points at an identity provider the target may not have.

## How export works

Export is asynchronous, like a publish or duplicate. A job stages the Development workspace — committing the working tree and cloning it with its full history — zips the staged files together with the manifest, and reports step progress over its own SSE job stream, shown as a card in the global [job dock](../frontend/job-dock.md); the finished artifact is offered as a download. Because the workspace lives on shared storage, the job reads it directly — the same path [file downloads](file-downloads.md) use — so an export can run even when the agent pod is asleep.

The artifact is **ephemeral**, and every export rebuilds it from scratch — there is no caching or reuse, so a fresh export always reflects the latest working state. The zip is written to shared storage only long enough to be handed over: a successful download deletes both the file and its job row, so nothing lingers. The download is therefore single-use — re-export to get another copy. As a backstop for exports that are built but never downloaded, a daily cleanup sweep (running overnight alongside the other scheduled cleanups on its own BullMQ queue, since shared storage has no native file expiry) deletes any artifact older than a retention window (`EXPORT_RETENTION_MINUTES`, default five hours), so a generated-and-abandoned export can't accumulate on the volume.

## How import works

Import takes an uploaded Project export and creates a **new, independent Project** in the importer's current Organization and a Workspace they choose, with the title carried from the export. It rehydrates the manifest into fresh database rows — resolving the agent, binding to Development, re-resolving Resources, resetting auth — unpacks the files into the new project's workspace, and boots it through the same path a duplicate uses. The dependency store rides along, so there is no install step; the agent's skills and config re-sync from the target's own image on first boot, so an import always runs the target's agent, not the source's.

Unpacking an uploaded archive is treated as untrusted: writes are confined to the new project's directory (no path traversal), and a failed or interrupted import cleans up the half-created project, its directory, and its minted keys rather than leaving an orphan.

Export and import are each gated by their own permission — `can_export_project` (which produces a secret-bearing file, so it is held closely) and `can_import_project`.

## Deliberately left for later

v1 is the straight-through path; these are known, named, and deferred:

- **No compatibility gate.** The manifest stamps the source's platform/agent-image/arch, but import does not yet check them — so importing onto a different-architecture agent image will fail on the copied native binaries. The stamp is there so a gate can be added without changing the format.
- **No encryption at rest.** The file holds live environment values and the full conversation in the clear; treat it as a secret.
- **New project only** — no re-importing an export to *update* an existing project.
- **Self-references aren't rewritten** — an absolute URL or id the app baked into its own config won't match the new deployment until adjusted via the environment-variables editor.

## See also

- [Duplication](duplication.md) — the same-deployment sibling this generalises ([ADR-0011](../adr/0011-duplication-reuses-git-publish-path.md)).
- [Project Environments](environments.md) — publishing, which the imported project uses to reach its own Production ([ADR-0004](../adr/0004-git-based-incremental-publish.md)).
- [ADR-0017](../adr/0017-project-export-is-a-faithful-full-workspace-zip.md) — why a Project export is a faithful full copy, not a sanitized or rebuilt bundle.
- Builds on existing code: `backend/src/project/project-duplicate.processor.ts` (the async job + subtractive copy it mirrors), `backend/src/git/git.service.ts` (commit + local clone, full history), `backend/src/project/download.service.ts` (streaming from shared storage), `backend/src/pod/pod.template.ts` (why credentials and agent config are not carried).
