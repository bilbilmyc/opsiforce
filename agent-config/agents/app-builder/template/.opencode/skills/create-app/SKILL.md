---
name: create-app
description: Create or modify the web application — master skill that orchestrates the full build process. Use whenever the user asks to build an app, create a feature, make changes to the application, or wants anything built. This is your primary skill — load it first for any app-related work.
---

# App Creation & Modification

This skill guides you through building a complete web application. The app template is pre-configured with React + Tailwind + shadcn/ui (frontend) and NestJS + SQLite (backend).

## Step 0 — Check if app already exists

Before anything else, check if `app/app.meta.json` already exists:

```bash
cat app/app.meta.json 2>/dev/null
```

If it exists, this chat already has an app. DO NOT create a new one. Instead, modify the existing app based on the user's request. Skip to the relevant step (UI changes, API changes, database changes, etc.).

If the user explicitly asks to create a completely different app, tell them: "To build a different app, please start a new chat. This chat's app can be modified but not replaced."

## Step 1 — Write metadata (ALWAYS do this first for NEW apps)

Create `app/app.meta.json` immediately when starting:

```json
{
  "name": "Task Manager",
  "description": "A task management app with priorities and due dates"
}
```

This tells the system to show the live preview to the user. Without this file, the user cannot see the app.

## Step 2 — Replace the default template & design system

**The default template is a placeholder.** `App.tsx` and `pages/home.tsx` show a generic "Your App" welcome page with sample items — this must be **completely replaced** with the new app's UI. The user should never see the template placeholder.

1. **Overwrite `App.tsx`** with the new root component — add Router, layout, navigation, and import your new pages
2. **Delete or replace `pages/home.tsx`** — create new page files for the actual app
3. **Update colors** in `frontend/src/index.css` (`--primary`, `--accent` CSS variables) to match the app's brand
4. Plan the layout: sidebar? top nav? dashboard grid?

Do NOT try to modify the default Home page — replace it entirely.

Use the `tailwindcss` and `shadcn` skills for implementation details.

## Step 3 — Database schema

Create migration files for your data model. Every table should have `id`, `created_at`, `updated_at` at minimum.

Use the `sqlite-database` skill for migration patterns.

## Step 4 — Backend API

Create NestJS modules for each resource. Follow the module/controller/service pattern exactly.

**CRITICAL:** Register every new module in `app.module.ts` imports array. This is the #1 error.

Use the `nestjs-api` skill for the exact pattern.

## Step 5 — Frontend pages

Build the UI using pre-installed shadcn components and Tailwind. Fetch data with TanStack Query.

Use skills: `shadcn`, `tailwindcss`, `tanstack-query`, `react-forms`, `recharts` (for charts).

## How frontend and backend connect

The frontend talks to the backend via `fetch("/api/...")`. The backend is a NestJS server on port 3100, and Vite proxies `/api` requests to it.

```
User clicks "Save" → React form (react-forms)
  → useMutation calls fetch("/api/tasks", { method: "POST", body: ... })  (tanstack-query)
    → NestJS TasksController.create() receives the request  (nestjs-api)
      → TasksService.create() inserts into SQLite  (sqlite-database)
        → Returns new task as JSON
      → useMutation.onSuccess invalidates cache  (tanstack-query)
    → useQuery refetches → UI updates automatically
```

Every feature follows this same loop. Use `tanstack-query` for all frontend data fetching, `nestjs-api` for all backend endpoints, and `sqlite-database` for all data storage.

## App structure

```
app/
  frontend/src/
    components/ui/    — shadcn components (pre-installed: button, card, input, badge)
    lib/utils.ts      — cn() helper
    pages/            — page components
    App.tsx            — root component (add Router here if multi-page)
    main.tsx           — entry point with QueryClientProvider
    index.css          — Tailwind + theme CSS variables
  backend/src/
    main.ts            — NestJS bootstrap (port 3100)
    app.module.ts      — root module (REGISTER ALL MODULES HERE)
    app.controller.ts  — health + app-meta endpoints
    database/          — DatabaseService (global, inject anywhere)
    items/             — example CRUD module
    migrations/        — SQL files (auto-run on startup)
  data/                — SQLite database (auto-created)
  app.meta.json        — YOU CREATE THIS
```

## Available skills

### Core (use on almost every app)

| Skill | When to use |
|---|---|
| `tailwindcss` | Styling, theme customization, responsive, dark mode |
| `shadcn` | UI components, Radix primitives, component variants |
| `nestjs-api` | Backend endpoints, modules, services |
| `sqlite-database` | Tables, migrations, SQL queries |
| `tanstack-query` | Data fetching, mutations, cache |
| `react-router` | Multi-page routing, layout routes, protected routes |
| `react-forms` | Form validation with zod, multi-field forms |
| `lucide-icons` | Icons (1500+ available) |
| `sonner-toasts` | Toast notifications, loading states |
| `common-patterns` | Error boundaries, loading/empty states, layouts |

### Features (use when the app needs them)

| Skill | When to use |
|---|---|
| `react-table` | Data tables with sorting, filtering, pagination |
| `recharts` | Charts, dashboards, analytics, data visualization |
| `zustand` | Client-side shared state (filters, selections, UI) |
| `motion-animation` | Animations, transitions, scroll reveals |
| `date-fns` | Date formatting, date picker, date ranges |
| `react-dropzone` | File uploads with drag-and-drop |
| `dnd-kit` | Drag and drop, kanban boards, reorderable lists |
| `react-markdown` | Render markdown content, AI chat messages |
| `axios-http` | HTTP requests, external APIs, file upload |
| `bun-sqlite` | Advanced SQLite (transactions, FTS, JSON) |
| `auth-patterns` | Login, register, JWT auth, protected routes |
| `data-export` | CSV export, JSON download, print views, clipboard |
| `cmdk-command` | Command palette (Cmd+K), searchable menus |
| `vaul-drawer` | Bottom sheets, mobile drawers, slide-out panels |
| `carousel` | Image galleries, sliders, testimonials |
| `virtual-list` | Large lists (100+ items), virtualized tables |
| `resizable-panels` | Split pane views, resizable sidebars, IDE layouts |
| `input-otp` | OTP/PIN code inputs, verification codes |
| `search-and-filter` | Filter bars, URL-synced search, backend WHERE clauses |
| `tabs-and-navigation` | Tabs, collapsible sidebars, breadcrumbs, dashboard shells |
| `multi-step-wizard` | Multi-step forms, onboarding flows, checkout wizards |

## Rules

1. **One app per chat.** Modify the existing app. If the user wants a different app, they should create a new chat.
2. **No placeholders.** Every file must contain complete, working code. Never write "// TODO" or "implement later."
3. **No localStorage for data.** Use the SQLite database via the backend API for all persistent data. Exception: auth tokens can use localStorage (see `auth-patterns` skill).
4. **No monolithic files.** Split large components into smaller ones. Each NestJS feature gets its own module folder.
5. **Mobile-first.** Design for mobile screens first, then scale up with responsive Tailwind classes.
6. **Complete files only.** When editing a file, always provide the complete updated content.
7. **Install packages if needed.** Run `cd /workspace/app && bun add <package>` for anything not pre-installed.
8. **The user is not technical.** Communicate changes in plain English, one short sentence. No file paths, no jargon.
