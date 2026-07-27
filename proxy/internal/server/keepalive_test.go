package server

import (
	"context"
	"sync"
	"testing"
	"time"

	"opsiforce/proxy/internal/backend"
)

type touchRecorder struct {
	mu      sync.Mutex
	touches map[string]int
}

func newTouchRecorder() *touchRecorder {
	return &touchRecorder{touches: map[string]int{}}
}

func (r *touchRecorder) touch(_ context.Context, environmentID string, surface backend.Surface) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.touches[environmentID+":"+string(surface)]++
	return nil
}

func (r *touchRecorder) count(environmentID string, surface backend.Surface) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.touches[environmentID+":"+string(surface)]
}

func waitFor(t *testing.T, timeout time.Duration, condition func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return true
		}
		time.Sleep(time.Millisecond)
	}
	return condition()
}

func TestUpgradeKeepAliveTouchesWhileHeld(t *testing.T) {
	recorder := newTouchRecorder()
	keepAlive := newUpgradeKeepAlive(recorder.touch, 5*time.Millisecond, time.Second)

	release := keepAlive.acquire("env-1", backend.SurfaceApp)
	if !waitFor(t, time.Second, func() bool { return recorder.count("env-1", backend.SurfaceApp) >= 2 }) {
		t.Fatalf("expected periodic touches while held, got %d", recorder.count("env-1", backend.SurfaceApp))
	}
	release()

	settled := recorder.count("env-1", backend.SurfaceApp)
	time.Sleep(25 * time.Millisecond)
	if recorder.count("env-1", backend.SurfaceApp) > settled+1 {
		t.Fatalf("touches continued after release: %d -> %d", settled, recorder.count("env-1", backend.SurfaceApp))
	}
}

func TestUpgradeKeepAliveStopsAfterLastRelease(t *testing.T) {
	recorder := newTouchRecorder()
	keepAlive := newUpgradeKeepAlive(recorder.touch, 5*time.Millisecond, time.Second)

	releaseFirst := keepAlive.acquire("env-1", backend.SurfaceApp)
	releaseSecond := keepAlive.acquire("env-1", backend.SurfaceApp)

	releaseFirst()
	if !waitFor(t, time.Second, func() bool { return recorder.count("env-1", backend.SurfaceApp) >= 1 }) {
		t.Fatal("expected touches while one connection is still held")
	}

	releaseSecond()
	settled := recorder.count("env-1", backend.SurfaceApp)
	time.Sleep(25 * time.Millisecond)
	if recorder.count("env-1", backend.SurfaceApp) > settled+1 {
		t.Fatalf("touches continued after last release: %d -> %d", settled, recorder.count("env-1", backend.SurfaceApp))
	}

	keepAlive.mu.Lock()
	defer keepAlive.mu.Unlock()
	if len(keepAlive.counts) != 0 || len(keepAlive.stops) != 0 {
		t.Fatalf("expected empty tracking maps, got counts=%v stops=%d", keepAlive.counts, len(keepAlive.stops))
	}
}

func TestUpgradeKeepAliveReleaseIsIdempotent(t *testing.T) {
	recorder := newTouchRecorder()
	keepAlive := newUpgradeKeepAlive(recorder.touch, time.Hour, time.Second)

	releaseFirst := keepAlive.acquire("env-1", backend.SurfaceApp)
	releaseSecond := keepAlive.acquire("env-1", backend.SurfaceApp)

	releaseFirst()
	releaseFirst()

	keepAlive.mu.Lock()
	remaining := keepAlive.counts[keepAliveKey{environmentID: "env-1", surface: backend.SurfaceApp}]
	keepAlive.mu.Unlock()
	if remaining != 1 {
		t.Fatalf("double release changed the count: got %d, want 1", remaining)
	}

	releaseSecond()
}

func TestUpgradeKeepAliveTracksEnvironmentsIndependently(t *testing.T) {
	recorder := newTouchRecorder()
	keepAlive := newUpgradeKeepAlive(recorder.touch, 5*time.Millisecond, time.Second)

	releaseOne := keepAlive.acquire("env-1", backend.SurfaceApp)
	releaseTwo := keepAlive.acquire("env-2", backend.SurfaceApp)
	releaseTwo()

	if !waitFor(t, time.Second, func() bool { return recorder.count("env-1", backend.SurfaceApp) >= 2 }) {
		t.Fatal("expected env-1 to keep touching after env-2 released")
	}
	releaseOne()
}

func TestUpgradeKeepAliveTouchesEachSurfaceSeparately(t *testing.T) {
	recorder := newTouchRecorder()
	keepAlive := newUpgradeKeepAlive(recorder.touch, 5*time.Millisecond, time.Second)

	releaseApp := keepAlive.acquire("env-1", backend.SurfaceApp)
	releaseVSCode := keepAlive.acquire("env-1", backend.SurfaceVSCode)

	appTouched := waitFor(t, time.Second, func() bool { return recorder.count("env-1", backend.SurfaceApp) >= 1 })
	vscodeTouched := waitFor(t, time.Second, func() bool { return recorder.count("env-1", backend.SurfaceVSCode) >= 1 })
	if !appTouched || !vscodeTouched {
		t.Fatalf(
			"expected both surfaces touched, got app=%d vscode=%d",
			recorder.count("env-1", backend.SurfaceApp),
			recorder.count("env-1", backend.SurfaceVSCode),
		)
	}

	releaseApp()
	appSettled := recorder.count("env-1", backend.SurfaceApp)
	vscodeSettled := recorder.count("env-1", backend.SurfaceVSCode)
	if !waitFor(t, time.Second, func() bool { return recorder.count("env-1", backend.SurfaceVSCode) > vscodeSettled }) {
		t.Fatal("expected vscode surface to keep touching after the app surface released")
	}
	if recorder.count("env-1", backend.SurfaceApp) > appSettled+1 {
		t.Fatalf("app surface kept touching after release: %d -> %d", appSettled, recorder.count("env-1", backend.SurfaceApp))
	}
	releaseVSCode()
}
