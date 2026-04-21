# Service Gateway

The service gateway sits between agent pods and external services (email, SMS, storage, etc.), providing per-project identity, audit logging, and credential isolation.

## Why

Agents run LLM-generated code. Injecting real API keys (Mailgun, Twilio, S3) into pods is unsafe:

- A compromised pod leaks the real key — usable from anywhere on the internet, full API access
- All projects share one key — no per-project revocation, rate limiting, or attribution
- No audit trail — the external service sees "your account", not which project sent what

The gateway solves this: each project gets a universal gateway token. The agent calls the gateway, the gateway validates the token, resolves the project, and forwards to the real provider using centrally held credentials.

## Architecture

The implementation touches three layers:

1. **Data** — `project_gateway_keys` and `gateway_audit_logs` tables, DB migration
2. **Infrastructure** — pod env var injection (`SERVICE_GATEWAY_API_KEY`, `SERVICE_GATEWAY_URL`), config
3. **Application** — gateway module with strategy pattern (provider registry)

The strategy pattern means the gateway controller and service are completely stable — adding a new external service (SMS, storage, webhooks) is just a new provider class and one line in the module factory. No new keys, no schema changes, no controller changes.

```
Agent Pod (in cluster)             Opsiforce Backend
+-----------+                      +--------------------+
|           |  POST /api/gateway   |  GatewayController |
|  Agent    | -------------------> |  @Public()         |
|           |  Bearer: <gw-token>  |  GatewayAuthGuard  |
|           |  { service: "email", |    (validates token)|
|           |    payload: {...} }  |                    |
+-----------+                      |  GatewayService    |
                                   |    |               |
                                   |    v               |
                                   |  ProviderRegistry  |
                                   |    |               |
                                   |    v               |
                                   |  EmailProvider --> Mailgun API
                                   +--------------------+
```

The gateway endpoint uses `@Public()` (bypasses TenantGuard) because agents call it directly from pods without oauth2-proxy headers. Auth is via the gateway token (Bearer).

## Security Model

| Layer | What it does |
|-------|-------------|
| **Gateway token** | Per-project Bearer token. Validates caller identity, resolves project/tenant. |
| **Separate table** | Gateway keys are NOT in `project_virtual_keys`. Avoids `revokeProjectKeys()` and `getProjectKeyBudgets()` accidentally calling Bifrost API with non-existent keys. |
| **Network restriction** | The gateway should be cluster-internal only. Restrict `/api/gateway` path in Traefik/nginx config or use a NetworkPolicy allowing traffic only from `opsiforce-agent` labeled pods. |
| **Sender restrictions** | Email provider forces `from` to the centrally configured `mailgunSender`. Agents cannot spoof arbitrary sender addresses. |
| **Surface restriction** | Agents can only call operations the provider exposes (e.g., `sendEmail`). They cannot manage Mailgun domains, routes, or stored messages — the real API key is never exposed. |

## Gateway Token Lifecycle

1. **Created** — `GatewayKeyService.createKey()` generates `gw-<uuid>`, stores in `project_gateway_keys`
2. **Stored** — plaintext in DB (same pattern as `bifrostKeyToken` in `project_virtual_keys`)
3. **Injected** — pod gets `SERVICE_GATEWAY_API_KEY` and `SERVICE_GATEWAY_URL` env vars
4. **Validated** — on each request, `GatewayAuthGuard` looks up token in `project_gateway_keys` (indexed unique column)
5. **Revoked** — `GatewayKeyService.revokeKeys()` sets `status: "revoked"` on project deletion

```
Project created
  └── createBifrostResources()   → Bifrost chat + backend virtual keys
  └── createGatewayKey()         → gateway token in project_gateway_keys

Project started (pod created)
  └── getProjectPodOptions()     → bifrost keys (OPENAI_API_KEY, APP_LLM_API_KEY)
  └── getProjectToken()          → gateway key (SERVICE_GATEWAY_API_KEY)

Project deleted
  └── bifrostService.revokeProjectKeys()    → revokes Bifrost keys via Bifrost API
  └── gatewayKeyService.revokeKeys()        → sets gateway key status to "revoked"
```

## Request Flow

```
1. Agent sends:
   POST /api/gateway
   Authorization: Bearer gw-a1b2c3d4-5678-...
   Body: { "service": "email", "payload": { "to": "...", "subject": "...", "html": "..." } }

2. GatewayAuthGuard:
   - Extracts Bearer token from Authorization header
   - Queries: SELECT project_id, tenant_id FROM project_gateway_keys
              WHERE token = ? AND status = 'active'
   - Sets request.gatewayContext = { projectId, tenantId }

3. GatewayController:
   - Reads service name from body
   - Calls gatewayService.dispatch(service, payload, context)

4. GatewayService:
   - Looks up provider in ServiceProviderRegistry
   - Calls provider.execute(payload, context)
   - Writes audit log to gateway_audit_logs (fire-and-forget)

5. EmailProvider:
   - Validates payload shape (to, subject, text/html)
   - Calls Mailgun API with real MAILGUN_API_KEY (from config)
   - Forces sender to configured mailgunSender
   - Returns { messageId }
```

## Database

### project_gateway_keys

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `project_id` | text FK | References `projects.id`, cascade delete |
| `tenant_id` | text FK | References `tenants.id` |
| `token` | text UNIQUE | `gw-<uuid>`, indexed for fast validation |
| `status` | text | `"active"` or `"revoked"` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | Set on revocation |

