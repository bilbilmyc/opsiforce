# LLM Gateway (Bifrost)

> Why agent pods never hold real provider keys, and how Bifrost gives each project metered, budget-capped LLM access through virtual keys. Read this to understand the credential and budget model before touching `bifrost/` or pod env injection.

[Bifrost](https://github.com/maximhq/bifrost) is an LLM proxy that sits between agent pods and the upstream providers (OpenAI, Anthropic). Real provider keys live only in Bifrost's Secret; the backend talks to Bifrost's Admin API with basic auth, and pods get per-project **virtual keys** instead of provider keys. Bifrost runs as a cluster-internal service (`ClusterIP` + `NetworkPolicy`) and logs tokens, cost, and latency per request.

```
Backend ── Admin API (basic auth) ──▶ Bifrost ◀── LLM calls ── Agent Pod
   │  creates teams / virtual keys      │ real provider keys      │ holds only
   │                                     │ validates virtual keys   │ virtual keys
   └─ injects virtual keys into pod ─────┴── routes to ─▶ OpenAI / Anthropic
```

## Two keys per project

Each project gets two virtual keys under one Bifrost team, distinguished by a `key_type` (`chat` | `backend`) so spend is attributable to each:

- **`chat`** — the OpenCode coding agent (injected as `OPENAI_API_KEY` / `OPENAI_BASE_URL`, and the Anthropic pair).
- **`backend`** — the built app's own AI features (`APP_LLM_API_KEY` / `APP_LLM_BASE_URL`), the key the `llm-api` skill teaches the agent to use.

Both keys are **shared across every one of the project's environments** — publishing never mints new keys. The budget cap is anchored on the single Bifrost team (Bifrost has no parent-of-teams to sum a per-environment cap across), which is why one key pair per project, not per environment, is the deliberate design. Per-environment usage attribution is a deferred, additive enhancement. Full rationale: [ADR-0003](../adr/0003-one-bifrost-team-per-project-keys-per-env.md).

## Budget hierarchy

Bifrost enforces budgets at three nested levels; **all** must have remaining budget for a request to proceed:

```
Customer (tenant)  ─▶  Team (project)  ─▶  Virtual Key (chat | backend)
```

Tenants and projects seed their caps from the two-tier [Defaults](../organization/defaults.md) at creation time. Budget amounts, durations, and the Bifrost ids live in the backend's config tables and are managed through the Billing UI — the schema and the Admin-API payloads are the source of truth (`backend/db/schema.ts`, `backend/src/bifrost/bifrost.service.ts`).

## Orphan teams for pool projects

A [pending-pool](../runtime/pool.md) project is pre-baked with no tenant attached, so its Bifrost team is created as an **orphan** (no `customer_id`). At claim time the backend PATCHes the team's `customer_id` to the claiming tenant and the baked-in virtual keys stay valid across the reassignment. No LLM call ever happens against a pool project before claim, so the cost ledger has nothing to misattribute — attribution is clean from the first real request. See `createOrphanProjectResources` / `reassignTeamCustomer` in `bifrost.service.ts`.

## Version

The running Bifrost image is pinned to **`v1.5.3`** (`helm/bifrost/values.{prod,local}.yaml`), and the backend sends the v1.5 virtual-key payload shape (`key_ids`, `provider_configs`, and a `budgets[]` array for team + key budgets). This pin is load-bearing: **verify the running pod image, not just the Helm value** before relying on payload behaviour — earlier v1.4.x silently dropped `budgets[]`, and a future upgrade should back up the `bifrost` database first and re-apply the official migration-guide changes. Bifrost is active whenever `BIFROST_PROXY_URL` + admin credentials are set; with them unset, pods get a direct provider key only if the backend chart supplies one.

## See also

- [Service Gateway](service-gateway.md) — the sibling channel for non-LLM external calls (email, SMS); same per-project isolation idea, different mechanism.
- [Pending Project Pools](../runtime/pool.md) — where orphan teams come from.
- [Defaults](../organization/defaults.md) — the tenant/project budget defaults Bifrost caps are seeded from.
- Code: `backend/src/bifrost/bifrost.service.ts` (Admin-API client: customer/team/VK CRUD, budgets, usage), `backend/src/pod/pod.template.ts` (key injection), `helm/bifrost/` (chart values + NetworkPolicy).
