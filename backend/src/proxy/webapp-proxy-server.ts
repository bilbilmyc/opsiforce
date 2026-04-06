import http from "http"
import { Readable, pipeline } from "stream"
import { ProxyService } from "./proxy.service"

export function createWebappProxyServer(proxyService: ProxyService) {
  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res, req)

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }

    const projectId = extractProjectId(req.headers.host || "")
    if (!projectId) {
      res.writeHead(400, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "Invalid subdomain" }))
      return
    }

    try {
      await proxyHttp(proxyService, projectId, req, res)
    } catch {
      if (!res.headersSent) {
        res.writeHead(503, { "content-type": "application/json" })
      }
      res.end(JSON.stringify({ error: "Webapp not available" }))
    }
  })

  server.on("upgrade", async (req, socket) => {
    const projectId = extractProjectId(req.headers.host || "")
    if (!projectId) { socket.destroy(); return }

    try {
      await proxyWs(proxyService, projectId, req, socket)
    } catch {
      socket.destroy()
    }
  })

  return server
}

function extractProjectId(host: string): string | null {
  const sub = host.split(".")[0]
  return sub && /^[a-f0-9-]+$/.test(sub) ? sub : null
}

function setCorsHeaders(res: http.ServerResponse, req: http.IncomingMessage) {
  res.setHeader("access-control-allow-origin", req.headers.origin || "*")
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
  res.setHeader("access-control-allow-headers", "content-type, authorization")
  res.setHeader("access-control-allow-credentials", "true")
}

async function proxyHttp(proxyService: ProxyService, projectId: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const upstream = await proxyService.resolveWebappUpstreamByProjectId(projectId)
  const upstreamPath = new URL(upstream).pathname
  const targetUrl = `${upstream}${req.url}`

  const headers: Record<string, string> = {}
  for (const [key, val] of Object.entries(req.headers)) {
    if (key === "host" || key === "connection") continue
    if (typeof val === "string") headers[key] = val
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD"
  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) as ReadableStream : undefined,
    // @ts-expect-error duplex required for streaming body
    duplex: hasBody ? "half" : undefined,
  })

  const resHeaders: Record<string, string> = {}
  for (const [key, value] of response.headers.entries()) {
    if (key === "transfer-encoding" || key === "content-length") continue
    resHeaders[key] = value
  }
  res.writeHead(response.status, resHeaders)

  if (!response.body) {
    res.end()
    return
  }

  const contentType = response.headers.get("content-type") || ""
  if (upstreamPath !== "/" && contentType.includes("text/html")) {
    const html = await response.text()
    res.end(html.replaceAll(upstreamPath, ""))
    return
  }

  pipeline(Readable.fromWeb(response.body as import("stream/web").ReadableStream), res, () => {})
}

async function proxyWs(proxyService: ProxyService, projectId: string, req: http.IncomingMessage, socket: import("stream").Duplex) {
  const upstream = await proxyService.resolveWebappUpstreamByProjectId(projectId)
  const upstreamUrl = new URL(upstream)

  const proxyReq = http.request({
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    path: req.url,
    method: "GET",
    headers: {
      ...req.headers,
      host: `${upstreamUrl.hostname}:${upstreamUrl.port}`,
    },
  })

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    let response = `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      response += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`
    }
    response += "\r\n"
    socket.write(response)
    if (proxyHead.length > 0) socket.write(proxyHead)

    proxySocket.pipe(socket)
    socket.pipe(proxySocket)

    proxySocket.on("error", () => socket.destroy())
    socket.on("error", () => proxySocket.destroy())
    proxySocket.on("close", () => socket.destroy())
    socket.on("close", () => proxySocket.destroy())
  })

  proxyReq.on("error", () => socket.destroy())
  proxyReq.end()
}
