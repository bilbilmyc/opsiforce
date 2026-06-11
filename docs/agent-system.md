# Agent System

Agent configuration, templates, skills, and multi-agent architecture.

## Directory Structure

```
agent-config/
├── agents/                      ← one folder per agent type
│   └── app-builder/             ← default agent
│       ├── agent.md             ← OpenCode agent definition (YAML frontmatter + system prompt)
│       ├── config.json          ← our metadata (name, description, ports, default flag)
│       ├── skills/              ← OpenCode skills synced onto the workspace at pod startup
│       └── template/            ← files copied to workspace on project creation
│           └── app/             ← application template (React + NestJS + SQLite)
├── opencode.json                ← shared OpenCode config (providers, model, permissions)
└── scripts/
    ├── entrypoint.sh            ← pod entrypoint (starts opencode + app dev servers)
    └── guard.sh                 ← process supervisor (auto-restarts crashed processes)
```

## Adding a New Agent

1. Create `agent-config/agents/<agent-name>/`
2. Add `agent.md` — OpenCode agent definition with YAML frontmatter:
   ```markdown
   ---
   mode: primary
   description: What this agent does
   color: "#hex"
   ---
   System prompt instructions here...
   ```
3. Add `config.json` — metadata:
   ```json
   {
     "name": "Display Name",
     "description": "What it does",
     "default": false,
     "port": 3000
   }
   ```
   The `name` and `description` are user-facing: they appear per agent in the sidebar **New project** menu (icon + name + description), so keep the description short and plain-language.
4. Add `skills/` — OpenCode skills copied to `/workspace/.opencode/skills`
5. Add `template/` — files copied to workspace for new projects only
6. Set `AGENT_NAME=<agent-name>` env var to use it

## How Agents Load at Runtime

1. Docker image stages all agents at `/opt/agents/`
2. Pod init container reads `AGENT_NAME` env var (default: `app-builder`)
3. Copies `agent.md` to `/workspace/.opencode/agents/<name>.md`
4. Replaces `/workspace/.opencode/skills` with the agent's current skills
5. Copies the agent's template to `/workspace/` only when `/workspace/app` does not exist
6. Agent update jobs store per-agent migration state at `/workspace/.opsiforce/agents/<name>.json`
7. OpenCode discovers the agent and uses it as the primary agent

## Config Hierarchy

