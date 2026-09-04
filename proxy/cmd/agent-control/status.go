package main

import (
	"bufio"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultOpencodeURL   = "http://127.0.0.1:4096"
	statusSnapshotPath   = "/api/session/active"
	statusEventPath      = "/api/event"
	statusEventType      = "session.status"
	streamReconnectDelay = 2 * time.Second
)

type agentStatus struct {
	Working bool `json:"working"`
}

type statusWatcher struct {
	key          string
	pushURL      string
	statusURL    string
	eventURL     string
	pushClient   *http.Client
	snapClient   *http.Client
	streamClient *http.Client

	sessions  map[string]struct{}
	last      bool
	hasPushed bool
}

func runStatusWatcher() {
	key := os.Getenv("SERVICE_GATEWAY_API_KEY")
	base := os.Getenv("SERVICE_GATEWAY_URL")
	if key == "" || base == "" {
		log.Println("agent-status: SERVICE_GATEWAY_API_KEY/URL not set; agent status reporting disabled")
		return
	}

	opencodeURL := os.Getenv("OPENCODE_URL")
	if opencodeURL == "" {
		opencodeURL = defaultOpencodeURL
	}
	opencodeURL = strings.TrimRight(opencodeURL, "/")

	w := &statusWatcher{
		key:          key,
		pushURL:      strings.TrimRight(base, "/") + "/agent/status",
		statusURL:    opencodeURL + statusSnapshotPath,
		eventURL:     opencodeURL + statusEventPath,
		pushClient:   &http.Client{Timeout: pushTimeout},
		snapClient:   &http.Client{Timeout: probeTimeout},
		streamClient: &http.Client{},
		sessions:     map[string]struct{}{},
	}
	w.run()
}

func (w *statusWatcher) run() {
	for {
		w.stream()
		time.Sleep(streamReconnectDelay)
	}
}

func (w *statusWatcher) snapshot() bool {
	resp, err := w.snapClient.Get(w.statusURL)
	if err != nil {
		log.Printf("agent-status: status snapshot failed: %v", err)
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("agent-status: status snapshot returned status %d", resp.StatusCode)
		return false
	}

	var snapshot struct {
		Data map[string]struct {
			Type string `json:"type"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&snapshot); err != nil {
		log.Printf("agent-status: decode status snapshot failed: %v", err)
		return false
	}

	clear(w.sessions)
	for id := range snapshot.Data {
		w.sessions[id] = struct{}{}
	}
	return true
}

func (w *statusWatcher) stream() {
	req, err := http.NewRequest(http.MethodGet, w.eventURL, nil)
	if err != nil {
		log.Printf("agent-status: build event request failed: %v", err)
		return
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := w.streamClient.Do(req)
	if err != nil {
		log.Printf("agent-status: event stream connect failed: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("agent-status: event stream returned status %d", resp.StatusCode)
		return
	}

	if !w.snapshot() {
		return
	}
	if !w.sync(true) {
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		data, ok := strings.CutPrefix(scanner.Text(), "data:")
		if !ok {
			continue
		}
		data = strings.TrimSpace(data)
		if data == "" {
			continue
		}
		if w.applyEvent(data) {
			if !w.sync(false) {
				return
			}
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("agent-status: event stream read error: %v", err)
	}
}

func (w *statusWatcher) applyEvent(data string) bool {
	var ev struct {
		Type string `json:"type"`
		Data struct {
			SessionID string `json:"sessionID"`
			Status    struct {
				Type string `json:"type"`
			} `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(data), &ev); err != nil {
		return false
	}
	if ev.Type != statusEventType {
		return false
	}

	if isWorkingStatus(ev.Data.Status.Type) {
		w.sessions[ev.Data.SessionID] = struct{}{}
	} else {
		delete(w.sessions, ev.Data.SessionID)
	}
	return true
}

func (w *statusWatcher) sync(boundary bool) bool {
	working := len(w.sessions) > 0
	if !boundary {
		if w.hasPushed && working == w.last {
			return true
		}
		if !w.hasPushed && !working {
			return true
		}
	}
	if !w.pushStatus(working) {
		w.hasPushed = false
		return false
	}
	w.hasPushed = true
	w.last = working
	return true
}

func (w *statusWatcher) pushStatus(working bool) bool {
	payload, err := json.Marshal(agentStatus{Working: working})
	if err != nil {
		log.Printf("agent-status: marshal status failed: %v", err)
		return false
	}
	return pushJSON(w.pushClient, w.pushURL, w.key, "agent-status", payload)
}

func isWorkingStatus(statusType string) bool {
	return statusType == "busy" || statusType == "retry"
}
