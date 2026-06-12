# Duplication reuses the publish git path plus a subtractive copy of runtime state

Status: accepted

Duplicating a Project creates the new Development `ProjectEnvironment` through the same git path publishing uses: commit the source dev working tree, `git clone --local` into the target directory, strip the `origin` remote. Runtime state is then copied separately: everything git ignores in the source workspace, **minus** a small rebuildables skip-list (`node_modules/`, `**/.yarn/*`, `**/.pnp.*`, `.cache/`, `.bun/`, `.xdg/cache/`), copied with byte progress. The ignored set is enumerated from git itself (`git ls-files --others --ignored --exclude-standard --directory`), so the only hand-maintained artifact is the skip-list. The duplicate keeps full git history; dependencies are reinstalled on first start exactly like a freshly published environment.

The preserve rule is deliberately **subtractive**, never an additive preserve-list: a forgotten skip-list entry costs a slower copy, while a forgotten preserve-list entry silently loses user data (sessions, databases). New runtime directories introduced by future agent images are preserved automatically.

## Considered options

- **Keep the raw full copier** (status quo) — preserves everything by construction, but copies tens of thousands of `node_modules` files one-by-one over CephFS, has no consistency boundary for tracked files, and leaves a second transfer mechanism diverging from publish forever.
- **Raw copier + rebuildables skip-list, no git** — fail-safe and minimal, but publish and duplication stay on permanently different mechanisms; rejected in favour of one aligned transfer path.
- **Track runtime state in git and exclude it at publish time** — would make duplication a pure clone, but incremental publish's `reset --hard` would overwrite the target's live `data/` and sessions with dev's, killing ADR-0004's "runtime state preserved by construction"; excluding tracked paths per-environment needs sparse-checkout negative patterns that leave permanently dirty working trees; and live SQLite/session churn would bake torn binary snapshots into history on every publish.

## Consequences

- `.gitignore` remains the single boundary of "what is source"; the skip-list is the boundary of "what is rebuildable". `data/` and `.xdg/share/` (OpenCode sessions) must never appear on the skip-list.
- The duplicate's first start installs dependencies — same behaviour and UX as a first publish.
- The torn-write risk when copying a live SQLite database is unchanged from the raw copier (the source workspace may be running during the copy).
- The clone's `origin` remote must be removed; environments later published from the duplicate clone from the duplicate's own dev directory, not the original's.
