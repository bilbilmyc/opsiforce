# Resources (pod class)

**Resources** is how much CPU and memory a project's agent pod gets. A project owner picks a size — **Small**, **Medium**, **Large**, or **Custom** — and that choice applies to every pod the project runs: its Development environment and any published environment alike. "Resources" is the user-facing name; internally the choice is called a *pod class*.

## Why it's project-level

A project's pod is physically per-environment (Development and each published target each run their own pod), but Resources is deliberately a **project-level policy**, not a per-environment one. It sits alongside the project's other owner-set policies — budget, timeouts, timezone — rather than with the per-environment runtime state. Sizing a production environment differently from development is intentionally out of scope for now; it joins the same deferred list that per-environment budget and timeout overrides are on. The rationale and the alternatives considered are recorded in [ADR-0005](adr/0005-pod-class-project-level-snapshot.md).

## How a choice is stored

Each project carries one row describing its pod's exact CPU and memory numbers. Picking a preset **snapshots that preset's numbers into the row**; picking Custom stores the typed-in numbers (clamped to safe bounds). The pod builder only ever reads those three numbers — it never re-derives them from a preset name — so a project's row always fully describes the pod it produces, and editing what a preset *means* in code never silently resizes existing projects.

The preset catalog (the Small/Medium/Large numbers and the Custom min/max bounds) is hardcoded in the backend and served to the UI, so the frontend never hardcodes sizing numbers of its own.

```
pick "Medium"  ──►  snapshot Medium's numbers into the project's row
                         │
                         ▼
   next pod start reads the row ──►  pod created at those CPU/memory values
```

## Applying a change

Changing Resources is **non-destructive**: it writes the row and nothing else. Because a running pod's resources can't be resized in place, the new size only materializes when the pod is next (re)created — on an idle resume, or immediately via the **"Restart to apply"** action shown after a change. Restart-to-apply targets the environment currently being viewed; other environments adopt the new size on their next restart or resume.

New projects — including those claimed from the warm pool — always start at **Small**; a larger class takes effect on the first restart after it's chosen. Duplicating a project copies the source project's Resources.

## Environment-specific defaults

The Small preset's numbers can differ per deployment. Production uses the hardcoded Small; local development overrides Small to a lighter footprint (so agent pods fit a single-node minikube) via a Helm value. The override only changes what *Small* snapshots when chosen — every stored row is still authoritative for its own pod.

## Who can use it

A dedicated **`can_manage_project_pod_settings`** permission gates the Resources tab in project settings and the underlying update endpoint, mirroring how budget/timeout/auth settings are gated. See [Permissions](permissions.md).

## Where the code lives

- Catalog, presets, custom bounds, and clamping: `backend/src/pod/pod-classes.ts`
- Storage: the `project_pod_settings` table in `backend/db/schema.ts`
- Update endpoint and catalog endpoint: `backend/src/project/` (project controller + the pod-class controller)
- Pod wiring (assigned pods read the row; pool/unassigned pods use Small): `backend/src/pod/` and `backend/src/project/project.service.ts`
- UI: the Resources tab in `frontend/src/components/project-settings.tsx` and `frontend/src/components/project/resources-selector.tsx`
