# LLM Gateway

Bifrost AI Gateway sits between agent pods and upstream LLM providers, providing per-project virtual keys, usage tracking, and model governance.

## Architecture

```
Opsiforce Backend ──── Admin API (basic auth) ──→ Bifrost (ClusterIP)
       │                                              │ holds real provider API keys
       │ pod gets:                                    │ validates virtual keys
       │   OPENAI_API_KEY=<chat virtual key>          │ logs tokens/cost/latency
       │   OPENAI_BASE_URL=http://bifrost:8080/v1     │ enforces model governance
       │   ANTHROPIC_API_KEY=<same chat virtual key>  │ routes by model name
       │   ANTHROPIC_BASE_URL=http://bifrost:8080/…   │
       │   APP_LLM_API_KEY=<backend virtual key>      │
       │   APP_LLM_BASE_URL=http://bifrost:8080/v1    │
       ▼                                              ▼
  Agent Pod ──── LLM calls ──────────────────────→ Bifrost ──→ OpenAI / Anthropic
```

Bifrost runs as internal-only K8s service (ClusterIP + NetworkPolicy). Real provider keys live only in Bifrost's Secret. Agent pods get per-project virtual keys.

## Dual Key Design

Each project gets two Bifrost virtual keys for separate usage tracking:

| Key Type | Purpose | Env Vars | Providers |
|----------|---------|----------|-----------|
| `chat` | OpenCode agent (coding) | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` | OpenAI + Anthropic (all models, wildcard) |
| `backend` | App AI features | `APP_LLM_API_KEY`, `APP_LLM_BASE_URL` | OpenAI + Anthropic (all models via `anthropic/` prefix) |

Both keys route through the same Bifrost instance with different virtual key tokens. The `key_type` column in `project_virtual_keys` distinguishes them.

**Why separate keys?**
- **Usage attribution** — "How much did the coding agent cost?" vs "How much do the app's AI features cost?"
- **Model restrictions** — Backend keys include whisper-1 for audio transcription
- **Budget enforcement** — Independent budget limits per key type

### Budget Hierarchy

Bifrost enforces budgets at three levels. All must have remaining budget for a request to proceed:

```
Bifrost Customer (tenant)  →  tenant_budget_config table
  └── Bifrost Team (project) →  project_budget_config table
        ├── VK chat          →  project_virtual_keys
        └── VK backend       →  project_virtual_keys
```

| Level | Bifrost entity | DB table | Key columns | Default |
|---|---|---|---|---|
| Tenant | Customer | `tenant_budget_config` | `bifrost_tenant_id`, `tenant_budget`, `budget_duration` | $100/month |
| Project | Team | `project_budget_config` | `bifrost_project_id`, `max_budget`, `budget_duration` | $10/month |
| Key type | Virtual Key | `project_virtual_keys` | `bifrost_key_id`, `max_budget`, `budget_duration` | $5/month |

All budget columns are `NOT NULL` with DB defaults. Budget duration is set at tenant level and inherited by projects and keys.

### Budget API

Per key type (existing):
```
GET  /api/usage/projects/:id/budgets              → current budget config per key type
PUT  /api/usage/projects/:id/budgets              → update budget for a key type
     body: { keyType: "chat"|"backend", maxBudget: 50, budgetDuration: "1M" }
```

Per project (team-level):
```
GET  /api/usage/projects/:id/budget               → project-level budget
PUT  /api/usage/projects/:id/budget               → update project budget
     body: { maxBudget: 40 }
```

Per tenant (customer-level):
```
GET  /api/usage/tenant/budget                     → tenant budget + duration
PUT  /api/usage/tenant/budget                     → update tenant budget
     body: { tenantBudget: 100, budgetDuration: "1M" }
