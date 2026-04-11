export interface RequestLogEntry {
  method: string
  url: string
  domain: string | null
  status: number
  size: number
  durationMs: number
  requestHeaders: string | null
  responseHeaders: string | null
  requestBody: string | null
  responseBody: string | null
}
