// OPSIFORCE LOCAL PATCH - do not drop when re-vendoring opencode (tree is upstream 1.3.2).
// Backport of the upstream fix for the 48-bit message-ID wrap of 2026-08-14T11:19:55Z, after which
// newly created IDs sort before ~2 years of prior history.
// Upstream: anomalyco/opencode PR #41001 (first released in v1.18.15).
// Changed here: new file; messageKey/compareMessages copied verbatim from upstream.
import type { Message } from "@opencode-ai/sdk/v2/client"

export function compareMessages(a: Pick<Message, "id" | "time">, b: Pick<Message, "id" | "time">) {
  const left = messageKey(a)
  const right = messageKey(b)
  return left < right ? -1 : left > right ? 1 : 0
}

export const messageKey = (message: Pick<Message, "id" | "time">) => message.time.created + message.id
