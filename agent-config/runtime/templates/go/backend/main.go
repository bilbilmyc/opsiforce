package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

type item struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Print("response write failed")
	}
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	config, err := loadConfig()
	if err != nil {
		return err
	}
	dbPath, err := databasePath()
	if err != nil {
		return errors.New("cannot create application data directory")
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return errors.New("cannot open application database")
	}
	defer db.Close()
	// One connection keeps SQLite writes serialized and connection PRAGMAs stable.
	db.SetMaxOpenConns(1)
	if _, err = db.Exec("PRAGMA busy_timeout=5000"); err != nil {
		return err
	}
	if _, err = db.Exec("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)"); err != nil {
		return err
	}
	mux := http.NewServeMux()
	greeting := envDefault("APP_GREETING", "Go backend is ready")
	if value, ok := config["APP_GREETING"]; ok {
		greeting = value
	}
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Vary", "Accept")
		if strings.Contains(r.Header.Get("Accept"), "text/html") {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = fmt.Fprintf(w, "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Go backend</title><style>body{font:16px system-ui;max-width:680px;margin:8vh auto;padding:24px;line-height:1.6}a{color:#09675b}</style><h1>Go backend</h1><p>%s</p><p><a href='/api/health' target='_blank' rel='noreferrer'>Health</a> · <a href='/api/items' target='_blank' rel='noreferrer'>Items API</a></p></html>", html.EscapeString(greeting))
			return
		}
		writeJSON(w, 200, map[string]string{"message": greeting, "health": "/api/health"})
	})
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			http.Error(w, "database unavailable", 503)
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/app-meta", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, appMetadata()) })
	mux.HandleFunc("GET /api/items", func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(r.Context(), "SELECT id, name FROM items ORDER BY id LIMIT 100")
		if err != nil {
			http.Error(w, "database unavailable", 503)
			return
		}
		defer rows.Close()
		items := []item{}
		for rows.Next() {
			var value item
			if err := rows.Scan(&value.ID, &value.Name); err != nil {
				http.Error(w, "database unavailable", 503)
				return
			}
			items = append(items, value)
		}
		if rows.Err() != nil {
			http.Error(w, "database unavailable", 503)
			return
		}
		writeJSON(w, 200, items)
	})
	mux.HandleFunc("POST /api/items", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Name string `json:"name"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF || strings.TrimSpace(input.Name) == "" || utf8.RuneCountInString(input.Name) > 200 {
			http.Error(w, "name must contain 1 to 200 characters", 422)
			return
		}
		input.Name = strings.TrimSpace(input.Name)
		result, err := db.ExecContext(r.Context(), "INSERT INTO items(name) VALUES (?)", input.Name)
		if err != nil {
			http.Error(w, "database unavailable", 503)
			return
		}
		id, err := result.LastInsertId()
		if err != nil {
			http.Error(w, "database unavailable", 503)
			return
		}
		writeJSON(w, 201, item{ID: id, Name: input.Name})
	})
	server := &http.Server{Addr: ":" + envDefault("APP_PORT", "3000"), Handler: mux,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan struct{})
	go func() {
		defer close(done)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	log.Print("Go backend listening on application port")
	err = server.ListenAndServe()
	stop()
	<-done // Complete graceful shutdown before closing the database.
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