```

Duration values: `1m` (minute), `1h` (hour), `1d` (day), `1w` (week), `1M` (month), `1Y` (year).

## Infrastructure

### PostgreSQL

Bifrost reuses the existing PostgreSQL cluster with a **separate `bifrost` database**:
- **Production** — CNPG cluster (`postgres-cluster-rw`), database `bifrost`, created automatically by CI/CD
- **Local dev** — same PG at `localhost:5435`, database `bifrost`, created by `create-bifrost-db` script

The `bifrost` database stores virtual keys, governance config, and per-request logs. The `opsiforce` database stores `tenant_budget_config`, `project_budget_config`, and `project_virtual_keys` tables.

### Network

- Bifrost service: `ClusterIP` only (no external access)
- `NetworkPolicy`: ingress restricted to pods in the same namespace
- Backend reaches Bifrost via `BIFROST_PROXY_URL` (Admin API calls)
- Agent pods reach Bifrost via `BIFROST_POD_PROXY_URL` (LLM calls)

In both production and local dev, both URLs point to the same in-cluster service address (`http://opsiforce-bifrost.local.svc.cluster.local:8080/v1`). The local backend runs as a pod via Tilt, so it has cluster DNS and reaches Bifrost the same way agent pods do.

## Virtual Key Lifecycle

1. **Tenant customer created** — `TenantService.getOrCreateTenant()` creates a Bifrost Customer (lazy backfill for existing tenants), stores `bifrost_tenant_id` in `tenant_budget_config`
2. **Project team created** — `ProjectService.buildTenantPodOptions()` creates a Bifrost Team under the tenant's Customer, stores `bifrost_project_id` in `project_budget_config`
3. **Keys created** — `BifrostService.createProjectKey()` called twice (chat + backend) with `team_id`, linking VKs to the project team
4. **Stored** — `project_virtual_keys` table stores two rows per project, each with `key_type`, `bifrost_key_id`, and `bifrost_key_token`
5. **Injected** — pod gets `OPENAI_API_KEY`/`OPENAI_BASE_URL` (chat) + `APP_LLM_API_KEY`/`APP_LLM_BASE_URL` (backend)
6. **Used** — agent and app call Bifrost transparently; budget checked: tenant customer → project team → virtual key
7. **Revoked** — `BifrostService.revokeProjectKeys()` revokes all active keys, deletes the Bifrost team, and removes the `project_budget_config` row

## Usage API

```
GET /api/usage                    → aggregate usage for current tenant
GET /api/usage/projects/:id       → usage for specific project (includes byKeyType breakdown)
```

Project usage response includes `byKeyType` array with per-key-type stats:
```json
{
  "projectId": "...",
  "totalRequests": 150,
  "totalCost": 0.42,
  "byKeyType": [
    { "keyType": "chat", "totalRequests": 120, "totalCost": 0.35 },
    { "keyType": "backend", "totalRequests": 30, "totalCost": 0.07 }
  ]
}
```

Returns zeros when Bifrost is not configured (no `BIFROST_PROXY_URL`).

## Dynamic Skills

The `llm-api` skill is included in the app-builder template at `.opencode/skills/llm-api/SKILL.md`. It teaches the agent that `APP_LLM_API_KEY` and `APP_LLM_BASE_URL` are set, with examples for text generation, structured output (JSON mode + JSON schema), streaming, multi-turn conversation, vision (image analysis), and audio transcription.

## Configuration

| Env Variable | Purpose | Production | Local |
|---|---|---|---|
| `OPENAI_API_KEY` | Upstream OpenAI provider key for Bifrost | GitHub Secret | optional shell env |
| `ANTHROPIC_API_KEY` | Upstream Anthropic provider key for Bifrost | GitHub Secret | optional shell env |
| `BIFROST_PROXY_URL` | Backend → Bifrost (Admin API) | In-cluster svc URL | In-cluster svc URL (backend runs as a pod via Tilt) |
| `BIFROST_POD_PROXY_URL` | Pod → Bifrost (LLM calls) | Same as above (omit) | In-cluster svc URL |
| `BIFROST_ADMIN_USERNAME` | Bifrost Admin API username | `opsiforce-admin` | `opsiforce-admin` |
| `BIFROST_ADMIN_PASSWORD` | Bifrost Admin API password | GitHub Secret | `opsiforce-local-admin` |
| `BIFROST_ENCRYPTION_KEY` | Bifrost encryption key | GitHub Secret | local env file |
| `BIFROST_POSTGRES_PASSWORD` | Password copied into namespace-local chart secret | CNPG superuser password | `dbpass1` |

