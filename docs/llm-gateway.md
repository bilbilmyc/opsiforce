# LLM Gateway

Bifrost AI Gateway sits between agent pods and OpenAI, providing per-project virtual keys, usage tracking, and model governance.

## Architecture

```
Opsiforce Backend ──── Admin API (master key) ──→ Bifrost (ClusterIP)
       │                                              │ holds real OPENAI_API_KEY
       │ pod gets:                                    │ validates virtual keys
       │   OPENAI_API_KEY=<chat virtual key>          │ logs tokens/cost/latency
       │   OPENAI_BASE_URL=http://bifrost:8080/v1     │ enforces model allowlists
       │   APP_LLM_API_KEY=<backend virtual key>      │
       │   APP_LLM_BASE_URL=http://bifrost:8080/v1    │
       ▼                                              ▼
  Agent Pod ──── LLM calls ──────────────────────→ Bifrost ──→ OpenAI
```

Bifrost runs as internal-only K8s service (ClusterIP + NetworkPolicy). Real OpenAI key lives only in Bifrost's Secret. Agent pods get per-project virtual keys.

## Dual Key Design

Each project gets two Bifrost virtual keys for separate usage tracking:

| Key Type | Purpose | Env Vars | Allowed Models |
|----------|---------|----------|----------------|
| `chat` | OpenCode agent (coding) | `OPENAI_API_KEY`, `OPENAI_BASE_URL` | gpt-5.3-codex, o4-mini, gpt-5.4-mini, gpt-4.1 |
| `backend` | App AI features | `APP_LLM_API_KEY`, `APP_LLM_BASE_URL` | gpt-4.1, gpt-5.4-mini |

Both keys route through the same Bifrost instance with different virtual key tokens. The `key_type` column in `project_api_keys` distinguishes them.

**Why separate keys?**
- **Usage attribution** — "How much did the coding agent cost?" vs "How much do the app's AI features cost?"
- **Model restrictions** — Backend keys limited to cheaper/faster models
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
- `NetworkPolicy`: ingress restricted to `app: opsiforce-agent` pods
- Backend reaches Bifrost via `BIFROST_PROXY_URL` (Admin API calls)
- Agent pods reach Bifrost via `BIFROST_POD_PROXY_URL` (LLM calls)

In production, both URLs point to the same in-cluster address. In local dev, the backend uses a port-forward (`localhost:3050`) while pods use the in-cluster service name.

## Virtual Key Lifecycle

1. **Created** — `ProjectService.assignPod()` calls `BifrostService.createProjectKey()` twice (chat + backend) via `Promise.all`
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

The `llm-api` skill is included in the app-builder template at `.opencode/skills/llm-api/SKILL.md`. It teaches the agent that `APP_LLM_API_KEY` and `APP_LLM_BASE_URL` are set, with examples for text generation, structured output (JSON mode + JSON schema), streaming, and multi-turn conversation.

## Configuration

| Env Variable | Purpose | Production | Local |
|---|---|---|---|
| `BIFROST_PROXY_URL` | Backend → Bifrost (Admin API) | In-cluster svc URL | Commented out (disabled) |
| `BIFROST_POD_PROXY_URL` | Pod → Bifrost (LLM calls) | Same as above (omit) | In-cluster svc URL |
| `BIFROST_MASTER_KEY` | Admin API authentication | GitHub Secret | `local-test-master-key` |

No feature flag — Bifrost is active when `BIFROST_PROXY_URL` + `BIFROST_MASTER_KEY` are set. Omit them to disable (pods get `OPENAI_API_KEY` directly).

`BIFROST_POD_PROXY_URL` defaults to `BIFROST_PROXY_URL` when omitted — only needed in local dev where backend and pods have different network paths.

## CI/CD

The GitHub Actions workflow (`opsiforce.yml`) handles:
1. Creates `bifrost` database on CNPG (idempotent)
2. Deploys Bifrost helm chart with DB URL, OpenAI key, and master key
3. Passes Bifrost config to backend deployment (`bifrostEnabled`, `bifrostProxyUrl`, `bifrostMasterKey`)

**Required GitHub Secret:** `BIFROST_MASTER_KEY` — generate with `openssl rand -hex 32`.

Deploy order: infra → **Bifrost** → backend → frontend → proxy

## Local Development

Leave `BIFROST_PROXY_URL` unset (commented out in `local-envs.sh`) to bypass the proxy — pods get `OPENAI_API_KEY` directly. Developers can also use `opencode providers login` for ChatGPT Pro subscription access (stored on workspace volume, persists across pod restarts).

To test the full Bifrost flow locally, uncomment the `BIFROST_*` vars in `local-envs.sh` — the `minikube-dev` script deploys Bifrost automatically.

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
