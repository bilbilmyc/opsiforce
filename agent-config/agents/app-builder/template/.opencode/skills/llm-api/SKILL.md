---
name: llm-api
description: Use the LLM API (APP_LLM_API_KEY) to add AI features — chat completions, structured output, streaming, vision (image analysis), audio transcription. Supports OpenAI (GPT) and Anthropic (Claude) models via Bifrost gateway. Trigger when building AI-powered features, calling GPT/Claude models, generating text, analyzing images, or transcribing audio.
---

# AI API Integration

A dedicated OpenAI-compatible API is available for the apps you build, via these environment variables:

- `APP_LLM_API_KEY` — API key for the app backend
- `APP_LLM_BASE_URL` — Base URL for the API endpoint

**Important:** Use `APP_LLM_API_KEY` / `APP_LLM_BASE_URL` in app code. Do NOT use `OPENAI_API_KEY` / `OPENAI_BASE_URL` — those are reserved for the coding agent.

## Setup (OpenAI SDK)

Install:
```bash
bun add openai
```

Initialize:
```typescript
import OpenAI from "openai"

const llm = new OpenAI({
  apiKey: process.env.APP_LLM_API_KEY,
  baseURL: process.env.APP_LLM_BASE_URL,
})
```

## Available Models

### OpenAI

| Model | Best for | Speed | Cost |
|-------|----------|-------|------|
| `gpt-5.4-nano` | Fast tasks, classification, extraction, ranking, structured output (JSON schema), vision | Very fast | Very low |
| `gpt-5.4-mini` | Complex reasoning, nuanced generation, structured output (JSON schema), vision | Medium | Medium |
| `whisper-1` | Audio transcription (speech-to-text) | Fast | Low |

### Anthropic (via Bifrost)

Use the `anthropic/` prefix with the same OpenAI SDK — Bifrost routes and translates automatically.

| Model | Best for | Speed | Cost |
|-------|----------|-------|------|
| `anthropic/claude-haiku-4-5` | Fast tasks, classification, summarization, vision | Very fast | Low |
| `anthropic/claude-sonnet-4-6` | Complex reasoning, analysis, long-form generation, coding, vision | Fast | Medium |

### Choosing a model

- **Structured output (JSON schema)** — prefer OpenAI models (`response_format: { type: "json_schema" }` is native to OpenAI)
- **Text analysis and writing** — Claude models tend to excel at nuanced analysis and long-form generation
- **Fast/cheap tasks** — `gpt-5.4-nano` or `anthropic/claude-haiku-4-5`
- **Complex reasoning** — `gpt-5.4-mini` or `anthropic/claude-sonnet-4-6`
- **Audio transcription** — `whisper-1` only (no Anthropic equivalent)
- **Vision** — both OpenAI and Anthropic models support image analysis

## Common Patterns

### Text Generation

```typescript
const response = await llm.chat.completions.create({
  model: "gpt-5.4-nano",
  messages: [{ role: "user", content: prompt }],
  max_tokens: 1000,
})
const text = response.choices[0].message.content
```

### Structured Output (JSON)

Return typed JSON using `response_format`:

```typescript
const response = await llm.chat.completions.create({
  model: "gpt-5.4-nano",
  messages: [
    {
      role: "system",
      content: "Extract entities as JSON: { \"names\": string[], \"locations\": string[], \"dates\": string[] }",
    },
    { role: "user", content: text },
  ],
  response_format: { type: "json_object" },
  max_tokens: 500,
})

const data = JSON.parse(response.choices[0].message.content!)
// data.names, data.locations, data.dates
```

For stricter control, use a JSON schema:

```typescript
const response = await llm.chat.completions.create({
  model: "gpt-5.4-nano",
  messages: [{ role: "user", content: "Analyze this product review: ..." }],
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
  model: "gpt-5.4-nano",
  messages: [{ role: "user", content: prompt }],
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

### Multi-turn Conversation

```typescript
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a helpful assistant." },
]

async function chat(userMessage: string): Promise<string> {
  messages.push({ role: "user", content: userMessage })

  const response = await llm.chat.completions.create({
    model: "gpt-5.4-nano",
    messages,
    max_tokens: 1000,
  })

  const reply = response.choices[0].message.content!
  messages.push({ role: "assistant", content: reply })
  return reply
}
```

### Vision (Image Analysis)

Analyze images by passing `image_url` content parts to `gpt-5.4-nano`:

```typescript
const response = await llm.chat.completions.create({
  model: "gpt-5.4-nano",
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
  max_tokens: 1000,
})
const description = response.choices[0].message.content
```

From an uploaded file buffer (e.g., via multer or formidable):

```typescript
const base64 = buffer.toString("base64")
const dataUrl = `data:${mimetype};base64,${base64}`

const response = await llm.chat.completions.create({
  model: "gpt-5.4-nano",
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
  max_tokens: 1000,
})
```

The `detail` parameter controls token usage: `"low"` (fixed 85 tokens, fast), `"high"` (detailed analysis, more tokens), `"auto"` (model decides). Multiple images can be sent as additional `image_url` entries in the content array.

### Audio Transcription

Convert audio to text using the Whisper API:

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

## Guidelines

- **No browser speech APIs** — never use `SpeechRecognition`, `webkitSpeechRecognition`, or any Web Speech API. For all audio/speech/transcription, use the Whisper API (`whisper-1`) on the backend as shown above. Record audio on the frontend with `MediaRecorder`, send the blob to a backend endpoint, and transcribe server-side.
- **Backend only** — never expose `APP_LLM_API_KEY` to the frontend or client-side code
- Use `gpt-5.4-nano` or `anthropic/claude-haiku-4-5` for fast tasks; `gpt-5.4-mini` or `anthropic/claude-sonnet-4-6` for complex generation
- Set reasonable `max_tokens` limits to control cost
- Always wrap AI calls in try/catch with user-friendly error messages
- For streaming responses to the frontend, use Server-Sent Events (SSE)
