# LLM Gateway

Bifrost AI Gateway sits between agent pods and upstream LLM providers, providing per-project virtual keys, usage tracking, and model governance.

## Architecture

```
Opsiforce Backend ──── Admin API (basic auth) ──→ Bifrost (ClusterIP)
       │                                              │ holds real provider API keys
       │ pod gets:                                    │ validates virtual keys
       │   OPENAI_API_KEY=<chat virtual key>          │ logs tokens/cost/latency
       │   OPENAI_BASE_URL=http://bifrost:8080/v1     │ enforces model allowlists
       │   APP_LLM_API_KEY=<backend virtual key>      │
       │   APP_LLM_BASE_URL=http://bifrost:8080/v1    │
       ▼                                              ▼
  Agent Pod ──── LLM calls ──────────────────────→ Bifrost ──→ OpenAI
```

Bifrost runs as internal-only K8s service (ClusterIP + NetworkPolicy). Real provider keys live only in Bifrost's Secret. Agent pods get per-project virtual keys.

## Dual Key Design

Each project gets two Bifrost virtual keys for separate usage tracking:

| Key Type | Purpose | Env Vars | Allowed Models |
|----------|---------|----------|----------------|
| `chat` | OpenCode agent (coding) | `OPENAI_API_KEY`, `OPENAI_BASE_URL` | OpenAI: gpt-5.3-codex, o4-mini, gpt-5.4-mini, gpt-4.1 |
| `backend` | App AI features | `APP_LLM_API_KEY`, `APP_LLM_BASE_URL` | OpenAI: gpt-4.1, gpt-5.4-mini, whisper-1 |

Both keys route through the same Bifrost instance with different virtual key tokens. The `key_type` column in `project_api_keys` distinguishes them.

**Why separate keys?**
- **Usage attribution** — "How much did the coding agent cost?" vs "How much do the app's AI features cost?"
- **Model restrictions** — Backend keys include whisper-1 for audio transcription
- **Budget enforcement** — Independent budget limits per key type

### Budget Enforcement

Each virtual key can have a per-project spending cap enforced by Bifrost's governance plugin. When the budget is exceeded, Bifrost rejects further requests. Budgets are managed via the API:

```
GET  /api/usage/projects/:id/budgets              → current budget config per key type
PUT  /api/usage/projects/:id/budgets              → update budget for a key type
     body: { keyType: "chat"|"backend", maxBudget: 50, budgetDuration: "1M" }
```

Duration values: `1m` (minute), `1h` (hour), `1d` (day), `1w` (week), `1M` (month), `1Y` (year).

Keys are created without budgets by default. Set `maxBudget: 0` to remove a limit. Budget is stored in both Bifrost (for enforcement) and the `project_api_keys` table (for reference).

## Infrastructure

### PostgreSQL

Bifrost reuses the existing PostgreSQL cluster with a **separate `bifrost` database**:
- **Production** — CNPG cluster (`postgres-cluster-rw`), database `bifrost`, created automatically by CI/CD
- **Local dev** — same PG at `localhost:5435`, database `bifrost`, created by `create-bifrost-db` script

The `bifrost` database stores virtual keys, governance config, and per-request logs. The `opsiforce` database stores the `project_api_keys` table that maps projects to virtual keys.

### Network

- Bifrost service: `ClusterIP` only (no external access)
- `NetworkPolicy`: ingress restricted to pods in the same namespace
- Backend reaches Bifrost via `BIFROST_PROXY_URL` (Admin API calls)
- Agent pods reach Bifrost via `BIFROST_POD_PROXY_URL` (LLM calls)

In production, both URLs point to the same in-cluster address. In local dev, the backend uses a port-forward (`localhost:3050`) while pods use the in-cluster service name.

## Virtual Key Lifecycle

1. **Created** — `ProjectService.buildTenantPodOptions()` (called from `startProject()`) calls `BifrostService.createProjectKey()` twice (chat + backend) via `Promise.all`
2. **Stored** — `project_api_keys` table stores two rows per project, each with `key_type`, `bifrost_key_id`, and `bifrost_key_token`
3. **Injected** — pod gets `OPENAI_API_KEY`/`OPENAI_BASE_URL` (chat) + `APP_LLM_API_KEY`/`APP_LLM_BASE_URL` (backend)
4. **Used** — agent and app call Bifrost transparently; every request logged with token counts + cost, attributed to the correct key type
5. **Revoked** — `ProjectService.remove()` calls `BifrostService.revokeProjectKeys()` which revokes all active keys for the project

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
| `OPENAI_API_KEY` | Upstream OpenAI provider key for Bifrost | GitHub Secret | shell env |
| `BIFROST_PROXY_URL` | Backend → Bifrost (Admin API) | In-cluster svc URL | `http://localhost:3050/v1` |
| `BIFROST_POD_PROXY_URL` | Pod → Bifrost (LLM calls) | Same as above (omit) | In-cluster svc URL |
| `BIFROST_ADMIN_USERNAME` | Bifrost Admin API username | `opsiforce-admin` | `opsiforce-admin` |
| `BIFROST_ADMIN_PASSWORD` | Bifrost Admin API password | GitHub Secret | `opsiforce-local-admin` |
| `BIFROST_ENCRYPTION_KEY` | Bifrost encryption key | GitHub Secret | local env file |
| `BIFROST_POSTGRES_PASSWORD` | Password copied into namespace-local chart secret | CNPG superuser password | `dbpass1` |

