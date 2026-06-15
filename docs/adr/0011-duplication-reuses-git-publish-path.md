# Duplication reuses the publish git path plus a subtractive copy of runtime state

Status: accepted

Duplicating a Project creates the new Development `ProjectEnvironment` through the same git path publishing uses: commit the source dev working tree, `git clone --local` into the target directory, strip the `origin` remote. Runtime state is then copied separately: everything git ignores in the source workspace, **minus** a small skip-list of genuinely ephemeral caches (`.cache/`, `.bun/`, `.xdg/cache/`), copied with byte progress. The ignored set is enumerated from git itself (`git ls-files --others --ignored --exclude-standard --directory`), so the only hand-maintained artifact is the skip-list. The duplicate keeps full git history.

**The dependency store is copied, not rebuilt.** This is the crucial difference from publishing, and it follows from the app's boot contract (`app/startup.sh`): a **Production** environment runs `yarn install` on start, so publishing can ship source-only and let prod rebuild; a **Development** environment — which is what every duplicate is — never installs, it waits for `.pnp.cjs` to already exist and then runs `yarn dev`. A duplicate therefore must carry the dependency artifacts the source already produced (`**/.yarn/cache`, `**/.yarn/unplugged`, `**/.pnp.*`, and `node_modules/` for a node-linker app), or its dev server would wait forever for deps that never arrive. Copying them is also cheaper and more faithful than a network reinstall: the artifacts are already on the same shared filesystem, and copying guarantees byte-identical resolution rather than risking a different dependency graph from a fresh install.

The preserve rule is deliberately **subtractive**, never an additive preserve-list: a forgotten skip-list entry costs a slower copy, while a forgotten preserve-list entry silently loses user data (sessions, databases, **or the dependency store — which strands the app**). Only caches that the running app regenerates on its own without blocking startup are skipped. New runtime directories introduced by future agent images are preserved automatically. Because `.xdg/` is wholly git-ignored (collapsed to a single entry), the skip-list is applied during the recursive walk by repo-relative path, so nested caches like `.xdg/cache/` are skipped even inside a preserved parent.

## Considered options

- **Keep the raw full copier** (status quo) — preserves everything by construction, but copies tens of thousands of `node_modules` files one-by-one over CephFS, has no consistency boundary for tracked files, and leaves a second transfer mechanism diverging from publish forever.
- **Raw copier + rebuildables skip-list, no git** — fail-safe and minimal, but publish and duplication stay on permanently different mechanisms; rejected in favour of one aligned transfer path.
- **Track runtime state in git and exclude it at publish time** — would make duplication a pure clone, but incremental publish's `reset --hard` would overwrite the target's live `data/` and sessions with dev's, killing ADR-0004's "runtime state preserved by construction"; excluding tracked paths per-environment needs sparse-checkout negative patterns that leave permanently dirty working trees; and live SQLite/session churn would bake torn binary snapshots into history on every publish.

## Consequences

- `.gitignore` remains the single boundary of "what is source"; the skip-list is the boundary of "what is a throwaway cache". `data/`, `.xdg/share/` (OpenCode sessions), and the dependency store (`.yarn/cache`, `.pnp.*`, `.yarn/unplugged`, `node_modules`) must never appear on the skip-list.
- The duplicate runs immediately with no dependency install — its dev startup finds the copied `.pnp.cjs` and starts `yarn dev` straight away. (Contrast: a first *publish* installs on the prod env, because prod startup runs `yarn install`.)
- The dependency store is fully byte-copied, so each duplicate is wholly independent of its source (no shared inodes); the cost is the dependency-store bytes (hundreds of MB for a real app) added per duplicate.
- The torn-write risk when copying a live SQLite database is unchanged from the raw copier (the source workspace may be running during the copy).
- The clone's `origin` remote must be removed; environments later published from the duplicate clone from the duplicate's own dev directory, not the original's.
- Publish and duplicate cannot run against the same Project at once: both begin by committing the same dev working tree, so each is refused at enqueue time while the other is active (best-effort guard; git's own index lock is the backstop for the rare race).