OpenCode merges config from multiple sources (lowest → highest priority):
1. `opencode.json` at workspace root → shared providers, permissions
2. `.opencode/agents/*.md` → agent definitions (from profile's agent.md)
3. `.opencode/skills/*/SKILL.md` → skills (from profile's skills directory)

## Primary agents and default model

The platform ships one custom primary agent — **app-builder** — set as `default_agent` in `opencode.json`. It runs on **GPT-5.5** by default. `agent-config/agents.json` is the single source of truth for the agent model: the pod init container injects its value over the workspace `opencode.json` at startup, and the same value is mirrored as the baked default in `opencode.json` / `opencode.local.json`.

OpenCode also bundles two built-in primary agents, **build** and **plan**. We keep **plan** (read-only planning) available alongside app-builder and disable the built-in **build** agent via `"agent": { "build": { "disable": true } }` in `opencode.json`, so app-builder is the only build-capable agent users can switch to.

## Skills

Skills are OpenCode's on-demand instruction system. The agent sees skill names + descriptions, and loads full content when needed.

### Skill structure

Each skill is a directory with a `SKILL.md` file:
```yaml
---
name: skill-name
description: When to load this skill (used for auto-invocation)
---
# Skill instructions, patterns, code examples...
```

### Current app-builder skills (33)

**Core (loaded on almost every app):**
- `frontend-design` — visual identity, creative direction, design quality, anti-patterns
- `tailwindcss` — theme system (OKLCH tokens, dark mode, tw-animate-css)
- `ui` — shadcn/ui components (Button, Card, Input, Badge + all Radix primitives), forms, theming, icons, accessibility
- `data-fetching` — all API requests (useQuery, useMutation, cache invalidation, optimistic updates, file uploads, external APIs from backend)
- `nestjs-api` — backend module/controller/service pattern
- `sqlite` — migrations, DatabaseService API, transactions, FTS, JSON
- `react-router` — routing, layout routes, protected routes, search params
- `react-forms` — react-hook-form + zod, multi-field forms, field arrays
- `lucide-icons` — 1500+ icons, categorized by usage
- `sonner-toasts` — toast notifications, loading states
- `common-patterns` — error boundaries, loading/empty states, debounced search

**Feature skills (loaded when the app needs them):**
- `react-table` — data tables with sorting, filtering, pagination, row selection
- `charts` — Recharts (bar, line, area, pie/donut, scatter, composed), reference lines/areas, brush zoom, synced charts, custom theme-aware tooltips, sparklines
- `state-management` — client-side shared state (Zustand v5: stores, selectors, useShallow, persist, devtools, immer, slices)
- `animations` — motion/react (Framer Motion v12+): enter/exit, hover/tap, drag, swipe, AnimatePresence, layout transitions, scroll reveals, parallax, page transitions, useReducedMotion, transition presets
- `dates` — dates/time (date-fns v4 + `@date-fns/tz`): formatting, parsing, intervals, relative time, timezones, calendar pickers
- `react-dropzone` — file uploads with preview and backend integration
- `dnd-kit` — drag and drop, sortable lists, kanban boards
- `react-markdown` — markdown rendering with GFM support
- `bun-sqlite` — advanced SQLite (transactions, FTS, JSON, window functions)
- `auth-patterns` — login/register, JWT (jose), password hashing (bcryptjs), protected routes
- `data-export` — CSV export, JSON download, print views, copy to clipboard
- `cmdk-command` — command palette (Cmd+K), searchable select
- `vaul-drawer` — bottom sheets, mobile drawers, responsive dialog pattern
- `carousel` — image galleries, sliders (embla-carousel)
- `virtual-list` — virtualized lists/tables for large datasets (@tanstack/react-virtual)
- `resizable-panels` — split pane views, resizable sidebars
- `input-otp` — OTP/PIN code inputs
- `search-and-filter` — filter bars, URL-synced search, backend WHERE clauses
- `tabs-and-navigation` — tabs, collapsible sidebars, breadcrumbs, dashboard shells
- `multi-step-wizard` — multi-step forms, onboarding flows
- `llm-api` — AI features via OpenAI-compatible API: text, JSON, streaming, vision, audio transcription (APP_LLM_API_KEY)

### Skill design principles

Following Anthropic's official skill authoring guidelines:
- Descriptions include specific trigger words for auto-invocation
- Content focuses on project-specific patterns (not generic library docs)
- Each skill has a "Common mistakes" section for the #1 failure modes
- Cross-references between related skills (e.g., react-forms → data-fetching for mutation flow)
- All code examples use the project's actual theme tokens and component imports

## App Template (app-builder)

React + Tailwind v4 + shadcn/ui frontend, NestJS + bun:sqlite backend.

### Template structure

```
app/
  frontend/src/
    App.tsx           — BrowserRouter + Layout (nav + Outlet) + routes pre-configured
    main.tsx          — entry point (QueryClientProvider pre-configured)
    index.css         — Tailwind v4 theme (OKLCH CSS variables, @theme inline)
    pages/home.tsx    — default home page (agent builds on or replaces)
    components/ui/    — pre-installed: button, card, input, badge
    lib/utils.ts      — cn() helper (clsx + tailwind-merge)
  backend/src/
    main.ts           — NestJS bootstrap (port 3100, /api prefix)
    app.module.ts     — root module
    app.controller.ts — health + app-meta endpoints
    database/         — DatabaseService (bun:sqlite, global, auto-migrations)
    items/            — example CRUD module (agent replaces with its own)
    migrations/       — SQL files (run alphabetically, each once)
  data/               — SQLite database (auto-created)
```

Note: `app.meta.json` does NOT exist in the template. The agent creates it as its first step, which triggers the live preview in the opsiforce frontend.

### Pre-installed packages

95 packages including: React 19, Tailwind v4, shadcn/ui (28 Radix primitives), TanStack Query v5, TanStack Table v8, TanStack Virtual v3, React Router v7, react-hook-form, zod, zustand v5, recharts, date-fns, motion (Framer Motion), sonner, cmdk, vaul, embla-carousel, react-resizable-panels, input-otp, react-dropzone, react-markdown, @dnd-kit, react-error-boundary, NestJS 11, jose, bcryptjs, nanoid, uuid.

### App preview flow

1. Template starts with no `app.meta.json` → upstream `/api/app-meta` returns `{ exists: false }`
2. Opsiforce backend polls upstream `/api/app-meta` every 3 seconds while at least one project SSE subscriber is listening
3. Agent creates `app/app.meta.json` with `{ "name": "...", "description": "..." }`
4. Next poll returns `{ exists: true, name: "...", ... }` → backend pushes update on the project SSE → preview iframe opens
5. User sees live preview with hot reload as agent builds

### Agent system prompt highlights

- Communication: plain English, one sentence, no technical jargon
- Data fetching: ALWAYS use TanStack Query (never raw fetch in components)
- Design quality: pick brand colors, avoid generic "AI slop", load frontend-design skill
- Template: build on the pre-configured App.tsx (BrowserRouter + Layout + routes already set up)
- Type checking: `bun run check` after every code change

## Image Optimization

Anthropic rejects requests whose images exceed its vision limits: 8000px per dimension normally, but only **2000px per dimension once a request carries more than 20 images** — which long agent sessions full of screenshots routinely do. An oversized image persisted in history then rejects every subsequent request, bricking the session. The in-house `image-normalize` OpenCode plugin (`agent-config/plugins/image-normalize.ts`) resizes any image above 2000px or 5 MB down to fit, so requests pass regardless of image count.

It hooks OpenCode at three points:

- `chat.message` and `tool.execute.after` — normalize pasted images and tool-result attachments at intake, before they are persisted, so each image is resized exactly once.
- `experimental.chat.messages.transform` — sweeps every outgoing request as a backstop, which also heals sessions that already carry oversized images in history.

Resizing preserves aspect ratio (`sharp` fit-inside, never crops), keeps PNG when it fits the byte cap, and falls back to a descending-quality JPEG ladder otherwise. Failures are logged through OpenCode's app log and the original image passes through untouched — the plugin never breaks a request itself.

- Lives in `agent-config/plugins/` with its own `package.json` (sharp); installed into `/opt/opencode/plugins` in `docker/Dockerfile.agent` and registered via `"plugin": ["file:///opt/opencode/plugins/image-normalize.ts"]`.
- Replaced the third-party `opencode-large-image-optimizer`, which only handled the 8000px single-image limit (by cropping) and was fetched from npm at pod runtime.
- `npm run ts` / `npm run test` inside `agent-config/plugins/` typecheck and test it; re-run the tests when upgrading `opencode-ai` to confirm the hook contract still holds.
- No skill or agent code needs to know about it — it's transparent. Skills producing images should not add their own resize logic.

## Timeout System

Two Redis keys per project:
- Agent activity (`opsiforce:timeout:`) — TTL: project `timeoutIdle` converted from ms to Redis seconds
- App activity (`opsiforce:app-timeout:`) — TTL: project `appTimeoutIdle` converted from ms to Redis seconds

Built-in backend defaults are written into new projects:
- agent timeout defaults to `30` minutes
- app timeout defaults to `7` days

Pod suspended only when both keys expire.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_NAME` | `app-builder` | Which agent profile to load |
| `APP_PORT` | `3000` | Port for app preview proxy |
