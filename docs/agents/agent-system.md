# Agents

> What an Agent is, how its files reach a project workspace, and where its model and behaviour are defined. Read this before changing anything under `agent-config/`.

An **Agent** is the AI coding assistant a user converses with inside a ProjectEnvironment's pod. The platform ships one — **app-builder** — as the default. An Agent is a *profile*: an identity and system prompt, a set of skills, a starter template, and the model it runs on. Everything that defines an agent lives in `agent-config/`, baked into the agent Docker image.

## Anatomy of an agent profile

```
agent-config/
├── agents.json                 ← registry: per-agent model, poolSize, template version
├── opencode.json               ← shared OpenCode config (providers, permissions, default_agent)
├── agents/<name>/
│   ├── agent.md                ← OpenCode agent definition (frontmatter + system prompt)
│   ├── skills/                 ← on-demand instruction modules (SKILL.md each)
│   └── template/               ← files copied into a new project's workspace
├── plugins/image-normalize.ts  ← OpenCode plugin (see below)
└── scripts/{entrypoint,guard}.sh
```

`agents.json` is the registry — one entry per agent carrying its **model**, its [pending-pool](../runtime/pool.md) `poolSize`, and its template `version`. There is no per-agent `config.json`; the registry holds those fields. Only `app-builder` ships today.

## How an agent reaches a workspace

The image stages every agent under `/opt/agents/`. At pod startup an init container reads `AGENT_NAME` (default `app-builder`) and lays the profile onto the mounted workspace: the agent definition to `/workspace/.opencode/agents/<name>.md`, the skills to `/workspace/.opencode/skills/`, the injected model over the workspace `opencode.json`, and — only when `/workspace/app` does not yet exist — the starter template to `/workspace/`. OpenCode then merges config lowest-to-highest: workspace `opencode.json` → agent definition → skills.

Agent-owned files (prompt, skills, config) are platform-owned and refreshed on every pod (re)assignment; the app template is project-owned after creation, so an existing app keeps its files unless an explicit migration changes them. Keeping long-running workspaces in step with a newer profile without a pod restart is the job of [Agent Updates](agent-updates.md).

## Model

app-builder runs on **GPT-5.5**, set as `model` in `agents.json` and mirrored as the baked default in `opencode.json`. The model is a property of the agent profile, uniform across every tenant and project — **not** a tunable default; changing it is a code/config rollout. That deliberate asymmetry (the model lives with the agent, while timeouts and budgets are per-tenant [Defaults](../organization/defaults.md)) is recorded in [ADR-0008](../adr/0008-agent-model-owned-by-agent-config.md). OpenCode's built-in `build` agent is disabled and `plan` (read-only) is kept, so app-builder is the only build-capable agent.

## Skills

Skills are OpenCode's on-demand instruction system: the agent sees each skill's name + description and loads the full `SKILL.md` only when a task matches. app-builder ships a library of them (UI, data-fetching, charts, auth, the `llm-api` skill, …) under `agents/app-builder/skills/` — that directory is the source of truth for which exist. They follow Anthropic's skill-authoring guidance: trigger-word-rich descriptions, project-specific patterns over generic library docs, a "common mistakes" section, and cross-references.

## App template

New app-builder projects start from `agents/app-builder/template/app/` — a React + Tailwind v4 + shadcn/ui frontend and a NestJS + `bun:sqlite` backend, with TanStack Query/Table, React Router, and the rest pre-installed so the agent builds features, not scaffolding. The template ships **without** `app.meta.json`; the agent writes it as the deliberate last step of the first build, which is what makes the app go live (see [App Readiness](../projects/app-readiness.md) — go-live is pushed from the pod, never polled).

## Image normalization plugin

`plugins/image-normalize.ts` is an in-house OpenCode plugin that resizes any image above 2000px or 5 MB before it is persisted. This exists because Anthropic rejects requests whose images exceed its vision limits — and the limit drops to **2000px per dimension once a request carries more than 20 images**, which long screenshot-heavy sessions routinely do; one oversized image in history would then reject every subsequent request and brick the session. It hooks OpenCode at three points (`chat.message` and `tool.execute.after` to normalize at intake; `experimental.chat.messages.transform` as a backstop that also heals already-poisoned histories), preserves aspect ratio, and fails open (logs and passes the original through). It carries its own `package.json` (`sharp ^0.34.5`); re-run its tests when upgrading `opencode-ai`.

## See also

- [Agent Updates](agent-updates.md) — keeping persisted workspaces aligned with a newer profile.
- [App Readiness](../projects/app-readiness.md) — go-live detection (the `app.meta.json` the template omits).
- [Defaults](../organization/defaults.md) / [ADR-0008](../adr/0008-agent-model-owned-by-agent-config.md) — why the model is *not* a configurable default.
- Code: `agent-config/` (profiles, `agents.json`, `opencode.json`, `plugins/`, `scripts/`), `backend/src/pod/pod.template.ts` (init-container injection), `backend/src/agent/agent-config.ts` (reads `agents.json`).
