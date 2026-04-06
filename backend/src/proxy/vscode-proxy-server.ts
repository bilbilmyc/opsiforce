import http from "http"
import net from "net"
import { spawn, ChildProcess } from "child_process"
import { Readable, pipeline } from "stream"
import { ProxyService } from "./proxy.service"

interface PortForward {
  port: number
  process: ChildProcess
  podName: string
}

class PortForwardManager {
  private forwards = new Map<string, PortForward>()
  private namespace: string

  constructor(namespace: string) {
    this.namespace = namespace
  }

  async getLocalPort(projectId: string, podName: string): Promise<number> {
    const existing = this.forwards.get(projectId)
    if (existing && existing.podName === podName && !existing.process.killed) {
      return existing.port
    }

    if (existing) {
      existing.process.kill()
      this.forwards.delete(projectId)
    }

    const port = await this.findFreePort()
    const proc = spawn("kubectl", [
      "port-forward", `-n`, this.namespace, podName, `${port}:8080`,
    ], { stdio: "ignore" })

    proc.on("exit", () => this.forwards.delete(projectId))

    this.forwards.set(projectId, { port, process: proc, podName })

    await new Promise((r) => setTimeout(r, 1000))
    return port
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer()
      srv.listen(0, () => {
        const port = (srv.address() as net.AddressInfo).port
        srv.close(() => resolve(port))
      })
      srv.on("error", reject)
    })
  }

  cleanup() {
    for (const [, fwd] of this.forwards) {
      fwd.process.kill()
    }
    this.forwards.clear()
  }
}

export function createVscodeProxyServer(proxyService: ProxyService, opts?: { namespace?: string }) {
  const portForwardMgr = opts?.namespace ? new PortForwardManager(opts.namespace) : null

  process.on("exit", () => portForwardMgr?.cleanup())

  async function resolveUpstream(projectId: string): Promise<string> {
    if (!portForwardMgr) {
      return proxyService.resolveVscodeUpstreamByProjectId(projectId)
    }

    const upstream = await proxyService.resolveVscodeUpstreamByProjectId(projectId)
    const upstreamUrl = new URL(upstream)

    if (upstreamUrl.hostname === "localhost" || upstreamUrl.hostname === "127.0.0.1") {
      const podName = await proxyService.getPodNameByProjectId(projectId)
      const localPort = await portForwardMgr.getLocalPort(projectId, podName)
      return `http://localhost:${localPort}`
    }

    return upstream
  }

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
      await proxyHttp(resolveUpstream, projectId, req, res)
    } catch {
      if (!res.headersSent) {
        res.writeHead(503, { "content-type": "application/json" })
      }
      res.end(JSON.stringify({ error: "VS Code not available" }))
    }
  })

  server.on("upgrade", async (req, socket) => {
    const projectId = extractProjectId(req.headers.host || "")
    if (!projectId) { socket.destroy(); return }

    try {
      await proxyWs(resolveUpstream, projectId, req, socket)
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

async function proxyHttp(resolveUpstream: (id: string) => Promise<string>, projectId: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const upstream = await resolveUpstream(projectId)
  const targetUrl = `${upstream}${req.url}`

  const headers: Record<string, string> = {}
  for (const [key, val] of Object.entries(req.headers)) {
    if (key === "host" || key === "connection" || key === "accept-encoding") continue
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
    if (key === "transfer-encoding" || key === "content-length" || key === "content-encoding" || key === "x-frame-options" || key === "content-security-policy") continue
    resHeaders[key] = value
  }
  res.writeHead(response.status, resHeaders)

  if (!response.body) {
    res.end()
    return
  }

  pipeline(Readable.fromWeb(response.body as import("stream/web").ReadableStream), res, () => {})
}

async function proxyWs(resolveUpstream: (id: string) => Promise<string>, projectId: string, req: http.IncomingMessage, socket: import("stream").Duplex) {
  const upstream = await resolveUpstream(projectId)
  const upstreamUrl = new URL(upstream)

  const headers = { ...req.headers, host: `${upstreamUrl.hostname}:${upstreamUrl.port}` }
  delete headers.origin

  const proxyReq = http.request({
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    path: req.url,
    method: "GET",
    headers,
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
