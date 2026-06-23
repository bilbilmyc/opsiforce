# App Auth is enforced per `ProjectEnvironment`, seeded once from Development

Status: accepted

`auth_mode` (`public` | `manual` | `managed`) was already a per-`ProjectEnvironment` column, but *enforcement* was not. App auth is a Traefik `Middleware` + `IngressRoute` built by `ProjectAuthService`, and it was keyed by `projectId`, matching only `Host(`{projectId}.apps…`)` — i.e. only Development's host (Development reuses the project id, ADR-0002). Published environments are served at `{projectEnvironmentId}.apps…`, caught by the wildcard `HostRegexp([a-f0-9-]+\.apps…)` route to the app proxy with **no** middleware. So a published environment whose stored `auth_mode` was `manual`/`managed` was reachable with no OIDC at all: the database said "protected", the network said "open".

**Re-key by routing id.** The middleware/IngressRoute is keyed by the *routing id* (the environment id) instead of the project id. Because Development's environment id *equals* its project id, its resource names (`opsiforce-project-{id}-*`) and host are byte-for-byte unchanged — no migration, no orphaned resources — while published environments get their own resources matching their own host at priority 100, which overrides the wildcard.

**Seed once, then independent.** App auth is seeded once from Development at first publish and managed independently per environment thereafter. The seed *clones Development's middleware spec* to the new host (rewriting only the resource name and `CallbackUri`): one mode-agnostic path that carries `manual`'s client secret — which lives only inside the middleware — and `managed`'s tenant-role claims, without re-deriving either. Redeploys never touch auth.

**Early and fail-closed.** The seed runs *before the published app can serve* and is *fail-closed*: if Development is `manual`/`managed` and its middleware cannot be created, the publish fails. Creating it after the app is ready, or logging and continuing, would leave a supposed-to-be-protected environment briefly (or permanently) reachable on the wildcard route. For a security control, "never expose" beats "never block a deploy".

**Why `managed` is safe to clone and `manual` is not.** There is one shared `opsiforce-apps` identity-provider client with a `*` redirect URI and a tenant-wide `assertClaims` role, so a published environment's `{uuid}.apps…/oidc/callback` is accepted with no identity-provider change — `managed` works the instant it is cloned. `manual` points at the customer's own IdP, which must whitelist each environment's callback; the per-environment Auth UI surfaces that callback URL, but a freshly published `manual` environment comes up protected with **sign-in failing until the customer registers it** — again fail-closed, and self-healing once they do.

**Management surface.** Per-environment **Auth** and **Pin** are managed from the Environments dialog (one row per environment), not the project kebab menu — which removes the hidden "acts on whichever environment is currently active" dependency. Pin is single-select across environments (one catalog entry per project).

## Considered options

- **Re-key with a new `opsiforce-env-{envId}` prefix** — a clearer name, but it renames Development's live middleware → orphaned resources and a coordinated cleanup migration. Rejected in favour of keeping the template and renaming only the parameter to a routing id.
- **Mode-switch inherit** — re-derive `managed` via `applyManaged` and copy `manual`'s config explicitly, instead of cloning. Two code paths and more surface; cloning the spec carries `manual`'s secret for free. Rejected.
- **Late / fail-open seed** — no orphaned middleware when a publish fails, but a real exposure window and the risk of silently shipping an unprotected environment. Rejected.
- **Move OIDC config to the database** — the middleware is already the authoritative store (`getConfig` reads it back); a DB copy adds a second source of truth for a client secret with no benefit. Rejected.

## Consequences

- No schema migration: `auth_mode` and `pinned_environment_id` already exist, and OIDC config stays in the middleware.
- Deleting a non-Development environment must now `remove` its middleware + IngressRoute (previously only Development had one, and it is never deleted); deleting the **pinned** environment now **unpins** rather than silently repointing the catalog to Development (which may not be `public`).
- The managed-auth-reapply job — since renamed `managed-auth-sync` (run when a tenant's external tenant name changes) — must fan out to **every** `managed` environment by routing id, not just the first one it finds.
- The `*` redirect URI on `opsiforce-apps` is a pre-existing open-redirect smell this feature relies on but does not fix — flagged for the security review.
- The project-scoped `GET/PUT /projects/:id/auth` endpoint is replaced by `/projects/:id/environments/:envId/auth`; Development is addressed as `envId == projectId`.
- Partially superseded by ADR 0012 on hostnames: an environment now answers on two hosts (`{envId}-{slug}` and bare `{envId}`), the auth IngressRoute matches both, and the middleware's callback became the relative `/oidc/callback` — so `manual` owners register one callback URL per hostname (the Auth dialog lists both).
