package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

func envDefault(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func loadConfig() (map[string]string, error) {
	data, err := os.ReadFile(envDefault("APP_CONFIG_PATH", "../opsiforce.env.json"))
	if errors.Is(err, os.ErrNotExist) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, errors.New("cannot read application configuration file")
	}
	var raw map[string]*string
	if json.Unmarshal(data, &raw) != nil || raw == nil {
		return nil, errors.New("invalid application configuration file")
	}
	values := make(map[string]string, len(raw))
	for key, value := range raw {
		if value == nil {
			return nil, errors.New("invalid application configuration file")
		}
		values[key] = *value
	}
	return values, nil
}

func appMetadata() map[string]any {
	data, err := os.ReadFile(envDefault("APP_META_PATH", "../app.meta.json"))
	var meta struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err != nil || json.Unmarshal(data, &meta) != nil || strings.TrimSpace(meta.Name) == "" {
		return map[string]any{"exists": false}
	}
	return map[string]any{"exists": true, "name": meta.Name, "description": meta.Description}
}

func databasePath() (string, error) {
	directory := envDefault("APP_DATA_DIR", "../data")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(directory, "app.db"), nil
}
