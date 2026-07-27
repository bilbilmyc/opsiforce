package server

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"opsiforce/proxy/internal/backend"
)

// upgradeKeepAlive re-touches a surface's activity while it has live upgraded
// (websocket) connections. See docs/runtime/request-flows.md § ensure gate.
type upgradeKeepAlive struct {
	touch    func(ctx context.Context, environmentID string, surface backend.Surface) error
	interval time.Duration
	timeout  time.Duration

	mu     sync.Mutex
	counts map[keepAliveKey]int
	stops  map[keepAliveKey]chan struct{}
}

type keepAliveKey struct {
	environmentID string
	surface       backend.Surface
}

func newUpgradeKeepAlive(
	touch func(ctx context.Context, environmentID string, surface backend.Surface) error,
	interval time.Duration,
	timeout time.Duration,
) *upgradeKeepAlive {
	return &upgradeKeepAlive{
		touch:    touch,
		interval: interval,
		timeout:  timeout,
		counts:   map[keepAliveKey]int{},
		stops:    map[keepAliveKey]chan struct{}{},
	}
}

// acquire registers a live upgraded connection and returns the release the
// caller must invoke once the connection ends.
func (k *upgradeKeepAlive) acquire(environmentID string, surface backend.Surface) func() {
	key := keepAliveKey{environmentID: environmentID, surface: surface}

	k.mu.Lock()
	k.counts[key]++
	if k.counts[key] == 1 {
		stop := make(chan struct{})
		k.stops[key] = stop
		go k.run(key, stop)
	}
	k.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() { k.release(key) })
	}
}

func (k *upgradeKeepAlive) release(key keepAliveKey) {
	k.mu.Lock()
	defer k.mu.Unlock()

	k.counts[key]--
	if k.counts[key] > 0 {
		return
	}

	delete(k.counts, key)
	if stop, ok := k.stops[key]; ok {
		close(stop)
		delete(k.stops, key)
	}
}

func (k *upgradeKeepAlive) run(key keepAliveKey, stop <-chan struct{}) {
	ticker := time.NewTicker(k.interval)
	defer ticker.Stop()

	// Touch up front rather than only on the first tick: the TTL in flight may
	// have less than one interval left when the connection arrives.
	k.touchOnce(key)

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			k.touchOnce(key)
		}
	}
}

func (k *upgradeKeepAlive) touchOnce(key keepAliveKey) {
	ctx, cancel := context.WithTimeout(context.Background(), k.timeout)
	defer cancel()

	if err := k.touch(ctx, key.environmentID, key.surface); err != nil {
		slog.Warn(
			"websocket keep-alive touch failed",
			"environmentId", key.environmentID,
			"surface", string(key.surface),
			"error", err.Error(),
		)
	}
}
