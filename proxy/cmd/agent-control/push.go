package main

import (
	"bytes"
	"log"
	"net/http"
	"time"
)

func pushJSON(client *http.Client, url, key, name string, payload []byte) bool {
	for attempt := 1; attempt <= pushAttempts; attempt++ {
		if attempt > 1 {
			time.Sleep(pushBackoff * time.Duration(attempt-1))
		}

		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
		if err != nil {
			log.Printf("%s: build request failed: %v", name, err)
			return false
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+key)

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("%s: push attempt %d failed: %v", name, attempt, err)
			continue
		}
		ok := resp.StatusCode >= 200 && resp.StatusCode < 300
		resp.Body.Close()
		if ok {
			return true
		}
		log.Printf("%s: push attempt %d returned status %d", name, attempt, resp.StatusCode)
	}
	return false
}
