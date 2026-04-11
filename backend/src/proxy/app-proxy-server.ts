import { NotFoundException } from "@nestjs/common"
import http from "http"
import { Readable, pipeline } from "stream"
import { ProjectService } from "../project/project.service"
import { ProxyService } from "./proxy.service"
import { AppRequestLogger } from "../app-request/app-request-logger"
import {
  extractProjectId,
  isK8sPodError,
  sendBadGatewayResponse,
  sendDisabledResponse,
  sendNotFoundResponse,
  sendRestartingResponse,
  setCorsHeaders,
  writeBadGatewayUpgradeResponse,
  writeDisabledUpgradeResponse,
  writeNotFoundUpgradeResponse,
  writeRestartingUpgradeResponse,
} from "./proxy.shared"

const MAX_BUFFER_SIZE = 1 * 1024 * 1024

interface ProxyResult {
  result: "ok" | "restart"
  statusCode: number
  responseSize: number
  responseHeaders: string
  responseBody: string | null
}

export function createAppProxyServer(
  proxyService: ProxyService,
  projectService: ProjectService,
  logger: AppRequestLogger,
) {
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

    const start = Date.now()

    try {
      const ensured = await projectService.ensureProjectById(projectId, "app")
      if (ensured.state === "disabled") {
        sendDisabledResponse(res)
        return
      }
      if (ensured.state === "starting") {
        sendRestartingResponse(res)
        return
      }

      const hasBody = req.method !== "GET" && req.method !== "HEAD"
      const requestBody = hasBody && shouldBufferRequest(req.headers)
        ? await collectBody(req)
        : null

      const proxyResult = await proxyHttp(proxyService, projectId, req, res, requestBody)

      if (proxyResult.result === "restart") {
        if (await shouldRestartProject(projectService, projectId)) {
          sendRestartingResponse(res)
          return
        }
        sendBadGatewayResponse(res)
        return
      }

      logger.log(ensured.project.directory, {
        method: req.method || "GET",
        url: req.url || "/",
        domain: req.headers.host || null,
        status: proxyResult.statusCode,
        size: proxyResult.responseSize,
        durationMs: Date.now() - start,
        requestHeaders: JSON.stringify(req.headers),
        responseHeaders: proxyResult.responseHeaders,
        requestBody: requestBody ? requestBody.toString("utf-8") : null,
        responseBody: proxyResult.responseBody,
      })
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
      if (ensured.state === "disabled") {
        writeDisabledUpgradeResponse(socket)
        return
      }
      if (ensured.state === "starting") {
        writeRestartingUpgradeResponse(socket)
        return
      }

      const result = await proxyWs(proxyService, projectId, req, socket)
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
  proxyService: ProxyService,
  projectId: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  requestBody: Buffer | null,
): Promise<ProxyResult> {
  const upstream = await proxyService.resolveAppUpstreamByProjectId(projectId)
  const upstreamPath = new URL(upstream).pathname
  const targetUrl = `${upstream}${req.url}`

  const headers: Record<string, string> = {}
  for (const [key, val] of Object.entries(req.headers)) {
    if (key === "host" || key === "connection") continue
    if (typeof val === "string") headers[key] = val
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD"
  const fetchOptions: RequestInit = { method: req.method, headers }

  if (hasBody) {
    if (requestBody) {
      fetchOptions.body = new Uint8Array(requestBody)
    } else {
      fetchOptions.body = Readable.toWeb(req) as ReadableStream
      // @ts-expect-error duplex required for streaming body
      fetchOptions.duplex = "half"
    }
  }

  const response = await fetch(targetUrl, fetchOptions)
  const responseHeaders = JSON.stringify(Object.fromEntries(response.headers.entries()))

  if (response.status >= 400) {
    const text = await response.text()
    if (isK8sPodError(text)) {
      return { result: "restart", statusCode: response.status, responseSize: 0, responseHeaders, responseBody: null }
    }

    const resHeaders = filterResponseHeaders(response.headers)
    res.writeHead(response.status, resHeaders)
    res.end(text)
    return { result: "ok", statusCode: response.status, responseSize: Buffer.byteLength(text), responseHeaders, responseBody: text }
  }

  const resHeaders = filterResponseHeaders(response.headers)
  res.writeHead(response.status, resHeaders)

  if (!response.body) {
    res.end()
    return { result: "ok", statusCode: response.status, responseSize: 0, responseHeaders, responseBody: null }
  }

  const contentType = response.headers.get("content-type") || ""

  if (upstreamPath !== "/" && contentType.includes("text/html")) {
    const html = await response.text()
    const rewritten = html.replaceAll(upstreamPath, "")
    res.end(rewritten)
    return { result: "ok", statusCode: response.status, responseSize: Buffer.byteLength(rewritten), responseHeaders, responseBody: html }
  }

  const knownSize = parseInt(response.headers.get("content-length") || "0", 10)

  if (isTextContent(contentType) && (knownSize === 0 || knownSize < MAX_BUFFER_SIZE)) {
    const text = await response.text()
    res.end(text)
    return { result: "ok", statusCode: response.status, responseSize: Buffer.byteLength(text), responseHeaders, responseBody: text }
  }

  pipeline(Readable.fromWeb(response.body as import("stream/web").ReadableStream), res, () => {})
  return { result: "ok", statusCode: response.status, responseSize: knownSize, responseHeaders, responseBody: null }
}

async function proxyWs(
  proxyService: ProxyService,
  projectId: string,
  req: http.IncomingMessage,
  socket: import("stream").Duplex,
): Promise<"ok" | "restart"> {
  const upstream = await proxyService.resolveAppUpstreamByProjectId(projectId)
  const upstreamUrl = new URL(upstream)

  return new Promise((resolve, reject) => {
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

function filterResponseHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    if (key === "transfer-encoding" || key === "content-length") continue
    filtered[key] = value
  }
  return filtered
}

function isTextContent(contentType: string): boolean {
  return contentType.includes("application/json")
    || contentType.includes("text/")
    || contentType.includes("application/xml")
    || contentType.includes("application/javascript")
}

function shouldBufferRequest(headers: http.IncomingHttpHeaders): boolean {
  const contentType = headers["content-type"] || ""
  if (contentType.includes("multipart")) return false
  const contentLength = parseInt(headers["content-length"] || "0", 10)
  if (contentLength > MAX_BUFFER_SIZE) return false
  return true
}

async function collectBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
