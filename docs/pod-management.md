# Pod Management

Warm pod pool, pod implementation details, and agent config injection.

---

## Warm Pod Pool (#1454)

The backend maintains X warm pods always running (configurable via `WARM_POOL_SIZE`).

```
Pod lifecycle:
  WARM → (assign to project) → delete warm pod → create assigned pod → ACTIVE
  ACTIVE → (30min idle) → Redis key expires → TimeoutListener suspends → replenish warm pool
  ACTIVE → (externally killed) → next proxy request detects → auto-reassign → ACTIVE
  ACTIVE → (user deletes project) → delete pod → delete project from DB
```

Warm pods have no subPath mount (empty working directory). When assigned:
1. The warm pod is deleted
2. A new pod is created with the correct `subPath: "projects/{project-id}"`
3. K8s volumes are immutable after pod creation — this is why we delete+create, not patch

If the warm pool is exhausted, pod creation falls back to creating directly (no warm pod needed). Pod template overrides (resources, nodeSelector, tolerations, affinity) are configurable via env vars / Helm values.

On startup, `PodPoolService.cleanupOrphanedPods()` deletes any K8s pods that have no matching DB record (e.g., from a previous backend session or DB reset).

---

## Pod Implementation Details

### Naming

Pod names follow the pattern `opsiforce-agent-{uuid[:8]}` — first 8 chars of the project UUID (or a fresh UUID for warm pods).

### Labels

| Label | Value | Purpose |
|-------|-------|---------|
| `app` | `opsiforce-agent` | Identifies all agent pods |
| `opsiforce.io/pool` | `warm` or `assigned` | Pool membership |
| `opsiforce.io/project-id` | `{project-id}` | Links pod to project (assigned only) |

### Readiness probe

```yaml
readinessProbe:
  httpGet:
    path: /global/health
    port: 4096
  initialDelaySeconds: 3
  periodSeconds: 5
```

Backend polls for readiness every 2s with a 60s timeout (`PodService.waitForReady`). The pod is considered ready when its `Ready` condition is `True` and it has a `podIP`.

### Restart policy

`restartPolicy: Always` — if opencode crashes inside the pod, K8s restarts the container automatically. The CephFS volume mount is preserved (pod is not recreated, only the container restarts).

### Ports

| Port | Service | Notes |
|------|---------|-------|
| 4096 | OpenCode agent | AI coding assistant (readiness probe target) |
| 8080 | code-server | VS Code web IDE |
| 3000 | App dev server | User app (single port) |

---

## LLM Gateway Integration (Bifrost)

When Bifrost is configured (`BIFROST_PROXY_URL` + `BIFROST_MASTER_KEY` set), pods get per-project virtual keys instead of the shared OpenAI API key.

### What changes in the pod spec

| Env var | Without Bifrost | With Bifrost |
|---------|----------------|--------------|
| `OPENAI_API_KEY` | Direct OpenAI key (`sk-...`) | Bifrost virtual key (`sk-bf-...`) |
| `OPENAI_BASE_URL` | Not set (default: api.openai.com) | Bifrost in-cluster URL |

The OpenAI SDK in OpenCode reads both env vars automatically — the agent doesn't know it's talking to Bifrost.

### LLM API skill

The `llm-api` skill is included in the app-builder template at `.opencode/skills/llm-api/SKILL.md`. It teaches the agent that apps it builds can use the LLM API via `APP_LLM_API_KEY` / `APP_LLM_BASE_URL`.

See [LLM Gateway](llm-gateway.md) for the full architecture.

---

## Agent Config Injection

`agent-config/` contains agent profiles and shared config baked into the Docker image and copied to the workspace by an init container.

### Directory structure

```
agent-config/
├── agent-image-version.json     ← agent Docker image version (local dev tagging)
├── agents/app-builder/          ← default agent profile
│   ├── agent.md                 ← OpenCode agent definition + system prompt
│   ├── config.json              ← agent metadata (name, description, ports)
│   └── template/                ← app template + skills
├── opencode.json                ← shared config (providers, model, permissions)
├── opencode.local.json          ← local dev override
└── scripts/                     ← entrypoint + guard
```

### Init container copies per pod

| Source in image | Destination on volume | Purpose |
|---|---|---|
| `/opt/opencode/opencode.json` | `/workspace/.xdg/config/opencode/opencode.json` | OpenCode config (providers, permissions) |
| `/opt/agents/{AGENT_NAME}/agent.md` | `/workspace/.opencode/agents/{AGENT_NAME}.md` | Agent persona + instructions |
| `/opt/agents/{AGENT_NAME}/template/` | `/workspace/` (app/, .opencode/skills/) | App template + skills (first run only) |

### Why init container instead of COPY

The volume mounts at `/workspace`, which shadows all files baked into that path. Files are staged to `/opt/opencode/` and `/opt/agents/` (outside the mount point) and the init container copies them with `cp -n` (no-clobber).

### Config selection

The Dockerfile accepts a build arg `OPENCODE_CONFIG` (defaults to `agent-config/opencode.json`). Local dev passes `--build-arg OPENCODE_CONFIG=agent-config/opencode.local.json`.

### Agent selection

`AGENT_NAME` env var (default: `app-builder`) selects which agent profile to load. See [Agents docs](agents.md) for details.

### Notes

- OpenCode discovers agents from `.opencode/agents/*.md` in the workspace
- OpenCode discovers skills from `.opencode/skills/*/SKILL.md` in the workspace
- `OPENAI_API_KEY` is injected as a pod env var at runtime (never baked into the image)
