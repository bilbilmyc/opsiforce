# standalone local LLM access runs through a host Codex-subscription proxy

Status: accepted

The standalone local stack reaches an LLM through a **small host-run proxy that drives the operator's ChatGPT/Codex subscription**, registered behind Bifrost's `custom-openai` providers — *not* through a paid OpenAI/Anthropic API key by default. The wizard's LLM step offers two clearly described choices: **"Use a ChatGPT/Codex subscription"** (the default — stands up the local proxy and grabs a token via an `auth.openai.com` device-code login in the browser) and **"Use your OpenAI API key"** (a real `openai` Bifrost provider). Either way the agent's default model stays `openai/gpt-5.5`, so the choice changes only which provider serves it.

The proxy is a minimal rewrite of the team's exported "Codex OAuth Dock" app — no NestJS, no SQLite, no UI: a dependency-light TS server (Node built-ins) exposing `/v1/models` + `/v1/responses`, forwarding to `chatgpt.com/backend-api/codex` with the subscription's bearer token + `chatgpt-account-id`, refreshing the token before each call, persisting it at `~/.opsiforce/codex-auth.json`. It runs on the host (it needs the browser to log in and reaches OpenAI directly); Bifrost in-cluster reaches it at `http://host.minikube.internal:<port>`.

We chose this over the safer "bring your own API key" default because the point of the standalone spin-up is that someone can try Opsiforce on a subscription they likely already have, with no API credits to provision and pay for — the lowest possible barrier to a first run.

## Considered options

- **BYO key as the only path; codex-proxy kept private (maintainer-only).** Cleanest public repo — ships no reverse-engineered access — but gives up the "run it on a subscription you already have" adoption story, which is the reason the proxy exists. Rejected as the *default*, but preserved as the second wizard option.
- **Pluggable with BYO-key the default, codex-proxy an opt-in.** The middle ground; rejected because it buries the path we want most contributors to take behind a non-default toggle.
- **codex-proxy the default, BYO-key the alternative** (chosen). Maximum adoption; accepts the exposure below.

## Consequences

- **It rides an unofficial, undocumented surface.** The proxy authenticates with the official Codex CLI's `client_id` against `auth.openai.com` and calls `chatgpt.com/backend-api/codex` — outside OpenAI's intended use and terms, in a company-associated *public* repo. The endpoint can change or break without notice, and publishing it invites a takedown. The risk is acknowledged and accepted for the standalone default; the BYO-key option is the always-available escape hatch.
- **The token is a user secret on the host**, stored unencrypted at `~/.opsiforce/codex-auth.json` (gitignored, outside the repo so a re-clone keeps it). Acquired once via the wizard's device-code step, auto-refreshed thereafter.
- **Three `custom-openai-*` providers in a weighted rotation.** `bifrost.providers.ts` weights `custom-openai-1/2/3` evenly for the `chat` key type. In the committed values all three carry the team's upstream `base_url`; `custom-openai-1` pins an explicit model list while `-2`/`-3` accept any model (`["*"]`). The standalone `llm` step's overlay repoints all three at the operator's chosen upstream — `host.minikube.internal` for the subscription path, the OpenAI API for the BYO-key path — so the keyless rotation resolves whichever provider Bifrost picks.
- **Model availability is verified at first run.** If the subscription's `/v1/models` does not serve `gpt-5.5`, the wizard sets the agent's default to a model it does return; the BYO-OpenAI path keeps `gpt-5.5` unchanged.
- **Bifrost's `networkpolicy.yaml` must permit egress to `host.minikube.internal`** for the in-cluster gateway to reach the host proxy.
- **The proxy lives in the public repo** as its own small workspace (`codex-proxy/`), following the package rules (named exports, no `any`, no comments).
