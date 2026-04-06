---
name: llm-api
description: Use the OpenAI-compatible LLM API (APP_LLM_API_KEY) to add AI features — chat completions, structured output, streaming. Trigger when building AI-powered features, calling GPT models, or generating text.
---

# AI API Integration

A dedicated OpenAI-compatible API is available for the apps you build, via these environment variables:

- `APP_LLM_API_KEY` — API key for the app backend
- `APP_LLM_BASE_URL` — Base URL for the API endpoint

**Important:** Use `APP_LLM_API_KEY` / `APP_LLM_BASE_URL` in app code. Do NOT use `OPENAI_API_KEY` / `OPENAI_BASE_URL` — those are reserved for the coding agent.

## Setup (OpenAI SDK)

Install:
```bash
npm install openai
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

| Model | Best for | Speed | Cost |
|-------|----------|-------|------|
| `gpt-4.1` | Fast tasks, classification, extraction | Fast | Low |
| `gpt-5.4-mini` | Complex generation, reasoning | Medium | Medium |

## Common Patterns

### Text Generation

```typescript
const response = await llm.chat.completions.create({
  model: "gpt-4.1",
  messages: [{ role: "user", content: prompt }],
  max_tokens: 1000,
})
const text = response.choices[0].message.content
```

### Structured Output (JSON)

Return typed JSON using `response_format`:

```typescript
const response = await llm.chat.completions.create({
  model: "gpt-4.1",
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
  model: "gpt-4.1",
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
  model: "gpt-4.1",
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
    model: "gpt-4.1",
    messages,
    max_tokens: 1000,
  })

  const reply = response.choices[0].message.content!
  messages.push({ role: "assistant", content: reply })
  return reply
}
```

## Guidelines

- **Backend only** — never expose `APP_LLM_API_KEY` to the frontend or client-side code
- Use `gpt-4.1` for fast tasks; `gpt-5.4-mini` for complex generation
- Set reasonable `max_tokens` limits to control cost
- Always wrap AI calls in try/catch with user-friendly error messages
- For streaming responses to the frontend, use Server-Sent Events (SSE)
