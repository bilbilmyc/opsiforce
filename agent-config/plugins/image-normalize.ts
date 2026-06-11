import sharp from "sharp"
import type { Hooks, Plugin } from "@opencode-ai/plugin"

const MAX_DIMENSION = 2000
const MAX_BASE64_BYTES = 5 * 1024 * 1024
const MIN_DIMENSION = 64
const DOWNSCALE_RATIO = 0.75
const JPEG_QUALITIES = [80, 70, 55, 40]
const SUPPORTED_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"])
const DATA_URL_PATTERN = /^data:([^;,]+);base64,(.+)$/s

type ImageRef = { mime: string; url: string }
type ToolResultContent = {
  type: string
  mimeType?: string
  data?: string
  resource?: { mimeType?: string; blob?: string }
}
type TransformOutput = Parameters<NonNullable<Hooks["experimental.chat.messages.transform"]>>[1]
type MessagePart = TransformOutput["messages"][number]["parts"][number]
type ToolExecuteOutput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[1]
type LogLevel = "info" | "error"
type Logger = (level: LogLevel, message: string, extra: Record<string, string | number>) => void

function exceedsLimits(width: number, height: number, base64Length: number) {
  return width > MAX_DIMENSION || height > MAX_DIMENSION || base64Length > MAX_BASE64_BYTES
}

async function encodeWithinByteLimit(image: sharp.Sharp) {
  const png = (await image.clone().png().toBuffer()).toString("base64")
  if (png.length <= MAX_BASE64_BYTES) return { mime: "image/png", data: png }
  for (const quality of JPEG_QUALITIES) {
    const jpeg = (
      await image.clone().flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer()
    ).toString("base64")
    if (jpeg.length <= MAX_BASE64_BYTES) return { mime: "image/jpeg", data: jpeg }
  }
  return undefined
}

async function fitWithinLimits(source: Buffer) {
  for (
    let dimension = MAX_DIMENSION;
    dimension >= MIN_DIMENSION;
    dimension = Math.floor(dimension * DOWNSCALE_RATIO)
  ) {
    const encoded = await encodeWithinByteLimit(
      sharp(source).resize(dimension, dimension, { fit: "inside", withoutEnlargement: true }),
    )
    if (encoded) return encoded
  }
  return undefined
}

async function normalizeRef(ref: ImageRef, log: Logger) {
  if (!SUPPORTED_MIMES.has(ref.mime.toLowerCase())) return
  const match = DATA_URL_PATTERN.exec(ref.url)
  if (!match) return
  const base64 = match[2]
  const source = Buffer.from(base64, "base64")
  const metadata = await sharp(source).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  if (!width || !height || !exceedsLimits(width, height, base64.length)) return
  const encoded = await fitWithinLimits(source)
  if (!encoded) {
    log("error", "image could not be reduced below limits", { mime: ref.mime, width, height })
    return
  }
  ref.url = `data:${encoded.mime};base64,${encoded.data}`
  ref.mime = encoded.mime
  log("info", "resized oversized image", {
    from: `${width}x${height} ${base64.length}B`,
    to: `${encoded.mime} ${encoded.data.length}B`,
  })
}

async function tryNormalizeRef(ref: ImageRef, log: Logger) {
  try {
    await normalizeRef(ref, log)
  } catch (error) {
    log("error", "image normalization failed", {
      mime: ref.mime,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function tryNormalizeBase64(mime: string, base64: string, log: Logger) {
  const ref = { mime, url: `data:${mime};base64,${base64}` }
  const original = ref.url
  await tryNormalizeRef(ref, log)
  if (ref.url === original) return undefined
  return { mime: ref.mime, base64: ref.url.slice(ref.url.indexOf(",") + 1) }
}

async function normalizeToolContent(items: ToolResultContent[], log: Logger) {
  for (const item of items) {
    if (item.type === "image" && item.mimeType && item.data) {
      const resized = await tryNormalizeBase64(item.mimeType, item.data, log)
      if (resized) {
        item.mimeType = resized.mime
        item.data = resized.base64
      }
    }
    if (item.type === "resource" && item.resource?.mimeType && item.resource.blob) {
      const resized = await tryNormalizeBase64(item.resource.mimeType, item.resource.blob, log)
      if (resized) {
        item.resource.mimeType = resized.mime
        item.resource.blob = resized.base64
      }
    }
  }
}

async function normalizeParts(parts: MessagePart[], log: Logger) {
  for (const part of parts) {
    if (part.type === "file") {
      await tryNormalizeRef(part, log)
    }
    if (part.type === "tool" && part.state.status === "completed" && !part.state.time.compacted) {
      for (const attachment of part.state.attachments ?? []) {
        await tryNormalizeRef(attachment, log)
      }
    }
  }
}

async function neverThrow(run: () => Promise<void>, log: Logger) {
  try {
    await run()
  } catch (error) {
    log("error", "image normalization hook failed", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export const ImageNormalizePlugin: Plugin = async ({ client }) => {
  const log: Logger = (level, message, extra) => {
    void client.app
      .log({ body: { service: "image-normalize", level, message, extra } })
      .catch(() => undefined)
  }

  return {
    "chat.message": (_input, output) => neverThrow(() => normalizeParts(output.parts, log), log),
    "tool.execute.after": (_input, output) =>
      neverThrow(async () => {
        const { attachments, content } = output as ToolExecuteOutput & {
          attachments?: ImageRef[]
          content?: ToolResultContent[]
        }
        for (const attachment of attachments ?? []) {
          await tryNormalizeRef(attachment, log)
        }
        await normalizeToolContent(content ?? [], log)
      }, log),
    "experimental.chat.messages.transform": (_input, output) =>
      neverThrow(async () => {
        for (const message of output.messages) {
          await normalizeParts(message.parts, log)
        }
      }, log),
  }
}
