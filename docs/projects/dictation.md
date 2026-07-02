# Dictation

> Voice input for the agent chat: a mic in the prompt toolbar that turns speech into draft text. Read this before touching `backend/src/transcription/` or the gateway's provider routing — the transcription call is deliberately pinned to the real OpenAI provider, and that pin is the one thing here that would otherwise break silently.

Typing a substantial prompt — describing a feature, walking through a bug, giving multi-step instructions — is slow, especially for users who think faster than they type or work in a language they type slowly. Dictation lets them speak instead: click the mic in the chat prompt toolbar, talk, click again to stop. The recording is transcribed and the text lands in the prompt draft at the caret — appended to whatever is already typed, never auto-sent — so recognition mistakes get reviewed and corrected like any typed draft. Several dictations can build up one long prompt, and the normal undo gesture discards a bad one. Insertion goes through `document.execCommand('insertText')` on purpose: it fires a real input event, so the embedded chat editor's own store sees the text and native undo keeps working — direct DOM writes would bypass both. If the prompt editor cannot be found at all, the transcript is copied to the clipboard instead of being dropped.

The audio itself is transient input. The browser posts the recording to the opsiforce backend, the backend forwards it to the LLM gateway for transcription and returns the text, and the recording is gone — never stored, never logged, never attached to the message. The one exception is deliberate and client-side: when transcription fails, the browser keeps the recording in memory for a single retry, so a transient error does not cost the user their dictation.

Spoken language is auto-detected by default. A dropdown on the mic lets the user pin an explicit language for short or mixed-language dictations; the choice persists in the browser and a badge on the mic shows when one is set, so a stale setting never surprises. It is deliberately independent of the UI locale — an English UI takes Ukrainian dictation just fine.

## The provider pin

Transcription rides the project's existing LLM plumbing: the backend calls Bifrost's transcription endpoint with the project's **chat virtual key**, so dictation lands on the same per-project budget as chat itself — no new budget surface, no new credentials.

But it cannot ride the chat key's normal routing. The `chat` key serves the coding agent through OpenAI-compatible custom providers ([LLM Gateway](../gateways/llm-gateway.md)), and those providers can never serve audio: their Bifrost config forbids transcription requests (`allowed_requests.transcription: false`), and the subscription upstream behind them exposes no audio endpoints at all. Audio has exactly one place to go — the real OpenAI provider.

So the backend pins it there. The model string sent to Bifrost is **`openai/gpt-4o-mini-transcribe`** (`TRANSCRIPTION_MODEL` in `backend/src/transcription/transcription.constants.ts`): the `openai/` prefix makes Bifrost dispatch directly to the real OpenAI provider, skipping weighted load balancing. That trades away the fallback behaviors weighted routing would give — worthless here anyway, since no other provider can take the request — for one documented contract.

Naming the failure mode so it is findable: if Bifrost upstream ever changes its provider-prefix semantics, every dictation fails with gateway errors while chat keeps working. The fix is a one-line change to that model string — not a silent breakage to reverse-engineer.

The model itself was chosen over `whisper-1` for better word-error-rate at half the price; whisper-1's remaining advantages (subtitle formats, word timestamps) are irrelevant to dictation.

## Availability and degradation

Whether a deployment can transcribe follows from one fact: is the real OpenAI provider configured with a key? The backend answers this automatically by asking Bifrost's admin API (the one it already uses for teams and virtual keys) whether the `openai` provider holds an enabled, non-empty key, caches the answer for a few minutes, and exposes it to the frontend along with the model's supported language list — so the language dropdown and the backend's validation can never drift apart. No per-deployment feature flag to maintain by hand. Until the frontend has that answer, the mic stays disabled rather than inviting a recording that cannot be transcribed.

When the capability is off, the mic renders disabled with a tooltip saying what would enable it — the feature stays visible, so operators know it exists and what it needs. This is exactly the standalone story: the Quickstart's bring-your-own-key option keys the real OpenAI provider (it already holds the key), so dictation works there; the subscription option cannot serve audio, so its mic is disabled with the tooltip pointing at the API-key option. The researched follow-up for subscription-mode voice — a realtime bridge in the codex proxy — is a separate feature, not part of this one.

On a deployment where the capability is on, failures stay loud rather than degrading quietly: a failed transcription raises a toast with the reason (budget exhaustion is called out explicitly as the project's AI budget), the recording is kept for one retry, and a recording with no recognizable speech gets a gentle "nothing recognized" hint instead of a confusing no-op.

## Guardrails

Three limits guard the feature, each against a specific failure: recording auto-stops at five minutes so a forgotten live mic cannot record indefinitely; uploads are capped at 10 MB and rejected early so oversized blobs never reach the gateway; and the gateway call times out after about a minute rather than inheriting the gateway's long default, so a wedged gateway does not wedge dictation. Keep all three when tuning values.

## See also

- [LLM Gateway](../gateways/llm-gateway.md) — the virtual-key and budget model dictation rides on, and the custom-provider routing it deliberately bypasses.
- [Codex Proxy](../gateways/codex-proxy.md) — the subscription upstream that cannot serve audio, and why the standalone subscription path shows a disabled mic.
- Code: backend `backend/src/transcription/` (project-scoped endpoint, the pinned gateway call, the availability probe); frontend `frontend/src/components/dictation-button.tsx` (recording, caret insertion, retry) and `frontend/src/components/dictation-language.tsx` (language override).
