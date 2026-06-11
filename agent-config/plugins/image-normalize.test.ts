import { expect, test } from "bun:test"
import sharp from "sharp"
import type { Hooks } from "@opencode-ai/plugin"
import { ImageNormalizePlugin } from "./image-normalize"

type TransformMessages = Parameters<NonNullable<Hooks["experimental.chat.messages.transform"]>>[1]["messages"]
type MessagePart = TransformMessages[number]["parts"][number]

const logged: Array<{ level: string; message: string }> = []
const client = {
  app: {
    log: async (input: { body: { level: string; message: string } }) => {
      logged.push({ level: input.body.level, message: input.body.message })
      return {}
    },
  },
}

const hooks = await ImageNormalizePlugin({ client } as never)

async function makePng(width: number, height: number, noise = false) {
  const image = noise
    ? sharp(Buffer.from(Array.from({ length: width * height * 3 }, () => Math.floor(Math.random() * 256))), {
        raw: { width, height, channels: 3 },
      })
    : sharp({ create: { width, height, channels: 3, background: { r: 200, g: 220, b: 240 } } })
  return `data:image/png;base64,${(await image.png().toBuffer()).toString("base64")}`
}

async function dims(url: string) {
  const base64 = url.split(",")[1]
  const metadata = await sharp(Buffer.from(base64, "base64")).metadata()
  return { width: metadata.width, height: metadata.height, base64Length: base64.length }
}

function filePart(mime: string, url: string) {
  return { type: "file", mime, url } as MessagePart & { mime: string; url: string }
}

function toolPart(attachments: Array<{ mime: string; url: string }>, compacted?: number) {
  return {
    type: "tool",
    state: { status: "completed", time: { start: 1, end: 2, compacted }, attachments },
  } as MessagePart
}

function message(parts: MessagePart[]): TransformMessages[number] {
  return { info: {} as TransformMessages[number]["info"], parts }
}

test("transform resizes oversized file parts and keeps aspect ratio", async () => {
  const part = filePart("image/png", await makePng(3500, 2200))
  await hooks["experimental.chat.messages.transform"]?.({}, { messages: [message([part])] })
  expect(await dims(part.url)).toMatchObject({ width: 2000, height: 1257 })
  expect(part.mime).toBe("image/png")
})

test("transform leaves images within limits untouched", async () => {
  const part = filePart("image/png", await makePng(1200, 800))
  const original = part.url
  await hooks["experimental.chat.messages.transform"]?.({}, { messages: [message([part])] })
  expect(part.url).toBe(original)
})

test("transform resizes tool attachments and skips compacted ones", async () => {
  const active = { mime: "image/png", url: await makePng(2600, 2600) }
  const compacted = { mime: "image/png", url: await makePng(2600, 2600) }
  const original = compacted.url
  await hooks["experimental.chat.messages.transform"]?.(
    {},
    { messages: [message([toolPart([active]), toolPart([compacted], 3)])] },
  )
  expect(await dims(active.url)).toMatchObject({ width: 2000, height: 2000 })
  expect(compacted.url).toBe(original)
})

test("tool.execute.after resizes output attachments in place", async () => {
  const attachment = { mime: "image/png", url: await makePng(4200, 900) }
  const output = { title: "t", output: "o", metadata: {}, attachments: [attachment] }
  await hooks["tool.execute.after"]?.({ tool: "read", sessionID: "s", callID: "c", args: {} }, output)
  expect(await dims(attachment.url)).toMatchObject({ width: 2000, height: 429 })
})

test("chat.message falls back to jpeg ladder when png exceeds byte cap", async () => {
  const part = filePart("image/png", await makePng(2400, 2400, true))
  await hooks["chat.message"]?.({ sessionID: "s" }, { message: {} as never, parts: [part] })
  const result = await dims(part.url)
  expect(result.width ?? 0).toBeLessThanOrEqual(2000)
  expect(result.height ?? 0).toBeLessThanOrEqual(2000)
  expect(result.base64Length).toBeLessThanOrEqual(5 * 1024 * 1024)
  expect(part.mime).toBe("image/jpeg")
})

test("malformed message shapes never throw into the pipeline", async () => {
  const malformed = [
    { info: {}, parts: [{ type: "tool" }, { type: "file" }, null] },
    { info: {}, parts: null },
    null,
  ] as never
  await hooks["experimental.chat.messages.transform"]?.({}, { messages: malformed })
  await hooks["chat.message"]?.({ sessionID: "s" }, { message: {}, parts: [{ type: "file" }] } as never)
  await hooks["tool.execute.after"]?.(
    { tool: "read", sessionID: "s", callID: "c", args: {} },
    { title: "t", output: "o", metadata: {}, attachments: [{}] } as never,
  )
  expect(logged.some((line) => line.message === "image normalization hook failed")).toBe(true)
})

test("broken and non-image payloads pass through untouched", async () => {
  const broken = filePart("image/png", "data:image/png;base64,not-an-image")
  const pdf = filePart("application/pdf", "data:application/pdf;base64,AAAA")
  await hooks["chat.message"]?.({ sessionID: "s" }, { message: {} as never, parts: [broken, pdf] })
  expect(broken.url).toBe("data:image/png;base64,not-an-image")
  expect(pdf.url).toBe("data:application/pdf;base64,AAAA")
  expect(logged.some((line) => line.level === "error")).toBe(true)
})
