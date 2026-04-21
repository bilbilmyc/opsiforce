package portforward

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os/exec"
	"sync"
	"time"
)

type Manager struct {
	rootCtx      context.Context
	namespace    string
	targetPort   int
	readyTimeout time.Duration
	mu           sync.Mutex
	portForwards map[string]*portForward
}

type portForward struct {
	projectID string
	podName   string
	localPort int
	cancel    context.CancelFunc
	done      chan struct{}
}

func New(rootCtx context.Context, namespace string, targetPort int, readyTimeout time.Duration) *Manager {
	return &Manager{
		rootCtx:      rootCtx,
		namespace:    namespace,
		targetPort:   targetPort,
		readyTimeout: readyTimeout,
		portForwards: make(map[string]*portForward),
	}
}

func (m *Manager) URL(ctx context.Context, projectID string, podName string) (string, error) {
	if m.namespace == "" {
		return "", errors.New("k8s namespace is required for local port-forwarding")
	}

	m.mu.Lock()
	if existing, ok := m.portForwards[projectID]; ok {
		if existing.podName == podName && isAlive(existing.done) {
			port := existing.localPort
			m.mu.Unlock()
			return fmt.Sprintf("http://127.0.0.1:%d", port), nil
		}

		existing.cancel()
		delete(m.portForwards, projectID)
	}

	localPort, err := freePort()
	if err != nil {
		m.mu.Unlock()
		return "", err
	}

	procCtx, cancel := context.WithCancel(m.rootCtx)
	cmd := exec.CommandContext(
		procCtx,
		"kubectl",
		"port-forward",
		"-n",
		m.namespace,
		podName,
		fmt.Sprintf("%d:%d", localPort, m.targetPort),
	)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard

	done := make(chan struct{})
	if err := cmd.Start(); err != nil {
		cancel()
		m.mu.Unlock()
		return "", err
	}

	go func() {
		_ = cmd.Wait()
		close(done)
	}()

	m.portForwards[projectID] = &portForward{
		projectID: projectID,
		podName:   podName,
		localPort: localPort,
		cancel:    cancel,
		done:      done,
	}
	m.mu.Unlock()

	if err := waitForPort(ctx, localPort, m.readyTimeout); err != nil {
		cancel()
		return "", err
	}

	return (&url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("127.0.0.1:%d", localPort),
	}).String(), nil
}

func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, portForward := range m.portForwards {
		portForward.cancel()
	}
}

func isAlive(done <-chan struct{}) bool {
	select {
	case <-done:
		return false
	default:
		return true
	}
}

func freePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()

	return listener.Addr().(*net.TCPAddr).Port, nil
}

func waitForPort(ctx context.Context, port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	address := fmt.Sprintf("127.0.0.1:%d", port)

	for time.Now().Before(deadline) {
		conn, err := (&net.Dialer{Timeout: 500 * time.Millisecond}).DialContext(ctx, "tcp", address)
		if err == nil {
			_ = conn.Close()
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}

	return fmt.Errorf("timed out waiting for local port-forward on %s", address)
}
