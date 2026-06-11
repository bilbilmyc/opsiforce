# Configurable Defaults

Platform-wide and per-tenant defaults for agent timeouts and LLM budgets. Admins can tune these from the UI instead of redeploying.

Defaults **seed new entities** at creation time — they do not retroactively change existing projects, keys, or pods. Edit a tenant's default budget and the next project created under that tenant gets that budget; earlier projects keep whatever they had.

## Two tiers

Global defaults are the platform baseline. Each tenant gets a copy that can diverge — a trial tenant might run on $50/month while an enterprise tenant runs on $500.

```
Global → copied to each tenant on tenant creation → seeds projects / keys / pods
```

If a tenant has no row (shouldn't happen after migration 0014 backfills), reads transparently fall back to the global value.

## What's configurable

- **Timeouts** — agent idle timeout and app idle timeout.
- **Budgets** — spending caps at tenant, project, chat-key, and backend-key levels, each with its own reset period.

The agent **model** is deliberately *not* configurable here. It lives with the agent profile in `agent-config/agents.json` (see [Agents](agent-system.md)), is the same for every tenant, and changing it is a code/config rollout rather than a tunable default. See [ADR-0008](adr/0008-agent-model-owned-by-agent-config.md).

## Who can edit

Two permissions, both wired through Keycloak:
- `can_manage_platform_defaults` — edits the global baseline. Admin-only.
- `can_manage_tenant_defaults` — edits the current tenant's overrides.

The settings page at `/defaults` shows the tabs the user has permission for.

## Changing the platform baseline

The initial seed values live in migration `0014_add-defaults-tables.sql`. To change them for future deployments, write a new migration that UPDATEs the global row (and optionally updates tenant rows that still hold the old value). The DB is the single source of truth — there is no config-file fallback.

## Where it lives

- Backend module: `backend/src/defaults/`
- Frontend page: `frontend/src/pages/defaults.tsx`
