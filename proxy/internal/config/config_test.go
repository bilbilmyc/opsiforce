package config

import (
	"testing"
	"time"
)

func TestPositiveDurationEnvRejectsNonPositive(t *testing.T) {
	const name = "OPSIFORCE_PROXY_TEST_INTERVAL"
	fallback := time.Minute

	for _, raw := range []string{"0s", "0", "-1s", "-5m", "not-a-duration"} {
		t.Setenv(name, raw)
		if got := positiveDurationEnv(name, fallback); got != fallback {
			t.Errorf("positiveDurationEnv(%q) = %v, want fallback %v", raw, got, fallback)
		}
	}
}

func TestPositiveDurationEnvKeepsPositive(t *testing.T) {
	const name = "OPSIFORCE_PROXY_TEST_INTERVAL"

	t.Setenv(name, "30s")
	if got := positiveDurationEnv(name, time.Minute); got != 30*time.Second {
		t.Errorf("positiveDurationEnv = %v, want 30s", got)
	}
}

// The keep-alive interval drives a time.Ticker, which panics on a non-positive
// period — so a hostile env value must never survive Load.
func TestLoadKeepsWebsocketKeepAliveIntervalPositive(t *testing.T) {
	for _, raw := range []string{"0s", "-1s"} {
		t.Setenv("OPSIFORCE_PROXY_WS_KEEPALIVE_INTERVAL", raw)

		cfg, err := Load(string(ModeApp), 0)
		if err != nil {
			t.Fatalf("Load with interval %q: %v", raw, err)
		}
		if cfg.WebsocketKeepAliveInterval <= 0 {
			t.Fatalf("interval %q survived Load as %v", raw, cfg.WebsocketKeepAliveInterval)
		}
	}
}
