# Quickstart — `yarn dev`

> One command stands up the whole Opsiforce stack on your Mac: `yarn dev`. It detects and pins your tools, starts a local Kubernetes cluster, builds the images, brings up the databases and the LLM gateway, connects an LLM, and opens the app already signed in. This is the narrative orientation to that experience — what the command does, the choices it asks you to make, and how to live with it day to day. For the mechanics underneath it (the tunnel, Tilt, the dev identity) see [Local Orchestration](development/local-orchestration.md).

## macOS only

The Quickstart supports **macOS only**, and refuses to run anywhere else — it leans on Homebrew for tool installs, `minikube tunnel` for routing, and `host.minikube.internal` for the host-side LLM bridge. On any other platform it prints the detected platform and exits without touching your machine. There is no Linux or Windows path; if you are not on a Mac, the Quickstart is not for you.

## What one command does

From the package root, run:

```bash
yarn dev
```

It walks a fixed sequence of numbered steps and prints each one as it goes — running, done, or cached. The steps move from your host outward into the cluster: detect and pin your tools, size and start the cluster, open the privileged network tunnel, install in-cluster infra and TLS, install workspace dependencies, build the images, create and migrate the databases, install the LLM gateway, connect an LLM, optionally enable local email testing, bring the stack up under Tilt, and finally open the app. You do not memorise the list — the command narrates it, and the authoritative sequence (with each step's title and one-line detail) lives in the `STEPS` array in `scripts/spin-up.mjs`.

Most steps run unattended. The few that need you are the resource-sizing prompt (it suggests a CPU/RAM split from your host and lets you adjust), the one-time administrator password the tunnel needs, the LLM choice below, and a quick opt-in for local email testing (off by default). When everything is up it prints the addresses you'll use — the **app**, the **Tilt UI**, the **Bifrost** dashboard, and the **data-store** ports — and opens the app in your browser, already signed in as a local dev user. (Why you're signed in with no login screen is covered in [Local Orchestration](development/local-orchestration.md).)

## Choosing an LLM

The app-builder agent needs a model to talk to, so one step asks how you want to provide it. There are two choices, and either way the agent's default model stays `openai/gpt-5.5` — only the upstream that serves it changes.

- **ChatGPT / Codex subscription** (the default, recommended). This drives a ChatGPT subscription you already pay for, with no extra per-token API charges. You sign in once through a browser device-code login against OpenAI; the token is stored locally under your home directory and refreshed for you on later runs. The trade-off is that it rides an unofficial OpenAI endpoint that can change without notice — a deliberate, risk-accepted choice so you can try Opsiforce on credits you already have. The full story is in [Codex Proxy](gateways/codex-proxy.md) and [ADR-0018](adr/0018-standalone-llm-access-via-codex-proxy.md).
- **Your own OpenAI API key.** Paste a key (or set `OPENAI_API_KEY` before running) and OpenAI bills your account per token. This path is always available and fully supported — it's the fallback when the subscription path breaks.

After connecting, the step checks that the chosen provider actually serves the agent's default model and, if it doesn't, lets you pick an available one. Re-running `yarn dev` remembers your last choice as the default, so you can switch providers later just by running it again.

## Day-two re-runs

`yarn dev` is meant to be run again and again — it is idempotent and resumable, not a one-shot installer. Each step records that it finished, so a second run fast-paths past the cached work and lands you on a healthy stack quickly. Two steps deliberately re-run every time regardless of cache: the network **tunnel** and the **`up`** step that drives Tilt, because those keep the live stack reconciled with the current cluster.

If a step fails, the command stops there, prints the error, and saves its progress. Fix the underlying problem and run `yarn dev` again — it resumes at the failed step rather than starting over. The progress, your saved choices, and the subscription login token all live under `~/.opsiforce/`, outside the repo, so a re-clone keeps them.

A few flags shape a run; `yarn dev --help` lists them in full:

- `--yes` runs non-interactively, consenting to the prerequisite tool installs (useful in a script).
- `--cpus N` / `--memory G` set the cluster's CPU count and memory in GB without the sizing prompt, and re-apply on every run.
- `--reset` tears the cluster down and clears `~/.opsiforce/` — the next `yarn dev` is a clean first run. Reach for it when you want to exercise setup from scratch or recover from a wedged cluster, and note that it also clears the stored subscription login.

## Pinned versions

The Quickstart behaves the same on every machine because it installs against one tracked list of versions: **`versions.json`** at the repo root. That manifest is the single source of truth — it carries the reproducibility-critical *exact* pins (Node, Yarn, the cluster Kubernetes version, the Helm charts) and the softer host-CLI tools, each with a *tested* version and a *floor* the prerequisites step warns about but never blocks on. Read the manifest, not this page, for the actual numbers; copying them into prose only invites drift. Refresh the *tested* observations and the pinned cluster version from a known-good machine with `scripts/capture-baseline.mjs`.

## See also

- [Local Orchestration](development/local-orchestration.md) — the tunnel, Tilt as the one-UI process orchestrator, and why the app opens already signed in.
- [Codex Proxy](gateways/codex-proxy.md) and [ADR-0018](adr/0018-standalone-llm-access-via-codex-proxy.md) — the subscription LLM path and the decision behind it.
- [Commands](development/commands.md) — the commands you run *while* developing, once the stack is up.
