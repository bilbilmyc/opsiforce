# Agents

> What an Agent is, how its files reach a project workspace, and where its model and behaviour are defined. Read this before changing anything under `agent-config/`.

An **Agent** is the AI coding assistant a user converses with inside a ProjectEnvironment's pod. The platform ships one — **app-builder** — as the default. An Agent is a *profile*: an identity and system prompt, a set of skills, a starter template, and the model it runs on. Everything that defines an agent lives in `agent-config/`, baked into the agent Docker image.

## Anatomy of an agent profile

```
agent-config/
├── agents.json                 ← registry: per-agent model, variant, poolSize, template version
├── opencode.json               ← shared OpenCode config (providers, permissions, default_agent)
├── skills/                     ← shared skill pool: UI-neutral skills every agent composes in
├── agents/<name>/
│   ├── agent.md                ← OpenCode agent definition (frontmatter + system prompt)
│   ├── skills/                 ← this agent's skill overrides (compose with the shared pool)
│   └── template/               ← files copied into a new project's workspace
├── private/                    ← private Agents + registry fragment, excluded from the standalone mirror
└── scripts/{entrypoint,guard,compose-skills}.{sh,mjs}
```

`agents.json` is the registry — one entry per agent carrying its **model**, OpenCode model `variant`, [pending-pool](../runtime/pool.md) `poolSize`, and template `version`. There is no per-agent `config.json`; the registry holds those fields. The public registry ships `app-builder`; any further agents live in the private fragment (see [Private agents and the standalone seam](#private-agents-and-the-standalone-seam)).

## Registry → database

The registry is the single source of truth for **which agents exist**. The `agents` table — referenced by `projects.agentId` and surfaced in the Agent picker — is derived from it at backend boot, not hand-seeded. A reconciler (`backend/src/agent/agent-reconciler.service.ts`) runs once on startup: it loads the merged registry (the public `agents.json` plus an optional private fragment, for agents that never ship in the standalone mirror) and upserts the table **keyed by slug** (the registry key, which is the table's `name`). A slug present in the registry but missing from the table is inserted with a freshly generated id; a slug that already has a row keeps its id and picks up any display-name change. The slug is immutable once shipped — rename the display name, never the slug, or reconciliation would orphan the old row.

Two invariants make this safe to run on every boot. It **never rewrites an existing id**, so `app-builder`'s id (referenced by every Project) survives untouched. And it is **additive only**: a row whose slug is absent from the registry is left exactly as-is — not deleted, not deactivated — so a retired agent's existing Projects keep resolving and running. Repeated boots converge to the same rows (idempotent). Description is not stored; it is read live from the registry at query time, so it always reflects the current `agents.json`.

This extends [ADR-0008](../adr/0008-agent-model-owned-by-agent-config.md)'s "agent-config wins" principle from the agent's *model* to the agent's *identity*. The historical seed migrations stay immutable, but no new per-agent SQL seed migration is added going forward — registering an agent is a registry edit, and the reconciler does the rest.

## Private agents and the standalone seam

Some Agents ship only in the full distribution and never reach the **standalone** mirror. Such an Agent lives entirely under `agent-config/private/` — its profile, skill overrides, and template under `private/agents/<slug>/` (the same layout as a public agent), and its registry entry in the **private registry fragment** `private/agents.json`. The whole directory is excluded from the standalone mirror, so neither the Agent's files nor even its name appear there.

The reconciler closes over this seam without branching on it. It reads the private fragment and merges it over the public registry — private entries are added, the public registry is never overwritten — then reconciles the `agents` table from the merged result. In the standalone build the mirror carries the empty **stub fragment** `private/agents.standalone.json` (`{ "agents": {} }`) in place of the real `agents.json`, so the merge yields only the public agents. The reconciler also falls back to that same empty stub when the private directory is absent, so a standalone build compiles and boots with `app-builder` alone and no dangling reference to the private location. The runtime config consumers read the same merged registry: pending-pool warm-up, the picker description, and the per-agent model and template version all honour a private Agent's fields wherever it ships, and in the standalone build — where the merge yields only the public agents — they see exactly `app-builder`. The agent image stages every agent the same way, baking a merged `agents.json` (public ∪ private fragment) so the in-pod workspace migration resolves the right model and version per agent.

Docs that ship in the mirror carry no private Agent's name, stack, or purpose — and no design rationale that only makes sense by comparison with one, since comparative prose leaks whichever side is private. A private Agent's own domain notes, and any rationale for how its profile diverges, live behind the seam.

## How an agent reaches a workspace

The image stages every agent under `/opt/agents/`, each with a complete, self-contained `skills/` directory already assembled at build time (see [Skills](#skills)). At pod startup an init container reads `AGENT_NAME` (default `app-builder`) and lays the profile onto the mounted workspace: the agent definition to `/workspace/.opencode/agents/<name>.md`, the skills to `/workspace/.opencode/skills/`, the shared OpenCode config — with the agent's model and variant injected — to `/workspace/.opencode/opencode.json`, and — only when `/workspace/app` does not yet exist — the starter template to `/workspace/`. The `.opencode` directory is watched by OpenCode and sits at the **highest** file-config precedence, so the platform's model, provider list, and permissions win over any `opencode.json` a project's repo ships, and Agent Updates refresh them just by rewriting the files ([ADR-0024](../adr/0024-agent-opencode-config-lives-in-the-workspace-opencode-dir.md)).

Agent-owned files (prompt, skills, config) are platform-owned and refreshed on every pod (re)assignment; the app template is project-owned after creation, so an existing app keeps its files unless an explicit migration changes them. Keeping long-running workspaces in step with a newer profile without a pod restart is the job of [Agent Updates](agent-updates.md).

## Model

app-builder runs on **`openai/gpt-5.6-sol`** with OpenCode's **high** model variant, set as `model` and `variant` in `agents.json`. The model is mirrored as the baked default in `opencode.json`, and the pod init/update paths stamp the agent's `provider/model#variant` into each workspace's OpenCode config. The model is a property of the agent profile, uniform across every tenant and project — **not** a tunable default; changing it is a code/config rollout. That deliberate asymmetry (the model lives with the agent, while timeouts and budgets are per-tenant [Defaults](../organization/defaults.md)) is recorded in [ADR-0008](../adr/0008-agent-model-owned-by-agent-config.md). OpenCode's built-in `build` agent is disabled and `plan` (read-only) is kept, so app-builder is the only build-capable agent.

The list of models a user can pick is `agent-config/models.json`, a hand-maintained catalog in the same shape as `https://models.dev/api.json` holding only our providers and models. The image copies it to `/opt/opencode/models.json`; `OPENCODE_MODELS_PATH` makes it the exclusive catalog and the runtime models.dev refresh is disabled. OpenCode v2 has no per-provider allow-list, and naming a provider in `opencode.json` would otherwise expose that provider's entire public catalog; the file replaces the feed, so it is both the allow-list and the source of each model's name, release date, cost and limits. The built-in OpenCode Zen provider is switched off with the `-opencode.provider.opencode` plugin directive. `opencode.json` still carries the per-model reasoning variants and the Bifrost base URLs. Adding a model means copying its models.dev record into `models.json` and adding its variants to `opencode.json` ([ADR-0032](../adr/0032-model-catalog-is-a-file-in-the-agent-image.md)).

## Skills

Skills are OpenCode's on-demand instruction system: the agent sees each skill's name + description and loads the full `SKILL.md` only when a task matches. They follow Anthropic's skill-authoring guidance: trigger-word-rich descriptions, project-specific patterns over generic library docs, a "common mistakes" section, and cross-references.

Skills are split across two locations so a UI-neutral skill is authored once for every agent. The **shared pool** at `agent-config/skills/` holds the UI-neutral skills (data-fetching, dates, the `llm-api` skill, `nestjs-api`, `sqlite`, …); each agent's `agents/<name>/skills/` holds only that agent's **overrides** (for app-builder: the UI-coupled `ui`, `charts`, `frontend-design`, `react-table`). At image-build time `scripts/compose-skills.mjs` assembles each agent's baked `skills/` as **shared ∪ overrides**, an override replacing a shared skill of the same `name` directory-for-directory. The result is a single self-contained directory per agent — no symlinks, no cross-agent references — so the runtime copy ([above](#how-an-agent-reaches-a-workspace)) is unchanged. The composed directory, not either source, is what each agent ships. Editing a shared skill fixes it for every agent on the next image build.

## App template

New App Builder projects start from a framework-neutral bootstrap in a shared Node.js/Python/Go environment. The single agent selects an internal scaffold from the request, preserving any existing source. See [Unified App Builder](../runtime/template-selection.md). The previous React/Nest scaffold remains available internally; it no longer determines every new project.

## See also

- [Agent Updates](agent-updates.md) — keeping persisted workspaces aligned with a newer profile.
- [App Readiness](../projects/app-readiness.md) — go-live detection (the `app.meta.json` the template omits).
- [Defaults](../organization/defaults.md) / [ADR-0008](../adr/0008-agent-model-owned-by-agent-config.md) — why the model is *not* a configurable default.
- Code: `agent-config/` (profiles, `agents.json`, `opencode.json`, the shared `skills/` pool, `scripts/`), `agent-config/scripts/compose-skills.mjs` (build-time skill compose) and `agent-config/scripts/merge-registry.mjs` (build-time public ∪ private registry merge), `docker/Dockerfile.agent` (runs both), `backend/src/pod/pod.template.ts` (init-container injection), `backend/src/agent/agent-config.ts` (reads and merges `agents.json`).
