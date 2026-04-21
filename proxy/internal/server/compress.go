package server

import (
	"bufio"
	"compress/gzip"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

type CompressionOptions struct {
	MinSize int
}

var gzipWriterPool = sync.Pool{
	New: func() any {
		return gzip.NewWriter(io.Discard)
	},
}

func WrapCompressed(next http.Handler, options CompressionOptions) http.Handler {
	if options.MinSize <= 0 {
		options.MinSize = 1024
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !requestSupportsGzip(r) || isUpgradeRequest(r) {
			next.ServeHTTP(w, r)
			return
		}

		writer := &compressedResponseWriter{
			ResponseWriter: w,
			request:        r,
			minSize:        options.MinSize,
		}
		defer func() {
			_ = writer.Close()
		}()

		next.ServeHTTP(writer, r)
	})
}

type compressedResponseWriter struct {
	http.ResponseWriter
	request     *http.Request
	statusCode  int
	wroteHeader bool
	sentHeader  bool
	decided     bool
	compress    bool
	gzipWriter  *gzip.Writer
	minSize     int
}

func (w *compressedResponseWriter) WriteHeader(statusCode int) {
	if w.wroteHeader {
		return
	}

	w.wroteHeader = true
	w.statusCode = statusCode
}

func (w *compressedResponseWriter) Write(body []byte) (int, error) {
	if !w.decided {
		w.decide(body)
	}
	if !w.sentHeader {
		w.sendHeader()
	}
	if w.gzipWriter != nil {
		return w.gzipWriter.Write(body)
	}

	return w.ResponseWriter.Write(body)
}

func (w *compressedResponseWriter) Flush() {
	if !w.decided {
		w.decide(nil)
	}
	if !w.sentHeader {
		w.sendHeader()
	}
	if w.gzipWriter != nil {
		_ = w.gzipWriter.Flush()
	}
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (w *compressedResponseWriter) Close() error {
	if !w.decided {
		w.decide(nil)
	}
	if !w.sentHeader {
		w.sendHeader()
	}
	if w.gzipWriter != nil {
		err := w.gzipWriter.Close()
		w.gzipWriter.Reset(io.Discard)
		gzipWriterPool.Put(w.gzipWriter)
		w.gzipWriter = nil
		return err
	}

	return nil
}

func (w *compressedResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}

	return hijacker.Hijack()
}

func (w *compressedResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *compressedResponseWriter) decide(body []byte) {
	if w.decided {
		return
	}

	statusCode := w.statusCode
	if statusCode == 0 {
		statusCode = http.StatusOK
	}

	headers := w.Header()
	contentType := headers.Get("Content-Type")
	if contentType == "" && len(body) > 0 {
		contentType = http.DetectContentType(body)
		headers.Set("Content-Type", contentType)
	}

	w.compress = shouldCompressResponse(w.request, statusCode, headers, contentType, body, w.minSize)
	if w.compress {
		headers.Del("Content-Length")
		headers.Del("Accept-Ranges")
		headers.Set("Content-Encoding", "gzip")
		addVary(headers, "Accept-Encoding")
		w.gzipWriter = gzipWriterPool.Get().(*gzip.Writer)
		w.gzipWriter.Reset(w.ResponseWriter)
	}

	w.decided = true
}

func (w *compressedResponseWriter) sendHeader() {
	statusCode := w.statusCode
	if statusCode == 0 {
		statusCode = http.StatusOK
	}

	w.ResponseWriter.WriteHeader(statusCode)
	w.sentHeader = true
}

func requestSupportsGzip(r *http.Request) bool {
	if r.Method == http.MethodHead {
		return false
	}
	if r.Header.Get("Range") != "" {
		return false
	}

	return headerContainsToken(r.Header, "Accept-Encoding", "gzip")
}

func shouldCompressResponse(_ *http.Request, statusCode int, headers http.Header, contentType string, body []byte, minSize int) bool {
	if statusCode < 200 || statusCode == http.StatusNoContent || statusCode == http.StatusNotModified || statusCode == http.StatusSwitchingProtocols {
		return false
	}
	if headers.Get("Content-Encoding") != "" || headers.Get("Content-Range") != "" {
		return false
	}
	if strings.Contains(strings.ToLower(headers.Get("Cache-Control")), "no-transform") {
		return false
	}
	if contentType == "" {
		return false
	}
	if contentLength, err := strconv.ParseInt(headers.Get("Content-Length"), 10, 64); err == nil && contentLength >= 0 && contentLength < int64(minSize) {
		return false
	}
	if len(body) > 0 && len(body) < minSize {
		return false
	}

	contentType = strings.ToLower(contentType)
	if strings.Contains(contentType, "text/event-stream") {
		return false
	}

	return strings.HasPrefix(contentType, "text/") ||
		strings.Contains(contentType, "application/json") ||
		strings.Contains(contentType, "application/javascript") ||
		strings.Contains(contentType, "application/xml") ||
		strings.Contains(contentType, "application/xhtml+xml") ||
		strings.Contains(contentType, "image/svg+xml")
}

func addVary(headers http.Header, value string) {
	for _, existing := range headers.Values("Vary") {
		for _, part := range strings.Split(existing, ",") {
			if strings.EqualFold(strings.TrimSpace(part), value) {
				return
			}
		}
	}

	headers.Add("Vary", value)
}
