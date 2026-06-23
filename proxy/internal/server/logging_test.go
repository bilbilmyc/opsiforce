package server

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"testing/iotest"

	"opsiforce/proxy/internal/backend"
	"opsiforce/proxy/internal/config"
)

func TestCapturingReaderPassesThroughAndTruncates(t *testing.T) {
	source := "hello world, this is the full streamed body"
	// OneByteReader forces many small reads, exercising the cross-read accumulation.
	cr := newCapturingReader(iotest.OneByteReader(strings.NewReader(source)), 5)

	out, err := io.ReadAll(cr)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if string(out) != source {
		t.Errorf("passthrough mismatch: got %q want %q", out, source)
	}
	if got := cr.captured(); got != "hello" {
		t.Errorf("captured prefix: got %q want %q", got, "hello")
	}
}

func TestCapturingReaderShorterThanLimit(t *testing.T) {
	source := "abc"
	cr := newCapturingReader(strings.NewReader(source), 1024)

	out, err := io.ReadAll(cr)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if string(out) != source {
		t.Errorf("passthrough mismatch: got %q want %q", out, source)
	}
	if got := cr.captured(); got != source {
		t.Errorf("captured: got %q want %q", got, source)
	}
}

func TestLogSettingsFallbackWhenNil(t *testing.T) {
	s := &Server{cfg: config.Config{RequestLogBodyLimit: 10240}}

	got := s.logSettings(nil)
	if got.mode != logModeFull {
		t.Errorf("mode: got %q want %q", got.mode, logModeFull)
	}
	if got.bodyLimit != 10240 {
		t.Errorf("bodyLimit: got %d want %d", got.bodyLimit, 10240)
	}
	if !got.captureBody() {
		t.Error("expected capture in default full mode")
	}
}

func TestLogSettingsFromBackend(t *testing.T) {
	s := &Server{cfg: config.Config{RequestLogBodyLimit: 10240}}

	got := s.logSettings(&backend.LoggingConfig{Mode: logModeMetadata, BodyLimit: 4096})
	if got.mode != logModeMetadata {
		t.Errorf("mode: got %q want %q", got.mode, logModeMetadata)
	}
	if got.bodyLimit != 4096 {
		t.Errorf("bodyLimit: got %d want %d", got.bodyLimit, 4096)
	}
	if got.captureBody() {
		t.Error("metadata mode must not capture bodies")
	}
}

func TestLogSettingsNegativeBodyLimitClamped(t *testing.T) {
	s := &Server{cfg: config.Config{RequestLogBodyLimit: 10240}}

	got := s.logSettings(&backend.LoggingConfig{Mode: logModeFull, BodyLimit: -5})
	if got.bodyLimit != 0 {
		t.Errorf("bodyLimit: got %d want 0", got.bodyLimit)
	}
	if got.captureBody() {
		t.Error("full mode with zero body limit must not capture")
	}
}

func TestCaptureBody(t *testing.T) {
	cases := []struct {
		mode  string
		limit int
		want  bool
	}{
		{logModeFull, 10, true},
		{logModeFull, 0, false},
		{logModeMetadata, 10, false},
		{logModeOff, 10, false},
	}

	for _, tc := range cases {
		got := logConfig{mode: tc.mode, bodyLimit: tc.limit}.captureBody()
		if got != tc.want {
			t.Errorf("captureBody(mode=%q limit=%d): got %v want %v", tc.mode, tc.limit, got, tc.want)
		}
	}
}

func TestJSONHeaderRedactsSensitive(t *testing.T) {
	h := http.Header{}
	h.Set("Authorization", "Bearer super-secret-token")
	h.Set("Cookie", "session=do-not-log")
	h.Set("X-Proxy-Control-Token", "control-plane-secret")
	h.Set("Content-Type", "application/json")

	out := jsonHeader(h)

	if strings.Contains(out, "super-secret-token") ||
		strings.Contains(out, "do-not-log") ||
		strings.Contains(out, "control-plane-secret") {
		t.Errorf("sensitive value leaked into log: %s", out)
	}
	if !strings.Contains(out, "[redacted]") {
		t.Errorf("expected redaction marker: %s", out)
	}
	if !strings.Contains(out, "application/json") {
		t.Errorf("non-sensitive header should be preserved: %s", out)
	}
}
