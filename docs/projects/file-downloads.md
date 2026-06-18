# File Downloads

> How a user downloads an agent-generated workspace file from chat, and why this has to be a platform feature rather than something OpenCode does. Read this before changing how `/workspace/...` links behave.

Agents frequently produce files for the user — a CSV export, a spreadsheet, a generated PDF. Those files live in the project's workspace inside the agent pod, which the browser cannot reach directly. This feature lets the user download them straight from the chat by clicking a normal link.

## How it works

When the agent wants to hand the user a file, it links to the file's workspace path in its reply, e.g. `[report.csv](/workspace/report.csv)`. The embedded OpenCode chat renders that as an ordinary link. Opsiforce installs a small click interceptor over the chat: when a clicked link points at a `/workspace/...` path, instead of letting the browser navigate to a dead URL, it asks the backend for that file and the browser saves it.

The backend serves the file by reading it directly from the shared workspace storage that every project environment is mounted on — the same volume uploads are written to. Because it reads from disk rather than calling into the agent, downloads work even when the agent pod is asleep, and binary files (spreadsheets, images, archives) come through untouched. Access is gated to members of the project's tenant, and paths are confined to the environment's workspace — no traversal, and hidden/dot files (which can hold platform secrets) are not served.

## Why a platform feature

OpenCode has no native notion of "download this file" — in a terminal-first tool the files are already local, so its web UI just renders links and leaves them to the browser. When asked for a download, different models improvise differently: some emit ChatGPT-style `sandbox:` links (which the chat's HTML sanitizer strips to a dead anchor), others spin up a throwaway HTTP server inside the pod (which the user can't reach), others fall back to pasting the file contents into the chat. None of these reach the user.

So the download affordance has to come from the host platform. The app-builder agent is told to use one supported form — a plain `/workspace/...` link — and the platform turns that into a real download. This mirrors the way ChatGPT intercepts its own `sandbox:` links and serves the file from the sandbox.

## See also

- [Request Flows](../runtime/request-flows.md) — the upload path this mirrors (both resolve the environment's workspace directory).
- [Persistence & Storage](../runtime/persistence.md) — the shared workspace volume the file is read from.
- Code: backend `backend/src/project/download.controller.ts` + `download.service.ts` (streams the file with attachment disposition, tenant-gated, no traversal/dotfiles); frontend interceptor `frontend/src/components/project/workspace-download-links.tsx`; agent guidance in `agent-config/agents/app-builder/agent.md`.
