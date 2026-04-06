# LLM Gateway

Bifrost AI Gateway sits between agent pods and OpenAI, providing per-project virtual keys, usage tracking, and budget enforcement.

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

Bifrost runs as internal-only K8s service (ClusterIP + NetworkPolicy). Real OpenAI key lives only in Bifrost's Secret. Agent pods get per-project virtual keys.

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

1. **Created** — `ProjectService.assignPod()` calls `BifrostService.createProjectKey()` → POST to Bifrost Admin API
2. **Stored** — `project_api_keys` table stores `bifrost_key_id` + `bifrost_key_token` per project
3. **Injected** — pod gets `OPENAI_API_KEY=<virtual key>` and `OPENAI_BASE_URL=<bifrost url>`
4. **Used** — agent calls Bifrost transparently; every request logged with token counts + cost
5. **Revoked** — `ProjectService.remove()` calls `BifrostService.revokeProjectKey()` → DELETE on Bifrost

## Usage API

```
GET /api/usage                    → aggregate usage for current tenant
GET /api/usage/projects/:id       → usage for specific project
```

Returns zeros when Bifrost is not configured (no `BIFROST_PROXY_URL`).

## Dynamic Skills

When Bifrost is enabled, an `ai-api` skill is injected into each project pod at creation time. This teaches the agent that `OPENAI_API_KEY` and `OPENAI_BASE_URL` are set, enabling apps the agent builds to use AI features.

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
