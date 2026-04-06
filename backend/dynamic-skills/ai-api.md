---
name: ai-api
description: Use the AI API available in your environment to add AI-powered features to apps you build.
---

# AI API Integration

An OpenAI-compatible API key is available via environment variables (OPENAI_API_KEY and OPENAI_BASE_URL).

## Setup

In the app backend:
```typescript
import OpenAI from "openai"

const openai = new OpenAI()
```

## Guidelines
- Backend only — never expose the key to the frontend
- Use gpt-4.1 for fast tasks, gpt-5.3-codex for complex generation
- Set reasonable max_tokens limits
- Wrap AI calls in try/catch
