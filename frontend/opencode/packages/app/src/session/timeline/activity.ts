import { Timeline, TimelineRow } from "@opencode-ai/session-ui/timeline/projection"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"

/** Keep the latest answer and actionable errors outside the process disclosure. */
export function groupActivity(rows: TimelineRow.TimelineRow[], messages: Map<string, SessionMessageInfo>, previous: TimelineRow.TimelineRow[] = []) {
  const finalParts = new Set<string>()
  const lastAssistant = new Map<string, string>()
  for (const row of rows) {
    if (row._tag === "AssistantPart") {
      for (const ref of row.group.type === "part" ? [row.group.ref] : row.group.refs)
        if (messages.get(ref.messageID)?.type === "assistant") lastAssistant.set(row.userMessageID, ref.messageID)
    }
    if (row._tag === "Thinking") lastAssistant.set(row.userMessageID, row.ref.messageID)
  }
  for (const id of lastAssistant.values()) {
    const message = messages.get(id)
    if (message?.type !== "assistant") continue
    for (const entry of Timeline.contentEntries(message).toReversed()) {
      if (entry.content.type !== "text") break
      finalParts.add(entry.id)
    }
  }
  const result: TimelineRow.TimelineRow[] = []
  const segments = new Map<string, number>()
  const used = new Set<string>()
  let pending: TimelineRow.TimelineRow[] = []
  const flush = () => {
    if (!pending.length) return
    const userMessageID = pending[0].userMessageID
    const index = segments.get(userMessageID) ?? 0
    segments.set(userMessageID, index + 1)
    const keys = new Set(pending.map(TimelineRow.key))
    const prior = previous.find(row => row._tag === "Activity" && !used.has(row.id) && row.rows.some(child => keys.has(TimelineRow.key(child))))
    let id = prior?._tag === "Activity" ? prior.id : `activity:${userMessageID}:${index}`
    let suffix = index
    while (used.has(id)) id = `activity:${userMessageID}:${++suffix}`
    used.add(id)
    result.push(new TimelineRow.Activity({ userMessageID, id, rows: pending }))
    pending = []
  }
  for (const row of rows) {
    const activity = row._tag === "Thinking" || (row._tag === "AssistantPart" &&
      (pending.length > 0 || (row.group.type === "part" ? [row.group.ref] : row.group.refs).some(ref => messages.get(ref.messageID)?.type === "assistant")) &&
      !(row.group.type === "part" && finalParts.has(row.group.ref.partID)))
    if (!activity || (pending.length && pending[0].userMessageID !== row.userMessageID)) flush()
    if (activity) pending.push(row)
    else result.push(row)
  }
  flush()
  return result
}

export function activityCounts(rows: TimelineRow.TimelineRow[], messages: Map<string, SessionMessageInfo>) {
  const seen = new Set<string>()
  let thoughts = 0, tools = 0
  for (const row of rows) {
    const refs = row._tag === "Thinking" ? [row.ref] : row._tag === "AssistantPart"
      ? row.group.type === "part" ? [row.group.ref] : row.group.refs : []
    for (const ref of refs) {
      if (seen.has(ref.partID)) continue
      seen.add(ref.partID)
      const content = Timeline.resolveContent(messages.get(ref.messageID), ref.partID)
      if (content?.type === "reasoning") thoughts++
      if (content?.type === "tool") tools++
    }
  }
  return { thoughts, tools }
}
