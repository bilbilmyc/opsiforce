---
name: llm-api
description: Call the LLM gateway (APP_LLM_API_KEY) for AI capabilities — chat/text completions, structured output, streaming, vision (image analysis), image generation, and audio/video transcription. Routes to OpenAI (GPT) and Anthropic (Claude) through Bifrost via one OpenAI-compatible key, with reasoning-effort control. Use whenever a task needs AI — adding a feature to an app being built, or doing a one-off job directly such as transcribing a video/podcast/audio file, analyzing or generating images, or generating text — including direct tasks with no app. This is the only sanctioned path for transcription; a local speech model or browser speech API must not be used.
---

# AI API Integration

A single OpenAI-compatible gateway is available via these environment variables — for the apps you build **and for one-off AI tasks you run yourself** (transcribing a file, analyzing an image, generating text/images):

- `APP_LLM_API_KEY` — gateway API key
- `APP_LLM_BASE_URL` — gateway base URL (already includes `/v1`)

**Use `APP_LLM_API_KEY` / `APP_LLM_BASE_URL` for every gateway call** — in app code and in direct shell tasks alike. Do NOT use `OPENAI_API_KEY` / `OPENAI_BASE_URL`; those are the coding agent's own chat key.

The endpoint is a gateway that routes to both OpenAI and Anthropic. You select the provider with the `provider/model` prefix in the `model` field (e.g. `openai/gpt-5.4-mini`, `anthropic/claude-sonnet-4-6`). One SDK, one key, both providers.

## Setup (OpenAI SDK)

The `openai` SDK is the right default — it talks to the gateway's OpenAI-compatible endpoint and reaches **both** GPT and Claude models. You do not need a separate Anthropic SDK.

Install:
```bash
yarn add openai
```

Initialize:
```typescript
import OpenAI from "openai"

const llm = new OpenAI({
  apiKey: process.env.APP_LLM_API_KEY,
  baseURL: process.env.APP_LLM_BASE_URL,
})
```

### Choosing a library

