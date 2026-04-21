package proxycache

import (
	"context"
	"sync"
	"time"

	"github.com/simadevelopment/sima/packages/opsiforce/proxy/internal/backend"
)

type Cache struct {
	mu       sync.Mutex
	entries  map[string]entry
	inflight map[string]*call
}

type entry struct {
	projectID string
	value     backend.EnsureResponse
	expiresAt time.Time
}

type call struct {
	done  chan struct{}
	value backend.EnsureResponse
	err   error
}

func New() *Cache {
	return &Cache{
		entries:  make(map[string]entry),
		inflight: make(map[string]*call),
	}
}

func (c *Cache) GetOrLoad(
	ctx context.Context,
	key string,
	projectID string,
	ttl func(backend.EnsureResponse) time.Duration,
	load func(context.Context) (backend.EnsureResponse, error),
) (backend.EnsureResponse, error) {
	c.mu.Lock()
	if cached, ok := c.entries[key]; ok && time.Now().Before(cached.expiresAt) {
		c.mu.Unlock()
		return cached.value, nil
	}

	if pending, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		select {
		case <-ctx.Done():
			return backend.EnsureResponse{}, ctx.Err()
		case <-pending.done:
			return pending.value, pending.err
		}
	}

	pending := &call{done: make(chan struct{})}
	c.inflight[key] = pending
	c.mu.Unlock()

	value, err := load(ctx)

	c.mu.Lock()
	if err == nil {
		c.entries[key] = entry{
			projectID: projectID,
			value:     value,
			expiresAt: time.Now().Add(ttl(value)),
		}
	}
	delete(c.inflight, key)
	pending.value = value
	pending.err = err
	close(pending.done)
	c.mu.Unlock()

	return value, err
}

func (c *Cache) InvalidateProject(projectID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	for key, cached := range c.entries {
		if cached.projectID == projectID {
			delete(c.entries, key)
		}
	}
}
