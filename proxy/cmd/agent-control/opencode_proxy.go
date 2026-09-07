package main

import (
	"encoding/base64"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
)

func runOpencodeAuthProxy() {
	listenPort := os.Getenv("OPENCODE_PORT")
	if listenPort == "" {
		listenPort = "4096"
	}
	internalPort := os.Getenv("OPENCODE_INTERNAL_PORT")
	if internalPort == "" {
		internalPort = "4106"
	}
	password := os.Getenv("OPENCODE_PASSWORD")
	if password == "" {
		log.Println("opencode-proxy: OPENCODE_PASSWORD not set; auth proxy disabled")
		return
	}

	upstream := &url.URL{Scheme: "http", Host: "127.0.0.1:" + internalPort}
	credential := "Basic " + base64.StdEncoding.EncodeToString([]byte("opencode:"+password))

	proxy := httputil.NewSingleHostReverseProxy(upstream)
	baseDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		baseDirector(req)
		req.Header.Set("Authorization", credential)
	}
	proxy.FlushInterval = -1

	log.Printf("opencode-proxy: listening on :%s -> 127.0.0.1:%s", listenPort, internalPort)
	if err := http.ListenAndServe(":"+listenPort, proxy); err != nil {
		log.Fatalf("opencode-proxy: server failed: %v", err)
	}
}
