# LLM Gateway Implementation Plan

Implementation plan for per-project API key management and usage tracking via Bifrost AI Gateway.

## Decision Summary

**Chosen: Bifrost** (Go, virtual keys, 11µs overhead, no CVEs)

Evaluated alternatives:
- LiteLLM — JWT/OIDC auth is enterprise-only ($), Python, CVEs, heavier
- Kong AI Gateway — AI features are enterprise-only ($)
- Portkey — tracking/budgets are SaaS-only ($)
- Helicone — observability only, no budget enforcement

ChatGPT subscription models (gpt-5.3-codex etc.) are handled natively by OpenCode's built-in `codex` plugin (`opencode providers login`), not by the gateway.

## Architecture

```
Opsiforce Backend ──── Admin API (master key) ──→ Bifrost (ClusterIP)
       │                                              │ holds real OPENAI_API_KEY
       │ pod gets:                                    │ validates virtual keys
       │   OPENAI_API_KEY=<virtual key>               │ logs tokens/cost/latency
       │   OPENAI_BASE_URL=http://bifrost:8080/v1     │ enforces budgets
       ▼                                              ▼
  Agent Pod ──── LLM calls ──────────────────────→ Bifrost ──→ OpenAI
```

## Files to Create

### 1. Bifrost Helm Chart — `helm/opsiforce-bifrost/`

```
Chart.yaml          — appVersion: "1.4.19"
values.yaml         — image: maximhq/bifrost:v1.4.19 (latest stable), port 8080
templates/
  _helpers.tpl      — standard helm helpers
  deployment.yaml   — single container, config.json mounted, health at /health
  service.yaml      — ClusterIP
  configmap.yaml    — Bifrost config: openai provider, postgres config/log store, governance+logging plugins
  secret.yaml       — OPENAI_API_KEY, MASTER_KEY, DATABASE_URL
  networkpolicy.yaml — ingress only from opsiforce-agent pods
```

### 2. DB Schema — `db/schema.ts`

Add `projectApiKeys` table:
```typescript
export const projectApiKeys = pgTable("project_api_keys", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id).notNull(),
  tenantId: text("tenant_id").references(() => tenants.id).notNull(),
  bifrostKeyId: text("bifrost_key_id").notNull(),
  bifrostKeyToken: text("bifrost_key_token").notNull(),
  maxBudget: text("max_budget"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
```

Run `yarn workspace @opsiforce/backend run db:generate` then rename migration.

### 3. Backend Config — `src/config/configuration.ts`

Add:
```typescript
bifrostProxyUrl: process.env.BIFROST_PROXY_URL || "",
bifrostPodProxyUrl: process.env.BIFROST_POD_PROXY_URL || process.env.BIFROST_PROXY_URL || "",
bifrostMasterKey: process.env.BIFROST_MASTER_KEY || "",
```

### 4. Bifrost NestJS Module — `src/bifrost/`

**bifrost.types.ts** — Bifrost API types (CreateVirtualKeyRequest/Response, BifrostLogStats, etc.)

**bifrost.service.ts** — wraps Bifrost Admin API:
- `createProjectKey(projectId, tenantId)` → POST `/api/governance/virtual-keys`
- `revokeProjectKey(projectId)` → DELETE `/api/governance/virtual-keys/{id}`
- `getProjectUsage(projectId)` → GET `/api/logs/stats?virtual_key_ids={id}`
- `getTenantUsage(tenantId)` → aggregate across project keys
- `getUsageHistogram(projectId)` → GET `/api/logs/histogram/cost?virtual_key_ids={id}`

**usage.controller.ts** — tenant-scoped endpoints:
- `GET /api/usage` → tenant aggregate
- `GET /api/usage/projects/:id` → project usage

**bifrost.module.ts** — imports `forwardRef(() => ProjectModule)`, exports BifrostService

### 5. Pod Template — `src/pod/pod.template.ts`

Add to `PodTemplateOptions`:
```typescript
bifrostProxyUrl?: string
bifrostApiKey?: string
dynamicSkills?: DynamicSkill[]
```

Add `DynamicSkill` interface and `buildDynamicSkillCommands()` for init container.

