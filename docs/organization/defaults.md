# Configurable Defaults

> Platform-wide and per-tenant defaults for agent timeouts and LLM budgets, tunable from the UI. Read this to understand what "Defaults" seeds and, importantly, what it does *not* cover.

Defaults **seed new entities at creation time** — they never retroactively change existing projects, keys, or pods. Edit a tenant's default budget and the *next* project created under it gets that budget; earlier projects keep what they had.

## Two tiers

Global defaults are the platform baseline; each tenant gets a copy that can diverge (a trial tenant on $50/month, an enterprise tenant on $500). A tenant with no row falls back transparently to the global value.

```
Global → copied to each tenant on tenant creation → seeds the tenant's new projects / keys
```

What's configurable: **timeouts** (agent idle, app idle) and **budgets** (caps at tenant, project, and per-key level, each with a reset period). Edited in **Settings → Defaults** with a *New organizations* tab (the platform baseline, admin-only) and a *New projects* tab (this organization), each shown by permission (`can_manage_platform_defaults` / `can_manage_tenant_defaults`). To change the seed values for future deployments, write a migration that UPDATEs the rows — the DB is the single source of truth, there is no config-file fallback.

## What Defaults deliberately excludes

The agent **model** is *not* configurable here. It lives with the agent profile in `agent-config/agents.json`, is uniform across every tenant, and changing it is a code/config rollout — not a tunable default. A two-tier model-defaults schema once existed and was removed precisely to prevent it becoming a per-tenant knob; that decision and its reasoning are [ADR-0008](../adr/0008-agent-model-owned-by-agent-config.md).

## See also

- [Agents](../agents/agent-system.md) — where the agent model actually lives.
- [LLM Gateway](../gateways/llm-gateway.md) — how the seeded budgets become Bifrost caps.
- [Settings](settings.md) · [Permissions](permissions.md).
- Code: `backend/src/defaults/`; seed in `backend/db/migrations/0014_add-defaults-tables.sql` (the agent-model tables it also created were dropped in `0043`); frontend `frontend/src/pages/defaults.tsx`.
