package main

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func TestFlushRollsBackAfterBusyCommit(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "database.db")
	t.Setenv("PROCESS_LOG_DB_PATH", dbPath)

	writer, err := newLogWriter("test")
	if err != nil {
		t.Fatal(err)
	}
	defer writer.close()

	writer.addLine("initial")
	writer.flush()

	reader, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()

	readTx, err := reader.Begin()
	if err != nil {
		t.Fatal(err)
	}

	rows, err := readTx.Query("SELECT id FROM process_logs")
	if err != nil {
		t.Fatal(err)
	}

	writer.addLine("blocked")
	writer.flush()

	if err := rows.Close(); err != nil {
		t.Fatal(err)
	}
	if err := readTx.Rollback(); err != nil {
		t.Fatal(err)
	}

	probe, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer probe.Close()

	if _, err := probe.Exec("PRAGMA busy_timeout = 0"); err != nil {
		t.Fatal(err)
	}

	probeTx, err := probe.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer probeTx.Rollback()

	if _, err := probeTx.Exec("INSERT INTO process_logs (process_name, line) VALUES (?, ?)", "probe", "ok"); err != nil {
		t.Fatal(err)
	}
}

func TestReadStreamPreservesOutputAndLines(t *testing.T) {
	output, lines := collectStream("alpha\nbeta\nfinal")
	if output != "alpha\nbeta\nfinal" {
		t.Fatalf("unexpected output: %q", output)
	}
	if strings.Join(lines, "|") != "alpha|beta|final" {
		t.Fatalf("unexpected lines: %#v", lines)
	}
}

func TestReadStreamTruncatesStoredLine(t *testing.T) {
	input := strings.Repeat("x", maxLineLength+100) + "\n"
	output, lines := collectStream(input)
	if output != input {
		t.Fatal("output was not preserved")
	}
	if len(lines) != 1 {
		t.Fatalf("expected 1 line, got %d", len(lines))
	}
	if len(lines[0]) != maxLineLength {
		t.Fatalf("expected truncated line length %d, got %d", maxLineLength, len(lines[0]))
	}
}

func collectStream(input string) (string, []string) {
	events := make(chan streamEvent)
	go readStream(strings.NewReader(input), events)

	var output strings.Builder
	var lines []string
	for event := range events {
		output.WriteString(event.output)
		if event.hasLine {
			lines = append(lines, event.line)
		}
	}
	return output.String(), lines
}
