# Node frameworks and frontend integration

Read the actual package.json and lock file. Use one package manager per package; keep dependencies pinned and honor its lock on startup. Node is installed in the shared environment, but frameworks are project dependencies. Consult official framework documentation for the installed version when needed.

## Next.js or another Node server

Initialize `custom-startup@1` only for an untouched workspace. Implement the requested framework in app, including its real routes and dependencies. Write `app/run-app.sh` LAST, after dependencies, checks and source are ready: the supervisor waits for that file before starting. Write to a temporary file and rename it so startup never sees a half-written launcher.

The launcher runs from app. Install from the committed lock; in production build first, then `exec` the production server on `0.0.0.0:${APP_PORT:-3000}`. In development exec its dev server. Use `exec` for the final process so the parent restart trap reaches the framework. Keep `startup.sh` and `run-backend.sh` from the scaffold. Avoid backgrounding an unmanaged server.

For Next.js use real App Router pages and server route handlers. Implement /api/health and /api/app-meta using Node runtime server code (filesystem access is server-only). Business database/config helpers remain server-only; never import them from client components. Test a real production build and server before claiming publish readiness. Next.js SSR/API applications require the Next production server, not a static export or Vite preview.

## Vue or React with Python/Go

Retain the backend scaffold and add frontend in app/frontend. Use Vue SFCs and Vue routing for Vue; React components and routing for React. Install framework-appropriate packages. Reuse the platform contract from the primary instructions rather than importing NestJS implementation assumptions.

Allocate the backend an internal port (for example 3100); expose only the frontend listener at APP_PORT (3000). In development configure its same-origin /api proxy, including health and app-meta. In production build the frontend and serve its static output with an explicitly implemented proxy/server or through the backend. Verify history fallback, static assets and identical API prefixes in development and production. Avoid falling back to index.html for missing API endpoints. Preserve API streaming/WebSocket semantics when the feature uses them.

Update the existing startup to supervise both processes with app-backend and app-frontend guard names, forward signals and wait for their lifecycle. Do not nest guards with the same name. Use the recipe's run-backend.sh for dependency and restart handling. Test that the platform restart command restarts the intended processes and that a persisted row survives.

If using Next.js with a separate backend, define route ownership: retain its own route handlers or reserve a separate backend prefix, and proxy that prefix consistently. Never forward every /api request to the backend if Next also owns routes there.

## Verification

Run framework type checks/tests and production build. Check the real browser flow, public API paths, invalid inputs and metadata updates. Reboot from committed files and lock files without development caches. Record what actually passed; frontend/backend combinations remain project-specific integrations until their publish and persistence checks have passed.