No feature flag — Bifrost is active when `BIFROST_PROXY_URL` + admin credentials are set. Omit them to disable Bifrost. Pods only get a direct `OPENAI_API_KEY` in that mode when the backend chart is explicitly configured with one.

`BIFROST_POD_PROXY_URL` defaults to `BIFROST_PROXY_URL` when omitted. Override it only if agent pods need a different Bifrost URL than the backend.

## Files And Relationships

| File | Role | Reads From | Produces / Affects |
|---|---|---|---|
| `backend/src/bifrost/bifrost.service.ts` | Bifrost admin client: customer/team/VK CRUD, budget mgmt, usage | Bifrost Admin API, `tenant_budget_config`, `project_budget_config`, `project_virtual_keys` | Calls Bifrost Admin API, writes config tables |
| `backend/src/bifrost/usage.controller.ts` | REST endpoints for usage tracking and budget management | `BifrostService`, config tables | JSON responses for billing UI |
| `backend/src/tenant/tenant.service.ts` | Creates Bifrost Customer on tenant creation (lazy backfill) | `BifrostService`, `tenant_budget_config` | `bifrost_tenant_id` in config table |
| `backend/src/config/configuration.ts` | Maps Bifrost env vars into Nest config | process env | `ConfigService` values used by backend modules |
| `backend/src/project/project.service.ts` | Creates Bifrost Team + virtual keys per project | `BifrostService`, `project_budget_config` | Pod options with Bifrost chat/backend keys |
| `backend/src/pod/pod.template.ts` | Injects Bifrost virtual keys into agent pods | pod options from `ProjectService` | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `APP_LLM_*` envs |
| `frontend/src/pages/billing.tsx` | Billing page: tenant budget, per-project spend + settings | `/usage/*` endpoints | Tenant/project budget management UI |
| `helm/opsiforce-backend/values.yaml` | Declares backend chart Bifrost env inputs | CI or local helm `--set` values | Backend deployment env surface |
| `helm/opsiforce-backend/templates/secret.yaml` | Stores backend-side Bifrost admin credentials | chart values | `BIFROST_ADMIN_USERNAME`, `BIFROST_ADMIN_PASSWORD` in backend pod |
| `helm/opsiforce-backend/templates/configmap.yaml` | Stores backend-side Bifrost URLs | chart values | `BIFROST_PROXY_URL`, `BIFROST_POD_PROXY_URL` in backend pod |
| `helm/bifrost/values.local.yaml` | Local upstream chart values | stable secret names, local PG host | Local Bifrost release config |
| `helm/bifrost/values.prod.yaml` | Cluster upstream chart values | stable secret names, CNPG host | Dev/prod cluster Bifrost release config |
| `helm/bifrost/networkpolicy.yaml` | Restricts Bifrost ingress to same namespace | upstream pod label `app.kubernetes.io/name=bifrost` | K8s ingress policy |
| `scripts/upsert-bifrost-secrets.sh` | Creates namespace-local secrets expected by upstream chart | optional provider keys, admin creds, encryption key, PG password | `opsiforce-bifrost-*` secrets |
| `scripts/install-bifrost.sh` | Local install entrypoint for upstream chart | local env vars + values file | local Bifrost release + NetworkPolicy |
| `backend/package.json` | Local command wiring | scripts above | `install-bifrost`, `minikube-dev` flow |
| `backend/local-envs.sh` | Local Bifrost runtime and bootstrap env | developer machine | backend env + local secret/bootstrap inputs |
| `agent-config/opencode.json` | Agent-side default provider/model catalog | built into agent image | OpenAI models available in cluster builds |
| `agent-config/opencode.local.json` | Agent-side local override config | built into local minikube agent image | Local agent model/provider config without affecting cluster builds |
| `.github/workflows/opsiforce.yml` | Cluster deploy orchestration | GH secrets + CNPG password | namespace secrets, upstream Bifrost release, backend Bifrost envs |

