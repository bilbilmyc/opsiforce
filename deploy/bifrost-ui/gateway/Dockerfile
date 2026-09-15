FROM sealos.hub:5000/opsiforce/bifrost-console:channel-onboarding-20260915-3 AS console
FROM golang:1.26-bookworm AS builder
ENV GOTOOLCHAIN=auto CGO_ENABLED=1 GOWORK=off GOPROXY=https://goproxy.cn,direct
WORKDIR /src/transports
COPY transports/go.mod transports/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY transports/ ./
COPY --from=console /usr/share/nginx/html/ ./bifrost-http/ui/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -ldflags="-s -w -X main.Version=v2.0.0-opsiforce-catalog-3 -extldflags '-static'" -tags sqlite_static -o /out/bifrost ./bifrost-http
FROM sealos.hub:5000/opsiforce/bifrost:v2.0.0
COPY --from=builder /out/bifrost /app/main
