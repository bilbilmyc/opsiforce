package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"opsiforce/proxy/internal/backend"
	"opsiforce/proxy/internal/config"
)

func TestPrivateToolPathProxy(t *testing.T) {
	const env = "cd9161a8-7784-4e73-8bd5-44345396129c"
	for _, tc := range []struct {
		mode           config.Mode
		prefix, target string
	}{
		{config.ModeVSCode, "/api/code/" + env, "/asset.js"},
		{config.ModeDB, "/api/db/" + env, "/asset.js"},
	} {
		t.Run(string(tc.mode), func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != tc.target {
					t.Errorf("upstream path: %s", r.URL.Path)
				}
				if r.URL.RawQuery != "v=1" {
					t.Errorf("lost query: %s", r.URL.RawQuery)
				}
				if r.Host != "platform:30080" {
					t.Errorf("lost public host: %s", r.Host)
				}
				if r.Header.Get("x-forwarded-user") != "" {
					t.Error("identity leaked to tool")
				}
				w.WriteHeader(200)
			}))
			defer upstream.Close()
			control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("x-forwarded-user") != "alice" {
					w.WriteHeader(403)
					return
				}
				_ = json.NewEncoder(w).Encode(backend.EnsureResponse{State: "ready", Upstream: upstream.URL})
			}))
			defer control.Close()
			s := New(config.Config{Mode: tc.mode, ReadyCacheTTL: time.Minute}, backend.New(control.URL, "fixture", time.Second), nil)
			defer s.Close(t.Context())
			for _, user := range []string{"alice", "bob"} {
				r := httptest.NewRequest("GET", "http://platform:30080"+tc.prefix+"/asset.js?v=1", nil)
				r.Header.Set("x-forwarded-user", user)
				r.Header.Set("x-forwarded-groups", "same-group")
				w := httptest.NewRecorder()
				s.ServeHTTP(w, r)
				want := 200
				if user == "bob" {
					want = 403
				}
				if w.Code != want {
					t.Fatalf("%s: got %d, want %d: %s", user, w.Code, want, w.Body.String())
				}
			}
		})
	}
}
