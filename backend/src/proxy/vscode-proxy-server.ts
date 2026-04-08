import { NotFoundException } from "@nestjs/common"
import http from "http"
import net from "net"
import { spawn, ChildProcess } from "child_process"
import { Readable, pipeline } from "stream"
import { ProjectService } from "../project/project.service"
import { ProxyService } from "./proxy.service"
import {
  extractProjectId,
  isK8sPodError,
  sendBadGatewayResponse,
  sendNotFoundResponse,
  sendRestartingResponse,
  setCorsHeaders,
  writeBadGatewayUpgradeResponse,
  writeNotFoundUpgradeResponse,
  writeRestartingUpgradeResponse,
} from "./proxy.shared"

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

export function createVscodeProxyServer(
  proxyService: ProxyService,
  projectService: ProjectService,
  opts?: { namespace?: string },
) {
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
      const ensured = await projectService.ensureProjectById(projectId, "app")
      if (ensured.state === "starting") {
        sendRestartingResponse(res)
        return
      }

      const result = await proxyHttp(resolveUpstream, projectId, req, res)
      if (result === "restart") {
        if (await shouldRestartProject(projectService, projectId)) {
          sendRestartingResponse(res)
          return
        }

        sendBadGatewayResponse(res)
      }
    } catch (err) {
      if (err instanceof NotFoundException) {
        sendNotFoundResponse(res)
        return
      }

      if (!res.headersSent) {
        if (await shouldRestartProject(projectService, projectId)) {
          sendRestartingResponse(res)
          return
        }

        sendBadGatewayResponse(res)
        return
      }

      res.end()
    }
  })

  server.on("upgrade", async (req, socket) => {
    const projectId = extractProjectId(req.headers.host || "")
    if (!projectId) {
      socket.destroy()
      return
    }

    try {
      const ensured = await projectService.ensureProjectById(projectId, "app")
      if (ensured.state === "starting") {
        writeRestartingUpgradeResponse(socket)
        return
      }

      const result = await proxyWs(resolveUpstream, projectId, req, socket)
      if (result === "restart") {
        if (await shouldRestartProject(projectService, projectId)) {
          writeRestartingUpgradeResponse(socket)
          return
        }

        writeBadGatewayUpgradeResponse(socket)
      }
    } catch (err) {
      if (err instanceof NotFoundException) {
        writeNotFoundUpgradeResponse(socket)
        return
      }

      if (await shouldRestartProject(projectService, projectId)) {
        writeRestartingUpgradeResponse(socket)
        return
      }

      writeBadGatewayUpgradeResponse(socket)
    }
  })

  return server
}

async function shouldRestartProject(
  projectService: ProjectService,
  projectId: string,
): Promise<boolean> {
  try {
    return await projectService.handleProxyFailureById(projectId)
  } catch (err) {
    if (err instanceof NotFoundException) throw err
    return false
  }
}

async function proxyHttp(
  resolveUpstream: (id: string) => Promise<string>,
  projectId: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<"ok" | "restart"> {
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

  if (response.status >= 400) {
    const text = await response.text()
    if (isK8sPodError(text)) return "restart"

    const resHeaders: Record<string, string> = {}
    for (const [key, value] of response.headers.entries()) {
      if (key === "transfer-encoding" || key === "content-length" || key === "content-encoding" || key === "x-frame-options" || key === "content-security-policy") continue
      resHeaders[key] = value
    }
    res.writeHead(response.status, resHeaders)
    res.end(text)
    return "ok"
  }

  const resHeaders: Record<string, string> = {}
  for (const [key, value] of response.headers.entries()) {
    if (key === "transfer-encoding" || key === "content-length" || key === "content-encoding" || key === "x-frame-options" || key === "content-security-policy") continue
    resHeaders[key] = value
  }
  res.writeHead(response.status, resHeaders)

  if (!response.body) {
    res.end()
    return "ok"
  }

  pipeline(Readable.fromWeb(response.body as import("stream/web").ReadableStream), res, () => {})
  return "ok"
}

async function proxyWs(
  resolveUpstream: (id: string) => Promise<string>,
  projectId: string,
  req: http.IncomingMessage,
  socket: import("stream").Duplex,
): Promise<"ok" | "restart"> {
  const upstream = await resolveUpstream(projectId)
  const upstreamUrl = new URL(upstream)

  return new Promise((resolve, reject) => {
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
      resolve("ok")
    })

    proxyReq.on("response", (proxyRes) => {
      let body = ""
      proxyRes.setEncoding("utf8")
      proxyRes.on("data", (chunk) => {
        body += chunk
      })
      proxyRes.on("end", () => {
        if ((proxyRes.statusCode ?? 0) >= 400 && isK8sPodError(body)) {
          resolve("restart")
          return
        }

        reject(new Error(`Unexpected websocket response: ${proxyRes.statusCode ?? 502}`))
      })
    })

    proxyReq.on("error", reject)
    proxyReq.end()
  })
}