- **`openai` (default, recommended)** — covers everything these apps need against the gateway: chat completions, structured output (`response_format`), streaming, tool/function calling, reasoning effort, vision, and Whisper audio. One dependency, owned by the API vendor. Use it unless you have a specific reason not to.
- **Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`)** — only worth adding if you need provider-agnostic structured output (`generateObject`) or multi-step agent orchestration (`generateText` with `stopWhen`, the `Agent` abstraction). The gateway already unifies providers at the wire level, so the AI SDK's main selling point adds little here. Don't reach for it for ordinary completions/streaming.
- **`@anthropic-ai/sdk`, LangChain** — not needed. Claude is reachable through the `openai` SDK via the gateway; LangChain is overkill for app-level AI features.

## Available Models

Select a model with the `provider/model` prefix, then set [reasoning effort](#reasoning-effort-important) to match the task. Those two choices *together* decide quality — a capable model with no reasoning is just as weak as a cheap one. All chat models below are reasoning-capable and support vision.

> ⚠️ **The #1 cause of a weak "AI agent" is a cheap model running with no reasoning** — e.g. `nano` at its default effort. That combination is fast and cheap and *consistently produces bad agents*. For anything that analyses, decides, or behaves agentically, use a **balanced model (`gpt-5.4-mini` / `claude-sonnet-4-6`) with `reasoning_effort: "medium"` or `"high"`.** Save the cheapest models for trivial, high-volume calls.

| When you need | OpenAI | Anthropic | Use for | Pair with effort |
|------|--------|-----------|---------|------------------|
| **Speed & low cost** | `openai/gpt-5.4-nano` | `anthropic/claude-haiku-4-5` | High-volume simple work: classification, tagging, extraction, routing | `"minimal"` / `"low"` |
| **Balance — the default** | `openai/gpt-5.4-mini` | `anthropic/claude-sonnet-4-6` | Most in-app AI & backend jobs: analysis, judgement, generation, tool use, multi-step agents | `"medium"` / `"high"` |
| **Maximum capability** | `openai/gpt-5.5` | `anthropic/claude-opus-4-8` | Hardest multi-step reasoning, long-horizon jobs, top-quality output | GPT-5.5: `"high"` · Opus 4.8: omit (see note) |
| **Audio** | `whisper-1` | — | Speech-to-text transcription | — |

> **Opus 4.8 is the one exception to "always set effort."** It reasons adaptively on its own, and setting `reasoning_effort` on it through the gateway returns an error — so **omit the field for Opus 4.8** and it thinks automatically. Every other model needs an explicit `reasoning_effort`.

### Choosing a model

- **Default to the balanced models** (`openai/gpt-5.4-mini` or `anthropic/claude-sonnet-4-6`) for any job that reasons, decides, or uses tools. Claude Sonnet 4.6 lands near Opus-level quality on everyday tasks at roughly 40% lower cost and about 2× the speed; `gpt-5.4-mini` is the OpenAI equivalent. This is almost always the right starting point.
- **Step up to the most capable models** (`openai/gpt-5.5`, or `anthropic/claude-opus-4-8` — reasons adaptively, so omit `reasoning_effort` for it) only when a balanced model at `"high"` effort still falls short — long-horizon planning, deep multi-step reasoning. They cost several times more, so don't reach for them by default.
- **Drop to the cheapest models** only for genuinely simple, high-volume calls — and still pair them with `"low"` effort, never none. Don't build a decision-making agent on them.
- **Structured output (JSON schema)** — prefer OpenAI models; `response_format: { type: "json_schema" }` is native to OpenAI and most reliable through the gateway.
- **Nuanced analysis / long-form writing** — Claude (Sonnet 4.6, or Opus 4.8 for the hardest tasks).
- **Audio transcription** — `whisper-1` only. **Vision** — any chat model; pick the tier by how much the image task needs to *reason*, not just describe.

## Reasoning effort (IMPORTANT)

These are **reasoning models**. Left unconfigured they spend little or no effort "thinking" before answering — which produces shallow, low-quality results and is the most common cause of a disappointing AI feature. This bites hardest in **backend jobs and autonomous agents that run unattended**: no user is watching to catch a bad answer, so the model's first attempt has to be right. **Always set `reasoning_effort` explicitly, scaled to the task** — do not rely on the default.

```typescript
const response = await llm.chat.completions.create({
  model: "openai/gpt-5.4-mini",
  messages: [
    { role: "system", content: "You are a financial analyst." },
    { role: "user", content: prompt },
  ],
  reasoning_effort: "high",        // "minimal" | "low" | "medium" | "high"
  max_completion_tokens: 8000,
})
const text = response.choices[0].message.content
```

`reasoning_effort` works for GPT and for Claude **Sonnet/Haiku** through the gateway — for Claude it is translated into an extended-thinking budget automatically, so you use the same field regardless of provider. **The one exception is Claude Opus 4.8: omit `reasoning_effort` for it** — it reasons adaptively on its own, and setting the field errors on the gateway.

### How much effort?

| Task | `reasoning_effort` | Why |
|------|-------------------|-----|
| Classification, tagging, extraction, formatting, simple lookups | `"low"` (or `"minimal"`) | Pattern work; reasoning adds latency and cost without improving the result |
| Summarization, rewriting, Q&A, most everyday generation | `"medium"` | Balanced default |
| Multi-step logic, data analysis, planning, drafting decisions, tool-using agents, anything a backend job decides or acts on unattended | `"high"` | Quality scales with reasoning — this is what separates a useful agent from one that's confidently wrong |

When in doubt, **start at `"medium"` and raise to `"high"`** if the output is shallow or makes mistakes. Higher effort = better quality but more latency (the model thinks before the first token appears) and more cost (reasoning tokens are billed).

### Token limit — use `max_completion_tokens`

Cap output with **`max_completion_tokens`**, never `max_tokens` — the gateway silently ignores `max_tokens`, so that limit does nothing. This matters specifically because reasoning depends on it: reasoning tokens come out of this same budget, so size it generously (`8000`+ at `"high"` effort) or the visible answer gets truncated. For Claude the budget **must be > 1024** or the reasoning call fails outright; `4000`–`8000` is safe.

Pass `reasoning_effort` on its own — don't also send a manual `reasoning: {...}` object (sending both is an error).

## Common Patterns

### Text Generation

```typescript
const response = await llm.chat.completions.create({
  model: "openai/gpt-5.4-mini",
  messages: [{ role: "user", content: prompt }],
  reasoning_effort: "medium",
  max_completion_tokens: 2000,
})
const text = response.choices[0].message.content
```

### Structured Output (JSON)

Prefer an OpenAI model for structured output. For pure extraction, `"low"` effort is usually enough; raise it only if deciding the field values needs real reasoning.

Return typed JSON using `response_format`:

```typescript
const response = await llm.chat.completions.create({
  model: "openai/gpt-5.4-nano",
  messages: [
    {
      role: "system",
      content: "Extract entities as JSON: { \"names\": string[], \"locations\": string[], \"dates\": string[] }",
    },
    { role: "user", content: text },
  ],
  response_format: { type: "json_object" },
  reasoning_effort: "low",
  max_completion_tokens: 1500,
})

