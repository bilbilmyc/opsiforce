declare module "compression" {
  import type http from "http"

  interface CompressionOptions {
    filter?: (req: http.IncomingMessage, res: http.ServerResponse) => boolean
    threshold?: number | string
  }

  interface CompressionFn {
    (options?: CompressionOptions): (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      next: () => void,
    ) => void
    filter: (req: http.IncomingMessage, res: http.ServerResponse) => boolean
  }

  const compression: CompressionFn
  export = compression
}
