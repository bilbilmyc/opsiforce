package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const (
	defaultDBPath = "/workspace/data/database.db"
	batchSize     = 100
	flushInterval = 500 * time.Millisecond
	maxLineLength = 10 * 1024
	busyTimeoutMs = 1000
)

type stringFlag struct {
	value string
	set   bool
}

func (f *stringFlag) Set(value string) error {
	f.value = value
	f.set = true
	return nil
}

func (f *stringFlag) String() string {
	return f.value
}

type logWriter struct {
	db    *sql.DB
	name  string
	batch []string
}

type streamEvent struct {
	output  string
	line    string
	hasLine bool
}

func main() {
	var nameFlag stringFlag
	var lineFlag stringFlag
	var eventFlag stringFlag
	var exitCodeFlag stringFlag
	var uptimeFlag stringFlag
	var restartFlag stringFlag

	flag.Var(&nameFlag, "name", "")
	flag.Var(&lineFlag, "line", "")
	flag.Var(&eventFlag, "event", "")
	flag.Var(&exitCodeFlag, "exit-code", "")
	flag.Var(&uptimeFlag, "uptime", "")
	flag.Var(&restartFlag, "restart", "")
	flag.Parse()

	name := nameFlag.value
	if name == "" {
		name = "unknown"
	}

	writer, err := newLogWriter(name)
	if eventFlag.set {
		if err == nil {
			writer.insertEvent(eventFlag.value, parseOptionalInt(exitCodeFlag), parseOptionalInt(uptimeFlag), parseOptionalInt(restartFlag))
			writer.close()
		}
		return
	}

	if lineFlag.set {
		if err == nil {
			writer.addLine(lineFlag.value)
			writer.flush()
			writer.close()
		}
		return
	}

	if err != nil {
		passthrough()
		return
	}

	defer writer.close()
	stream(writer)
}

func newLogWriter(name string) (*logWriter, error) {
	dbPath := os.Getenv("PROCESS_LOG_DB_PATH")
	if dbPath == "" {
		dbPath = defaultDBPath
	}

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	for _, statement := range []string{
		fmt.Sprintf("PRAGMA busy_timeout = %d", busyTimeoutMs),
		"PRAGMA journal_mode = TRUNCATE",
		"PRAGMA synchronous = NORMAL",
		`CREATE TABLE IF NOT EXISTS process_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			process_name TEXT NOT NULL,
			line TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		`CREATE TABLE IF NOT EXISTS process_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			process_name TEXT NOT NULL,
			event TEXT NOT NULL,
			exit_code INTEGER,
			uptime_seconds INTEGER,
			restart_count INTEGER,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
		"CREATE INDEX IF NOT EXISTS idx_process_logs_process_name ON process_logs(process_name)",
		"CREATE INDEX IF NOT EXISTS idx_process_logs_created_at ON process_logs(created_at)",
		"CREATE INDEX IF NOT EXISTS idx_process_events_process_name ON process_events(process_name)",
	} {
		if _, err := db.Exec(statement); err != nil {
			_ = db.Close()
			return nil, err
		}
	}

	return &logWriter{
		db:    db,
		name:  name,
		batch: make([]string, 0, batchSize),
	}, nil
}

func (w *logWriter) close() {
	if w.db != nil {
		_ = w.db.Close()
	}
}

func (w *logWriter) addLine(line string) {
	w.batch = append(w.batch, line)
	if len(w.batch) >= batchSize {
		w.flush()
	}
}

func (w *logWriter) flush() {
	if len(w.batch) == 0 || w.db == nil {
		return
	}

	lines := w.batch
	ok := w.writeTransaction(func(ctx context.Context, conn *sql.Conn) error {
		stmt, err := conn.PrepareContext(ctx, "INSERT INTO process_logs (process_name, line) VALUES (?, ?)")
		if err != nil {
			return err
		}

		for _, line := range lines {
			if _, err := stmt.ExecContext(ctx, w.name, truncateLine(line)); err != nil {
				_ = stmt.Close()
				return err
			}
		}

		return stmt.Close()
	})
	if !ok {
		w.batch = w.batch[:0]
		return
	}

	w.batch = w.batch[:0]
}

func (w *logWriter) insertEvent(event string, exitCode any, uptime any, restart any) {
	if w.db == nil {
		return
	}
	w.writeTransaction(func(ctx context.Context, conn *sql.Conn) error {
		_, err := conn.ExecContext(
			ctx,
			"INSERT INTO process_events (process_name, event, exit_code, uptime_seconds, restart_count) VALUES (?, ?, ?, ?, ?)",
			w.name,
			event,
			exitCode,
			uptime,
			restart,
		)
		return err
	})
}

func (w *logWriter) writeTransaction(fn func(context.Context, *sql.Conn) error) bool {
	if w.db == nil {
		return false
	}

	ctx := context.Background()
	conn, err := w.db.Conn(ctx)
	if err != nil {
		return false
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return false
	}

	committed := false
	defer func() {
		if !committed {
			_, _ = conn.ExecContext(ctx, "ROLLBACK")
		}
	}()

	if err := fn(ctx, conn); err != nil {
		return false
	}

	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return false
	}
	committed = true

	return true
}

func stream(writer *logWriter) {
	events := make(chan streamEvent)
	go readStream(os.Stdin, events)

	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	for {
		select {
		case event, ok := <-events:
			if !ok {
				writer.flush()
				return
			}
			if event.output != "" {
				_, _ = io.WriteString(os.Stdout, event.output)
			}
			if event.hasLine {
				writer.addLine(event.line)
			}
		case <-ticker.C:
			writer.flush()
		}
	}
}

func passthrough() {
	_, _ = io.Copy(os.Stdout, os.Stdin)
}

func readStream(input io.Reader, events chan<- streamEvent) {
	defer close(events)
	buffer := make([]byte, 32*1024)
	var line strings.Builder
	truncated := false

	for {
		read, err := input.Read(buffer)
		if read > 0 {
			text := string(buffer[:read])
			events <- streamEvent{output: text}
			start := 0
			for index := strings.IndexByte(text[start:], '\n'); index >= 0; index = strings.IndexByte(text[start:], '\n') {
				end := start + index
				truncated = appendLineSegment(&line, truncated, text[start:end])
				events <- streamEvent{line: line.String(), hasLine: true}
				line.Reset()
				truncated = false
				start = end + 1
			}
			if start < len(text) {
				truncated = appendLineSegment(&line, truncated, text[start:])
			}
		}
		if err == io.EOF {
			if line.Len() > 0 || truncated {
				events <- streamEvent{line: line.String(), hasLine: true}
			}
			return
		}
		if err != nil {
			return
		}
	}
}

func appendLineSegment(line *strings.Builder, truncated bool, segment string) bool {
	if truncated {
		return true
	}

	remaining := maxLineLength - line.Len()
	if remaining <= 0 {
		return true
	}
	if len(segment) <= remaining {
		line.WriteString(segment)
		return false
	}

	line.WriteString(segment[:remaining])
	return true
}

func parseOptionalInt(value stringFlag) any {
	if !value.set || value.value == "" {
		return nil
	}
	parsed, err := strconv.Atoi(value.value)
	if err != nil {
		return nil
	}
	return parsed
}

func truncateLine(line string) string {
	if len(line) <= maxLineLength {
		return line
	}
	return line[:maxLineLength]
}