const data = JSON.parse(response.choices[0].message.content!)
// data.names, data.locations, data.dates
```

For stricter control, use a JSON schema:

```typescript
const response = await llm.chat.completions.create({
  model: "openai/gpt-5.4-mini",
  messages: [{ role: "user", content: "Analyze this product review: ..." }],
  reasoning_effort: "medium",
  max_completion_tokens: 2000,
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "review_analysis",
      strict: true,
      schema: {
        type: "object",
        properties: {
          sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
          confidence: { type: "number" },
          topics: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
        required: ["sentiment", "confidence", "topics", "summary"],
        additionalProperties: false,
      },
    },
  },
})

const analysis = JSON.parse(response.choices[0].message.content!)
```

### Streaming

Stream responses to the frontend using Server-Sent Events:

```typescript
// API route handler
const stream = await llm.chat.completions.create({
  model: "openai/gpt-5.4-mini",
  messages: [{ role: "user", content: prompt }],
  reasoning_effort: "medium",
  max_completion_tokens: 2000,
  stream: true,
})

// Write SSE events
res.setHeader("Content-Type", "text/event-stream")
res.setHeader("Cache-Control", "no-cache")

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content
  if (content) {
    res.write(`data: ${JSON.stringify({ content })}\n\n`)
  }
}
res.write("data: [DONE]\n\n")
res.end()
```

With higher `reasoning_effort` the model thinks before the first content token, so there is a pause before streaming begins. Show a "thinking…" indicator on the frontend so the wait reads as intentional.

### Multi-turn Conversation

```typescript
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a helpful assistant." },
]

async function chat(userMessage: string): Promise<string> {
  messages.push({ role: "user", content: userMessage })

  const response = await llm.chat.completions.create({
    model: "openai/gpt-5.4-mini",
    messages,
    reasoning_effort: "medium",
    max_completion_tokens: 2000,
  })

  const reply = response.choices[0].message.content!
  messages.push({ role: "assistant", content: reply })
  return reply
}
```

### Vision (Image Analysis)

Analyze images by passing `image_url` content parts:

```typescript
const response = await llm.chat.completions.create({
  model: "openai/gpt-5.4-mini",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What's in this image?" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/photo.jpg" },
        },
      ],
    },
  ],
  reasoning_effort: "low",
  max_completion_tokens: 1500,
})
const description = response.choices[0].message.content
```

From an uploaded file buffer (e.g., via multer or formidable):

```typescript
const base64 = buffer.toString("base64")
const dataUrl = `data:${mimetype};base64,${base64}`

const response = await llm.chat.completions.create({
  model: "openai/gpt-5.4-mini",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: dataUrl, detail: "auto" },
        },
      ],
    },
  ],
  reasoning_effort: "low",
  max_completion_tokens: 1500,
})
```

The `detail` parameter controls token usage: `"low"` (fixed 85 tokens, fast), `"high"` (detailed analysis, more tokens), `"auto"` (model decides). Multiple images can be sent as additional `image_url` entries in the content array. For questions that require reasoning *about* the image (counting, diagnosis, judgement), raise `reasoning_effort` to `"medium"`/`"high"`.

### Audio Transcription

Convert audio to text using the Whisper API (no reasoning settings apply):

```typescript
import { createReadStream } from "fs"

const transcription = await llm.audio.transcriptions.create({
  file: createReadStream("audio.mp3"),
  model: "whisper-1",
})
const text = transcription.text
```

From an uploaded file buffer:

```typescript
import { toFile } from "openai"