No feature flag — Bifrost is active when `BIFROST_PROXY_URL` + admin credentials are set. Omit them to disable (pods get `OPENAI_API_KEY` directly).

`BIFROST_POD_PROXY_URL` defaults to `BIFROST_PROXY_URL` when omitted — only needed in local dev where backend and pods have different network paths.

## Files And Relationships

| File | Role | Reads From | Produces / Affects |
|---|---|---|---|
| `backend/src/bifrost/bifrost.service.ts` | Backend admin client for virtual key CRUD and usage calls | `BIFROST_PROXY_URL`, `BIFROST_ADMIN_USERNAME`, `BIFROST_ADMIN_PASSWORD` | Calls Bifrost Admin API |
| `backend/src/config/configuration.ts` | Maps Bifrost env vars into Nest config | process env | `ConfigService` values used by backend modules |
| `backend/src/project/project.service.ts` | Creates and revokes per-project virtual keys | `BifrostService` | Pod options with Bifrost chat/backend keys |
| `backend/src/pod/pod.template.ts` | Injects Bifrost virtual keys into agent pods | pod options from `ProjectService` | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `APP_LLM_*` envs |
| `helm/opsiforce-backend/values.yaml` | Declares backend chart Bifrost env inputs | CI or local helm `--set` values | Backend deployment env surface |
| `helm/opsiforce-backend/templates/secret.yaml` | Stores backend-side Bifrost admin credentials | chart values | `BIFROST_ADMIN_USERNAME`, `BIFROST_ADMIN_PASSWORD` in backend pod |
| `helm/opsiforce-backend/templates/configmap.yaml` | Stores backend-side Bifrost URLs | chart values | `BIFROST_PROXY_URL`, `BIFROST_POD_PROXY_URL` in backend pod |
| `helm/bifrost/values.local.yaml` | Local upstream chart values | stable secret names, local PG host | Local Bifrost release config |
| `helm/bifrost/values.prod.yaml` | Cluster upstream chart values | stable secret names, CNPG host | Dev/prod cluster Bifrost release config |
| `helm/bifrost/networkpolicy.yaml` | Restricts Bifrost ingress to same namespace | upstream pod label `app.kubernetes.io/name=bifrost` | K8s ingress policy |
| `scripts/upsert-bifrost-secrets.sh` | Creates namespace-local secrets expected by upstream chart | OpenAI key, admin creds, encryption key, PG password | `opsiforce-bifrost-*` secrets |
| `scripts/install-bifrost.sh` | Local install entrypoint for upstream chart | local env vars + values file | local Bifrost release + NetworkPolicy |
| `backend/package.json` | Local command wiring | scripts above | `install-bifrost`, `port-forward-bifrost`, `minikube-dev` flow |
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

**Required GitHub Secrets:** `OPENAI_API_KEY`, `BIFROST_ADMIN_PASSWORD`, `BIFROST_ENCRYPTION_KEY`

Deploy order: infra → **Bifrost** → backend → frontend → proxy

## Local Development

Clear the `BIFROST_*` vars in `local-envs.sh` to bypass the proxy — pods get the direct OpenAI API key instead of Bifrost virtual keys.

To test the full Bifrost flow locally, export `OPENAI_API_KEY` in your shell and keep the `BIFROST_*` vars set in `local-envs.sh` — the `minikube-dev` script creates the secrets, deploys the upstream chart, and starts the port-forward automatically.

## Future: Keycloak OIDC for Non-LLM Services

Bifrost handles LLM traffic only. For future non-LLM services (Mailgun, Slack, webhooks), a Keycloak service account per project provides a unified identity.

### How it would work

```
LLM calls:     Agent Pod → Bifrost (virtual key) → OpenAI       ← current
Mailgun:       Agent Pod → Mailgun proxy (JWT) → Mailgun        ← future
Slack:         Agent Pod → Slack proxy (JWT) → Slack             ← future
```

Each project gets a Keycloak client (`client_credentials` grant) with `project_id` and `tenant_id` as JWT claims. Any internal proxy validates the JWT against Keycloak's JWKS endpoint.

### When to add Keycloak

Add per-project Keycloak clients when:
- Agent-built apps need to send emails (Mailgun integration)
- Agent-built apps need to call external APIs (Slack, webhooks)
- Any service needs per-project identity beyond LLM calls

### Implementation pattern

Follow the existing pattern in `keycloak-ms-backend/src/modules/clients/`:
1. Create Keycloak client via Admin REST API (raw `fetch`, no SDK)
2. Set `serviceAccountsEnabled: true`, add `oidc-hardcoded-claim-mapper` for `project_id` and `tenant_id`
3. Store client credentials in `project_api_keys` table (add columns) or a new table
4. Inject `KEYCLOAK_CLIENT_ID` + `KEYCLOAK_CLIENT_SECRET` into pods alongside Bifrost virtual key
5. Non-LLM service proxies validate JWT, extract project/tenant claims, forward with real service key

The Bifrost virtual key (for LLM) and Keycloak JWT (for everything else) coexist — each handles its own service domain.
