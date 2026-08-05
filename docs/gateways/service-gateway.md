# Service Gateway

> Why agent-built apps reach external services (email, SMS, …) through a backend-owned gateway instead of holding real provider keys, and how the gateway isolates credentials per project. The non-LLM sibling of the [LLM Gateway](llm-gateway.md).

Agents run LLM-generated code. Injecting a real Mailgun/Twilio/S3 key into a pod would mean a leaked key is usable from anywhere with full API scope, every project sharing one key (no per-project revocation, rate-limiting, or attribution), and no audit trail. The gateway removes the real key from the pod entirely: each project gets one **gateway token** (`gw-<uuid>`), the agent calls the gateway with it, and the gateway validates the token, resolves the project/tenant, and forwards to the real provider using centrally-held credentials.

```
Agent Pod ──POST /api/gateway──▶ GatewayController (@Public, token-guarded)
  Bearer gw-…                      └─▶ ProviderRegistry ─▶ EmailProvider ─▶ Mailgun
  { service, payload }
```

The endpoint is `@Public()` (it bypasses the tenant/OIDC guards, since pods call it directly without oauth2-proxy headers) and authenticates solely on the gateway token. A **provider registry** keyed by service name means adding a new external service is one provider class plus one line in the module factory — no new keys, no schema change, no controller change.

## Security model

- **Per-project token** resolves caller identity; gateway keys live in their own table, never in `project_virtual_keys`, so Bifrost revocation/budget code never touches them by accident.
- **Network restriction** — the gateway path is meant to be cluster-internal only (Traefik/nginx path block or a NetworkPolicy limiting it to `opsiforce-agent` pods), so a leaked token is useless from the internet.
- **Surface & sender restriction** — agents can only invoke the operations a provider exposes (e.g. `sendEmail`), and the email provider forces `from` to the configured sender; agents can't spoof senders or manage the provider account.
- **Lifecycle** — the token is created with the project, injected as `SERVICE_GATEWAY_API_KEY`, and revoked (status flipped, not deleted) on project deletion.

The same per-project token and `{projectId, environmentId, tenantId}` resolution is reused by other features rather than inventing new credentials: [Schedules](../projects/schedules.md) (the agent registers cron jobs over it), [App Readiness](../projects/app-readiness.md) (the in-pod reporter pushes go-live/serving over it), and the external-services endpoints under `/api/gateway/external-services/…`, which are environment-scoped — they read the environment from the token and never from the request body.

## Gateway vs. Bifrost

Both give a project metered, isolated access to an external dependency, but they are separate channels:

| | Bifrost (LLM) | Service Gateway (everything else) |
|---|---|---|
| Scope | LLM calls only | any external HTTP service |
| Keys per project | 2 (chat + backend) | 1 universal token |
| Provider | external Bifrost service | built into the backend |
| Adding a provider | Bifrost config | a new provider class |

## See also

- [LLM Gateway](llm-gateway.md) — the LLM-only channel and its virtual keys.
- [Schedules](../projects/schedules.md) and [App Readiness](../projects/app-readiness.md) — the two features that reuse the gateway token.
- Code: `backend/src/gateway/` — `gateway.controller.ts` (`@Public() POST /api/gateway`), `gateway-auth.guard.ts` (Bearer token), `providers/` (registry + `email.provider.ts`); tables `project_gateway_keys` + `gateway_audit_logs` in `backend/db/schema.ts`; token injection in `backend/src/pod/pod.template.ts`.

## Future work

Rate limiting (per-project/per-service, Redis sliding window), per-project service allow/deny lists, per-service cost tracking, and more providers (SMS, storage, webhooks) are all planned; only email (Mailgun) ships today.