### gateway_audit_logs

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `project_id` | text FK | References `projects.id`, cascade delete |
| `tenant_id` | text FK | References `tenants.id` |
| `service` | text | e.g., `"email"`, `"sms"` |
| `status` | text | `"success"` or `"error"` |
| `duration_ms` | bigint | Provider call duration |
| `error_message` | text | Null on success |
| `created_at` | timestamp | |

## Adding a New Service Provider

When a new external service is needed (e.g., SMS via Twilio):

1. Create `src/gateway/providers/sms.provider.ts` implementing `ServiceProvider`:
   ```typescript
   @Injectable()
   export class SmsProvider implements ServiceProvider {
     readonly serviceName = "sms"
     async execute(payload: unknown, context: ServiceProviderContext): Promise<ServiceProviderResult> {
       // validate payload, call Twilio with real credentials from config
     }
   }
   ```

2. Register in `gateway.module.ts`:
   ```typescript
   providers: [
     // ...existing
     SmsProvider,
     {
       provide: SERVICE_PROVIDERS,
       useFactory: (email: EmailProvider, sms: SmsProvider) => [email, sms],
       inject: [EmailProvider, SmsProvider],
     },
   ]
   ```

3. Add config env vars to `configuration.ts`:
   ```typescript
   twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
   twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
   ```

No new keys, no schema changes, no controller changes. The agent calls the same endpoint with `{ "service": "sms", "payload": { ... } }`.

## Configuration

| Env Variable | Purpose | Default |
|---|---|---|
| `SERVICE_GATEWAY_URL` | In-cluster URL agents use to reach the gateway | `http://opsiforce-backend:3001/api/gateway` |
| `MAILGUN_API_KEY` | Mailgun API key (held by backend, never exposed to agents) | |
| `MAILGUN_DOMAIN` | Mailgun sending domain | |
| `MAILGUN_SENDER` | Forced sender address for all emails | |
| `MAILGUN_URL` | Custom Mailgun API URL (for local mock server) | |

No feature flag. The gateway is always active. The email provider logs a warning and returns errors if Mailgun env vars are not set.

## Deployment

The gateway endpoint (`/api/gateway`) is `@Public()` in NestJS (bypasses TenantGuard). For production, restrict external access:

**Option A: Traefik/nginx path restriction**
Block `/api/gateway` from external ingress. Only in-cluster pods can reach it via the ClusterIP service.

**Option B: Kubernetes NetworkPolicy**
Allow ingress to the backend on the gateway path only from pods with label `app: opsiforce-agent`.

Both approaches ensure the gateway is unreachable from the internet, even if the token were leaked.

## Comparison with Bifrost (LLM Gateway)

| | Bifrost (LLM) | Service Gateway (email, SMS, etc.) |
|---|---|---|
| **Scope** | LLM API calls only | Any external service |
| **Keys** | 2 per project (chat + backend) | 1 per project (universal) |
| **Key storage** | `project_virtual_keys` | `project_gateway_keys` |
| **Validation** | Bifrost validates the virtual key | Gateway validates via DB lookup |
| **Provider** | External Bifrost service (Helm chart) | Built into opsiforce backend |
| **Budget tracking** | Token count + cost via Bifrost | Audit logging (cost tracking is future work) |
| **Adding providers** | Bifrost Helm values (LLM-only) | New provider class (any HTTP service) |

Both coexist. LLM calls go through Bifrost. Everything else goes through the service gateway. Same project, two separate credential channels.

## Files and Relationships

| File | Role |
|---|---|
| `backend/src/gateway/gateway.module.ts` | NestJS module wiring |
| `backend/src/gateway/gateway.controller.ts` | `@Public() POST /api/gateway` endpoint |
| `backend/src/gateway/gateway.service.ts` | Dispatch to provider + audit logging |
| `backend/src/gateway/gateway-key.service.ts` | Token CRUD, validation, revocation |
| `backend/src/gateway/gateway-auth.guard.ts` | Bearer token guard (replaces TenantGuard for gateway routes) |
| `backend/src/gateway/providers/service-provider.interface.ts` | `ServiceProvider` interface + `SERVICE_PROVIDERS` injection token |
| `backend/src/gateway/providers/provider-registry.ts` | Service name to provider map |
| `backend/src/gateway/providers/email.provider.ts` | Mailgun integration |
| `backend/db/schema.ts` | `projectGatewayKeys` + `gatewayAuditLogs` table definitions |
| `backend/src/config/configuration.ts` | Gateway URL + Mailgun env vars |
| `backend/src/project/project.service.ts` | Creates gateway key on project create, revokes on delete |
| `backend/src/pod/pod.template.ts` | Injects `SERVICE_GATEWAY_API_KEY` + `SERVICE_GATEWAY_URL` into pods |

## Future Work

- **Rate limiting** — per-project, per-service limits using Redis sliding window (INCR + PEXPIRE). Infrastructure is ready (Redis already configured for BullMQ).
- **Service permissions** — per-project allow/deny list for which services a project can use. A `gateway_service_permissions` table. Currently all projects can use all services.
- **Cost tracking** — track per-service spend (e.g., $0.001/email) similar to Bifrost's LLM cost tracking.
- **Additional providers** — SMS (Twilio), file storage (S3), webhooks, etc.
