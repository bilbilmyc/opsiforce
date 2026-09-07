# Agent-owned file changes need no OpenCode reload call

Status: accepted (2026-09-04)

## Context

Agent Updates rewrite the agent-owned files in a project workspace (`/workspace/.opencode/opencode.json`, `agents/<name>.md`, `skills/`) and then had to make the running OpenCode pick them up. On OpenCode 1.x the runtime loaded config and agents once into an in-memory instance and never watched files, so the pipeline called `POST /instance/dispose` after writing ([ADR-0024](0024-agent-opencode-config-lives-in-the-workspace-opencode-dir.md) moved the config into `.opencode` precisely because the old location sat in a memo that dispose could not clear). OpenCode v2 removed that route. The first v2 migration replaced it with `POST /restart-opencode` on agent-control, a supervised restart of the opencode process: correct, but each rollout cost every project a few seconds of downtime and dropped open event streams.

OpenCode v2 watches every config root it discovers, including the workspace `.opencode` directory, and rebuilds config, agents, skills and plugins on change. Tested on 2026-09-04 by running the real `agent-workspace-migrate` script against a modified profile: the new system prompt, a new skill and a changed model variant were visible through the API within two seconds, a live prompt obeyed the new system prompt, and the process id never changed.

## Decision

Writing the files is the reload. The pipeline records an update as applied once the Job succeeds; nothing is called on the pod. The `requiresOpenCodeReload` flag, the `restart-opencode` endpoint, the backend restart path and the `requires_open_code_reload` column are removed rather than kept as an escape hatch, so no code path can reintroduce the downtime. A pod recreate remains the only lever for changes outside the watched roots: the opencode binary, environment variables, template files a running pod cannot absorb.

## Considered options

- **Keep `POST /restart-opencode` as a manual escape hatch.** Rejected: an unused path that costs downtime invites reuse, and a hung process is already the health check's and `guard`'s job.
- **Call `DELETE /api/debug/location` after writing.** Rejected: it is a debug route with no stability promise, and the watcher makes it redundant.
- **Inject config through `OPENCODE_CONFIG_CONTENT` instead of workspace files.** Deferred: it would remove the init-container copy but environment variables cannot hot-reload, which would bring the restart back.

## Consequences

- Profile-only rollouts (prompt, skills, model or effort) are zero-downtime and take effect within seconds of the Job finishing.
- A session's own stored model selection still wins over the agent default for that session; a variant change reaches sessions that have not pinned one.
- A hung opencode process is handled by the pod's health checks and `guard`, not by the update pipeline.
- `DELETE /api/debug/location` would evict and rebuild a location instance if the watcher ever failed, but it lives under a debug prefix and is deliberately not wired in.