Relationship summary:
- The upstream chart reads `helm/bifrost/values.*.yaml` plus the namespace-local secrets created by `scripts/upsert-bifrost-secrets.sh`.
- The chart itself is pinned at `2.0.15`; the Bifrost container image is pinned separately at `v1.4.20`.
- The backend never talks to provider keys directly when Bifrost is enabled; it talks to the Bifrost Admin API with basic auth.
- Agent pods never receive admin credentials; they only receive per-project virtual keys created by the backend.
- Local and prod now share the same storage/auth topology: external PostgreSQL, admin basic auth, OpenAI upstream provider, internal ClusterIP service, and namespace-local secrets.
- Prod is intentionally fixed at one Bifrost replica with HPA disabled for now, so behavior is easier to reason about while the integration is still being stabilized.
- The OpenAI provider config sets a 300s request timeout, 600s stream idle timeout, and 2 retries with 500ms-5000ms backoff to reduce transient streamed-response timeouts.

## Version Notes

- The repo is currently pinned to chart `2.0.15` with Bifrost runtime `v1.4.20`.
- The backend sends the v1.4-compatible virtual-key payload shape: `provider` plus `allowed_models`, without the v1.5 `key_ids` field.
- Existing database rows are still persisted in PostgreSQL, and any future upgrade onto the `v1.5.x` line should be done only after backing up the `bifrost` database and reapplying the official migration-guide changes.

## CI/CD

The GitHub Actions workflow (`opsiforce.yml`) handles:
1. Creates `bifrost` database on CNPG (idempotent)
2. Copies the provider keys, admin creds, encryption key, and PostgreSQL password into namespace-local secrets
3. Deploys the upstream Bifrost chart with `helm/bifrost/values.prod.yaml`
4. Applies the standalone `NetworkPolicy`
5. Passes Bifrost config to backend deployment (`bifrostProxyUrl`, `bifrostAdminUsername`, `bifrostAdminPassword`)

**Required GitHub Secrets:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `BIFROST_ADMIN_PASSWORD`, `BIFROST_ENCRYPTION_KEY`

Deploy order: infra → **Bifrost** → backend → frontend → proxy

## Local Development

Clear the `BIFROST_*` vars in `local-envs.sh` to bypass the proxy. Pods get a direct OpenAI key only if the backend local Helm values provide one.

To test the full Bifrost flow locally, keep the `BIFROST_*` vars set in `local-envs.sh`. `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are optional locally; when omitted, the script still creates the provider secret keys expected by the upstream chart, but calls routed to those upstream providers will not work until real keys are supplied.

## Non-LLM Services: Service Gateway

Bifrost handles LLM traffic only. For non-LLM external services (email, SMS, storage, webhooks), the **Service Gateway** provides per-project identity and credential isolation without Keycloak overhead.

```
LLM calls:     Agent Pod → Bifrost (virtual key) → OpenAI / Anthropic
Other calls:   Agent Pod → Service Gateway (gateway token) → Mailgun / Twilio / S3
```

Each project gets one universal gateway token (separate from Bifrost virtual keys). The gateway validates the token, resolves the project, and forwards to the real provider. Adding a new service is one provider class — no new keys or schema changes.

See [Service Gateway](./service-gateway.md) for full documentation.