const transcription = await llm.audio.transcriptions.create({
  file: await toFile(buffer, "audio.webm"),
  model: "whisper-1",
})
```

With options:

```typescript
const transcription = await llm.audio.transcriptions.create({
  file: await toFile(buffer, "audio.mp3"),
  model: "whisper-1",
  language: "en",
  response_format: "verbose_json",
  prompt: "Technical meeting about Kubernetes deployments",
})
```

Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm (max 25 MB). Use `response_format` for different outputs: `"text"` (plain string), `"json"` (with text field), `"verbose_json"` (with word-level timestamps), `"srt"` or `"vtt"` (subtitle formats).

#### Direct task — transcribe a file yourself, no app

When asked to transcribe a video/podcast/audio (not build an app), skip app code — fetch the media and post it to the gateway from the shell:

```bash
yt-dlp -x --audio-format mp3 -o audio.mp3 "<url>"   # or, for a local file: ffmpeg -i input.mp4 -vn audio.mp3
curl -s "$APP_LLM_BASE_URL/audio/transcriptions" \
  -H "Authorization: Bearer $APP_LLM_API_KEY" \
  -F model=whisper-1 -F response_format=text -F file=@audio.mp3
```

Whisper accepts up to 25 MB per request — split longer media with `ffmpeg` (`-f segment -segment_time 900`) and join the text.

### Image Generation

Generate an image from a text prompt with `gpt-image-2` (the current OpenAI image model) via `images.generate`. Image models **always return base64** (`b64_json`) — there is no URL to fetch.

```typescript
const result = await llm.images.generate({
  model: "openai/gpt-image-2",
  prompt: "A watercolor illustration of a fox in a forest, soft morning light",
  size: "1024x1024",   // "1024x1024" | "1536x1024" (landscape) | "1024x1536" (portrait) | "auto"
  quality: "medium",   // "low" | "medium" | "high" | "auto"
})

const b64 = result.data[0].b64_json!
const buffer = Buffer.from(b64, "base64") // save to disk, store, or return to the client
```

Return it to the frontend as a data URL, or persist the buffer and serve it from your own endpoint:

```typescript
const dataUrl = `data:image/png;base64,${result.data[0].b64_json}`
```

**Edit an existing image** (inpainting / variations) with `images.edit` — pass the source image and an optional mask:

```typescript
import { toFile } from "openai"

const edited = await llm.images.edit({
  model: "openai/gpt-image-2",
  image: await toFile(buffer, "input.png", { type: "image/png" }),
  prompt: "Add a red scarf around the fox's neck",
})
const out = edited.data[0].b64_json!
```

- `n` (1–10) returns multiple images; `background: "transparent"` requires `output_format: "png"` or `"webp"`.
- Cost scales with `size` × `quality` — default to `"medium"`, use `"high"` only when detail matters. Image calls draw on the same project budget as chat.
- Reasoning settings (`reasoning_effort`, `max_completion_tokens`) do not apply to image generation.

## Guidelines

- **Always set `reasoning_effort`** — `"low"` for extraction/classification, `"medium"` as the default, `"high"` for anything that needs real thinking. Omitting it gives shallow results. (Only exception: **Opus 4.8** — omit it; that model reasons adaptively and errors if you set it.) See [Reasoning effort](#reasoning-effort-important).
- **Use `max_completion_tokens`, never `max_tokens`** — `max_tokens` is silently ignored by the gateway. Size the limit generously when reasoning is on (reasoning tokens come out of this budget), and keep it above `1024` for Claude.
- **Match the model to the task** — `gpt-5.4-nano` / `claude-haiku-4-5` for fast/cheap work; `gpt-5.4-mini` / `claude-sonnet-4-6` for quality; `gpt-5.5` / `claude-opus-4-8` for the hardest tasks.
- **Image generation returns base64** — `images.generate` / `images.edit` with `gpt-image-2` return `b64_json` (no URL); convert to a `Buffer` or data URL to store or serve.
- **Transcription: gateway only** — never use browser speech APIs (`SpeechRecognition`, `webkitSpeechRecognition`) or a local speech model (`openai-whisper`, `faster-whisper`, `vosk`). Always go through the gateway's `whisper-1` (see [Audio Transcription](#audio-transcription)). In an app, record with `MediaRecorder` and transcribe server-side; as a direct task, use the shell recipe above.
- **Backend only** — never expose `APP_LLM_API_KEY` to the frontend or client-side code.
- **Always wrap AI calls in try/catch** with user-friendly error messages.
- **For streaming responses to the frontend, use Server-Sent Events (SSE).**
