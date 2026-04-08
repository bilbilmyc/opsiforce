import type http from "http"
import type { Duplex } from "stream"

export const RESTARTING_RESPONSE_BODY = JSON.stringify({
  error: "Pod is restarting, please retry",
})

export const BAD_GATEWAY_RESPONSE_BODY = JSON.stringify({
  error: "Project upstream is unavailable",
})

export const NOT_FOUND_RESPONSE_BODY = JSON.stringify({
  error: "Project not found",
})

export function isK8sPodError(body: string): boolean {
  try {
    const parsed = JSON.parse(body)
    return parsed.kind === "Status" && parsed.status === "Failure"
  } catch {
    return false
  }
}

export function extractProjectId(host: string): string | null {
  const sub = host.split(".")[0]
  return sub && /^[a-f0-9-]+$/.test(sub) ? sub : null
}

export function setCorsHeaders(res: http.ServerResponse, req: http.IncomingMessage) {
  res.setHeader("access-control-allow-origin", req.headers.origin || "*")
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
  res.setHeader("access-control-allow-headers", "content-type, authorization")
  res.setHeader("access-control-allow-credentials", "true")
}

function writeJsonResponse(res: http.ServerResponse, statusCode: number, body: string) {
  res.writeHead(statusCode, { "content-type": "application/json" })
  res.end(body)
}

export function sendRestartingResponse(res: http.ServerResponse) {
  writeJsonResponse(res, 503, RESTARTING_RESPONSE_BODY)
}

export function sendBadGatewayResponse(res: http.ServerResponse) {
  writeJsonResponse(res, 502, BAD_GATEWAY_RESPONSE_BODY)
}

export function sendNotFoundResponse(res: http.ServerResponse) {
  writeJsonResponse(res, 404, NOT_FOUND_RESPONSE_BODY)
}

function writeJsonUpgradeResponse(socket: Duplex, statusLine: string, body: string) {
  socket.write(
    `HTTP/1.1 ${statusLine}\r\n` +
    "Content-Type: application/json\r\n" +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    "\r\n" +
    body,
  )
  socket.destroy()
}

export function writeRestartingUpgradeResponse(socket: Duplex) {
  writeJsonUpgradeResponse(socket, "503 Service Unavailable", RESTARTING_RESPONSE_BODY)
}

export function writeBadGatewayUpgradeResponse(socket: Duplex) {
  writeJsonUpgradeResponse(socket, "502 Bad Gateway", BAD_GATEWAY_RESPONSE_BODY)
}

export function writeNotFoundUpgradeResponse(socket: Duplex) {
  writeJsonUpgradeResponse(socket, "404 Not Found", NOT_FOUND_RESPONSE_BODY)
}
