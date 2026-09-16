# File Downloads

> How a user downloads an agent-generated workspace file from chat, and why this has to be a platform feature rather than something OpenCode does. Read this before changing how `/workspace/...` links behave.

Agents frequently produce files for the user — a CSV export, a spreadsheet, a generated PDF. Those files live in the project's workspace inside the agent pod, which the browser cannot reach directly. This feature lets the user download them straight from the chat by clicking a normal link.

## How it works

When the agent wants to hand the user a file, it links to the file's workspace path in its reply, e.g. `[report.csv](/workspace/report.csv)`. The embedded OpenCode chat renders that as an ordinary link. Opsiforce installs a small click interceptor over the chat: when a clicked link points at a `/workspace/...` path, instead of letting the browser navigate to a dead URL, it asks the backend for that file and the browser saves it. That interceptor is now also the entry point for [File Preview](file-preview.md) — a format the panel can render opens there instead, and download remains one click away — but for everything else this is still the behaviour.

The backend serves the file by reading it directly from the shared workspace storage that every project environment is mounted on — the same volume uploads are written to. Because it reads from disk rather than calling into the agent, downloads work even when the agent pod is asleep, and binary files (spreadsheets, images, archives) come through untouched. Access is gated to members of the project's tenant, and paths are confined to the environment's workspace — no traversal, and known runtime secrets/data and most dotfiles are not served (the exact source-config exceptions are documented in Files Tab).

Download lives in the backend's **files module**, alongside the workspace upload endpoint: both surfaces are plain filesystem work over the same mounted volume, so they share one home and one set of guards. The path guards (traversal and null-byte rejection, per-segment length limit, the shared private-path policy, and the post-open check that the file descriptor really resolves inside the workspace) and the extension-to-content-type mapping live as helpers in that module, parameterised by a per-surface policy — download applies the private-path policy and accepts the `/workspace/...` link prefix the agent writes, upload deliberately does neither. Anything else the module grows serves itself from the same helpers rather than restating the rules.

## Why a platform feature

OpenCode has no native notion of "download this file" — in a terminal-first tool the files are already local, so its web UI just renders links and leaves them to the browser. When asked for a download, different models improvise differently: some emit ChatGPT-style `sandbox:` links (which the chat's HTML sanitizer strips to a dead anchor), others spin up a throwaway HTTP server inside the pod (which the user can't reach), others fall back to pasting the file contents into the chat. None of these reach the user.

So the download affordance has to come from the host platform. The app-builder agent is told to use one supported form — a plain `/workspace/...` link — and the platform turns that into a real download. This mirrors the way ChatGPT intercepts its own `sandbox:` links and serves the file from the sandbox.

## See also

- [Request Flows](../runtime/request-flows.md) — the upload path this mirrors (both resolve the environment's workspace directory).
- [Persistence & Storage](../runtime/persistence.md) — the shared workspace volume the file is read from.
- [File Preview](file-preview.md) — the inline sibling of this endpoint, and the panel the interceptor now opens first.
- Code: backend `backend/src/files/` (the files module — `download.controller.ts` streams the file with attachment disposition, tenant-gated; `file-paths.ts`, `file-content-types.ts`, and the shared open/stream helpers hold the guards and MIME mapping); frontend interceptor `frontend/src/components/project/workspace-file-links.tsx`; agent guidance in `agent-config/agents/app-builder/agent.md`.
