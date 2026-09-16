## Go / net/http recipe

This project uses `go@1`. Implement handlers using net/http and persist through database/sql with the locked modernc.org/sqlite driver. Read user config through `loadConfig()`; keep framework dependencies intentional rather than replacing the template by default.

Manage dependencies with go.mod/go.sum, inspect changes after `go get` and `go mod tidy`, and keep boot builds in `-mod=readonly` mode. This recipe uses a pure Go SQLite driver with CGO disabled; a change to a CGO driver requires an explicit toolchain/system-library adaptation.

Before restart, run:

```bash
cd /workspace/app/backend
gofmt -w ./*.go
GOTOOLCHAIN=local CGO_ENABLED=0 go vet ./...
GOTOOLCHAIN=local CGO_ENABLED=0 go test ./...
```

Add targeted tests for changed business rules. Startup compiles the binary and only replaces it after a successful build, then listens on APP_PORT (default 3000). Source changes require the platform restart command. Keep HTTP timeouts, graceful shutdown and database closure intact.
