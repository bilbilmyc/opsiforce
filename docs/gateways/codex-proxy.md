# Codex Proxy (host LLM bridge)

> How the standalone local stack reaches an LLM without anyone provisioning API credits: a small proxy on the developer's machine that drives their ChatGPT/Codex subscription. Read this before touching `codex-proxy/` or the Quickstart's LLM step. The deliberate, risk-accepted choice to make this the standalone default lives in [ADR-0018](../adr/0018-standalone-llm-access-via-codex-proxy.md).

The codex proxy is a tiny, dependency-light TypeScript server in its own workspace (`codex-proxy/`). It runs **on the host**, not in the cluster, because it needs the browser to log in and reaches OpenAI directly. It exposes an OpenAI-compatible surface (`/v1/models` and `/v1/responses`) and forwards calls to the upstream Codex backend, signing each request with the operator's subscription token. It is built from Node built-ins only — no web framework, no database, no UI — so it can run before `yarn install` has populated anything and stays trivial to read.

```
Agent Pod ──▶ Bifrost ──▶ host.minikube.internal:<port> ──▶ codex proxy ──▶ chatgpt.com/backend-api/codex
 (virtual key)  (custom    (the host bridge; Bifrost          (adds bearer +     (the subscription's
                 provider)   egress is allowed)                account id)         own backend)
```

## Who talks to it

Its only caller is the [LLM Gateway](llm-gateway.md). In the standalone stack Bifrost's OpenAI-compatible **custom providers** (`custom-openai-1/2/3`) point their `base_url` at the proxy over the host bridge (`host.minikube.internal`). Nothing in the product knows the proxy exists; to Bifrost it is just an OpenAI endpoint. That is the whole point — the agent's default model stays `openai/gpt-5.5`, and only which provider serves it changes.

## What it does

- **`GET /v1/models`** returns the subscription's catalogue in OpenAI list shape, so the gateway (and the Quickstart's first-run model check) can see that `gpt-5.5` is available.
- **`POST /v1/responses`** is a near-transparent reverse proxy. It forwards the caller's request body untouched, swaps in the subscription's bearer token and `chatgpt-account-id`, and streams the Server-Sent-Events response straight back. The caller's own `authorization` header never reaches upstream and the real token never reaches the caller.
- **`GET /healthz`** is a liveness check for the process orchestrator.

## How it authenticates

Authentication is a browser **device-code login** against `auth.openai.com`, run once via the proxy's `login` command (the Quickstart invokes it during setup). The proxy requests a user code, opens the verification page, and polls until the operator finishes signing in; it then exchanges the result for tokens and writes them to **`~/.opsiforce/codex-auth.json`**. That file lives under the user's home — gitignored and outside the repo — so a re-clone keeps the login, and a Quickstart `--reset` clears it to exercise a fresh first run.

The stored token is a user secret on the host (written with owner-only permissions). It is short-lived, so before every forwarded call the proxy checks expiry and, if needed, **refreshes the token in place** and persists the new one. Concurrent calls during an expiry collapse onto a single in-flight refresh. If no token is present, `/v1/responses` answers `401` telling the operator to run the login.

## Why it is shaped this way

This rides an **unofficial, undocumented upstream** — it authenticates with the official Codex CLI's client id and calls a backend OpenAI does not publish for this use. That risk is acknowledged and accepted (see [ADR-0018](../adr/0018-standalone-llm-access-via-codex-proxy.md)) because it lets a contributor try Opsiforce on a subscription they already have, with no credits to buy. The "use your OpenAI API key" wizard option is the always-available alternative when the subscription path breaks. The endpoints and the device-flow client behaviour are modelled on the source-level [OpenCode integration](../overview.md)'s own Codex auth path, which exercises the same surface.

## See also

- [LLM Gateway](llm-gateway.md) — Bifrost, the custom providers, and the host-bridge egress that reaches this proxy.
- [ADR-0018](../adr/0018-standalone-llm-access-via-codex-proxy.md) — why the subscription proxy is the standalone default rather than bring-your-own-key.
- Code: `codex-proxy/src/` (config, OAuth device flow, token refresh, the HTTP server).
