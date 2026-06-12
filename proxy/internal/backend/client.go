package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Surface string

const (
	SurfaceAgent  Surface = "agent"
	SurfaceApp    Surface = "app"
	SurfaceVSCode Surface = "vscode"
	SurfaceDB     Surface = "db"
)

type EnsureResponse struct {
	State         string         `json:"state"`
	CanonicalHost string         `json:"canonicalHost"`
	Upstream      string         `json:"upstream"`
	PodName       string         `json:"podName"`
	Directory     string         `json:"directory"`
	Logging       *LoggingConfig `json:"logging"`
}

// LoggingConfig is the per-project request-logging policy resolved by the
// control plane. It is nil when the backend does not supply one (older
// backends or non-app surfaces), in which case the proxy falls back to its
// own defaults.
type LoggingConfig struct {
	Mode      string `json:"mode"`
	BodyLimit int    `json:"bodyLimit"`
}

type StatusError struct {
	StatusCode int
	Body       []byte
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("backend control plane returned status %d", e.StatusCode)
}

type Client struct {
	baseURL string
	token   string
	client  *http.Client
}

func New(baseURL string, token string, timeout time.Duration) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) Ensure(ctx context.Context, projectID string, surface Surface, headers http.Header) (EnsureResponse, error) {
	payload, err := json.Marshal(map[string]string{
		"surface": string(surface),
	})
	if err != nil {
		return EnsureResponse{}, err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf("%s/api/internal/proxy/projects/%s/ensure", c.baseURL, projectID),
		bytes.NewReader(payload),
	)
	if err != nil {
		return EnsureResponse{}, err
	}

	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-proxy-control-token", c.token)

	if groups := headers.Get("x-forwarded-groups"); groups != "" {
		req.Header.Set("x-forwarded-groups", groups)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return EnsureResponse{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return EnsureResponse{}, err
	}

	if resp.StatusCode >= 400 {
		return EnsureResponse{}, &StatusError{StatusCode: resp.StatusCode, Body: body}
	}

	var decoded EnsureResponse
	if err := json.Unmarshal(body, &decoded); err != nil {
		return EnsureResponse{}, err
	}

	return decoded, nil
}

func (c *Client) ReportFailure(ctx context.Context, projectID string) (bool, error) {
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf("%s/api/internal/proxy/projects/%s/failure", c.baseURL, projectID),
		http.NoBody,
	)
	if err != nil {
		return false, err
	}

	req.Header.Set("x-proxy-control-token", c.token)

	resp, err := c.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, err
	}

	if resp.StatusCode >= 400 {
		return false, &StatusError{StatusCode: resp.StatusCode, Body: body}
	}

	var decoded struct {
		Restart bool `json:"restart"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return false, err
	}

	return decoded.Restart, nil
}
