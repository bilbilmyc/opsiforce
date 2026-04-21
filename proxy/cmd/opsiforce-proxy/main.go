package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/simadevelopment/sima/packages/opsiforce/proxy/internal/backend"
	"github.com/simadevelopment/sima/packages/opsiforce/proxy/internal/config"
	"github.com/simadevelopment/sima/packages/opsiforce/proxy/internal/portforward"
	"github.com/simadevelopment/sima/packages/opsiforce/proxy/internal/requestlog"
	"github.com/simadevelopment/sima/packages/opsiforce/proxy/internal/server"
)

func main() {
	modeFlag := flag.String("mode", "", "proxy mode: agent|app|vscode|db")
	portFlag := flag.Int("port", 0, "listen port")
	flag.Parse()

	cfg, err := config.Load(*modeFlag, *portFlag)
	if err != nil {
		slog.Error("failed to load config", "error", err.Error())
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	controlClient := backend.New(cfg.BackendURL, cfg.ProxyControlToken, cfg.ControlPlaneTimeout)

	var requestLogger *requestlog.Logger
	if cfg.Mode == config.ModeApp {
		requestLogger = requestlog.New(cfg.StorageMountPath, cfg.RequestLogQueueDepth)
	}

	var portForwardManager *portforward.Manager
	if cfg.Mode == config.ModeVSCode {
		portForwardManager = portforward.New(ctx, cfg.K8sNamespace, cfg.VSCodePort, cfg.PortForwardTimeout)
	}
	if cfg.Mode == config.ModeDB {
		portForwardManager = portforward.New(ctx, cfg.K8sNamespace, cfg.DBViewerPort, cfg.PortForwardTimeout)
	}

	handler := server.New(cfg, controlClient, requestLogger, portForwardManager)

	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           server.WrapCompressed(handler, server.CompressionOptions{MinSize: cfg.CompressionMinBytes}),
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	go func() {
		<-ctx.Done()

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			slog.Error("graceful shutdown failed", "error", err.Error())
		}

		if err := handler.Close(shutdownCtx); err != nil {
			slog.Error("proxy cleanup failed", "error", err.Error())
		}
	}()

	slog.Info("starting proxy", "mode", cfg.Mode, "port", cfg.Port)

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("proxy stopped with error", "error", err.Error())
		os.Exit(1)
	}
}