Update env vars: when Bifrost enabled, set `OPENAI_API_KEY` (virtual key) + `OPENAI_BASE_URL` (Bifrost URL).

### 6. Pod Service — `src/pod/pod.service.ts`

Add `TenantPodOptions` interface. Thread through `createAssignedPod()` and `assignPodToProject()`.

### 7. Project Service — `src/project/project.service.ts`

Add `buildTenantPodOptions()`: if Bifrost enabled, create virtual key + build dynamic skills.
In `assignPod()`: call buildTenantPodOptions, pass to pod creation.
In `remove()`: call `bifrostService.revokeProjectKey()`.

### 8. App/Project Module Wiring

- `app.module.ts` — import BifrostModule
- `project.module.ts` — import `forwardRef(() => BifrostModule)`

### 9. Helm Backend Config

- `configmap.yaml` — add BIFROST_PROXY_URL, BIFROST_POD_PROXY_URL
- `secret.yaml` (new) — OPENAI_API_KEY, BIFROST_MASTER_KEY
- `values.yaml` — add bifrostEnabled, bifrostProxyUrl, bifrostMasterKey

### 10. Local Dev

**package.json scripts:**
- `create-bifrost-db` — kubectl create database
- `install-bifrost` — helm install chart
- `port-forward-bifrost` — kubectl port-forward svc 3050:8080
- Update `minikube-dev` chain to include these

**local-envs.sh:**
```bash
BIFROST_PROXY_URL=http://localhost:3050/v1
BIFROST_POD_PROXY_URL=http://opsiforce-bifrost-opsiforce-bifrost.opsiforce.svc:8080/v1
BIFROST_MASTER_KEY=local-test-master-key
BIFROST_DATABASE_URL=postgres://admin:dbpass1@local-pg-postgresql.local.svc:5432/bifrost
```

### 11. Dynamic AI API Skill

Injected when Bifrost enabled — teaches agent about available AI API:
```markdown
# AI API Integration
An OpenAI-compatible API key is available via OPENAI_API_KEY and OPENAI_BASE_URL.
Use `new OpenAI()` in app backend. Backend only, never frontend.
```

## Enabling/Disabling

No feature flag. Bifrost is active when `BIFROST_PROXY_URL` + `BIFROST_MASTER_KEY` are set. Omit them (or comment out in local-envs.sh) to disable — pods get `OPENAI_API_KEY` directly.

## Warm Pool

No changes needed. Warm pods use global OPENAI_API_KEY. On assignment, warm pod is deleted and recreated with project-specific virtual key.

## Bifrost API Reference

- POST `/api/governance/virtual-keys` — create virtual key
- DELETE `/api/governance/virtual-keys/{id}` — delete
- GET `/api/logs/stats?virtual_key_ids={ids}` — usage stats (total_requests, total_tokens, total_cost, average_latency, success_rate)
- GET `/api/logs/histogram/cost?virtual_key_ids={ids}` — time-bucketed cost data
- Auth: `Authorization: Bearer <MASTER_KEY>` on all admin calls
- Virtual key header: agent sends `Authorization: Bearer <virtual_key>` (OpenAI SDK does this automatically)

## Future: Keycloak OIDC for Non-LLM Services

When adding Mailgun, Slack, or other non-LLM services that need per-project identity:

1. Create a `KeycloakClientService` in the backend (follow `keycloak-ms-backend/src/modules/clients/` pattern)
2. On project creation, create a Keycloak client alongside the Bifrost virtual key:
   - `clientId: opsiforce_{tenantName}_{projectId}`
   - `serviceAccountsEnabled: true`
   - Protocol mappers: `oidc-hardcoded-claim-mapper` for `project_id` and `tenant_id`
3. Inject `KEYCLOAK_CLIENT_ID` + `KEYCLOAK_CLIENT_SECRET` into pods (alongside existing Bifrost env vars)
4. Non-LLM service proxies validate JWT against Keycloak JWKS, extract claims for routing/billing

Bifrost virtual key (LLM) and Keycloak JWT (everything else) coexist — no migration needed.

LiteLLM was evaluated but its JWT/OIDC auth is enterprise-only ($). Bifrost doesn't support JWT on inference. So the two-credential approach (virtual key + KC client) is the pragmatic path until one of these gateways adds free OIDC support.
