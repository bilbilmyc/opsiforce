# App identity is read at runtime, not hardcoded by the agent

Status: accepted

An app's name lives in `app.meta.json` and has two writers: the agent, which creates the file when the app goes live, and humans, whose Edit-details action writes the file and mirrors it into the `projectApps` row. The browser tab title, however, was whatever the template's `index.html` shipped (`App`) unless the agent happened to hardcode a name into it — so a human rename via Edit details updated the catalog label and the preview header but left the running app's own tab stale, and the only fix on offer was a "keep the title in sync" prompt rule the model could silently ignore.

**The template now reads identity at runtime.** `main.tsx` renders an `<AppTitleSync />` component that queries the template's existing `/api/app-meta` route (which reads `app.meta.json` fresh on every request) and sets `document.title`; `index.html` points at a fixed `frontend/public/favicon.svg`, shipped as a neutral placeholder. The agent's responsibility shrinks to two prompt rules: write `app.meta.json` only after the first feature is built and its checks pass — go-live is deliberately the last step — carrying an existing name/description forward verbatim unless the user explicitly asks to rename; and overwrite the placeholder favicon at go-live with a flat, brand-colored SVG glyph representing the app (letter-mark fallback, no image generation by default). Title sync is structural — it cannot drift the way a prompt instruction can.

## Considered options

- **Prompt-enforced sync** — instruct the agent to copy the name into `index.html` and keep it updated. Rejected: it fails silently whenever the model ignores it, and human renames would never propagate without an agent turn.
- **Propagating human renames into published environments' files** — Edit details writes only the Development copy of `app.meta.json`; writing into published environment directories would mutate git-managed publish state behind the publish path (ADR 0004). Rejected: a published app's tab title catches up at its next publish, while the catalog label (read from the DB row) updates immediately.
- **Generated favicons (`gpt-image-2`)** — slower, costs tokens, and raster output turns muddy at 16 px. Rejected as the default; a user can still explicitly ask the agent for a fancier icon.
- **Migrating existing projects** — a managed template migration could additively patch `main.tsx`, `index.html`, and `public/`. Deliberately skipped for now: those files are agent-owned and divergent in existing workspaces, and the feature is not worth the patch risk. Template change only; new projects get it from agent image `0.9.41`.

## Consequences

- A human rename via Edit details reaches the Development app's tab on the next load or window focus, the app catalog immediately, and a published environment at its next publish.
- `main.tsx` is declared platform plumbing in the agent prompt. The protection is convention — prompt wording plus placement in a file the agent has no reason to rewrite — not enforcement, the same trust model as the rest of the workspace.
- Existing projects keep hardcoded titles and have no favicon until someone ships the migration described above.
- The favicon path (`frontend/public/favicon.svg`) is a fixed contract between template, prompt, and any future migration.
