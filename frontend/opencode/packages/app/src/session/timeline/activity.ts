import { Timeline, TimelineRow } from "@opencode-ai/session-ui/timeline/projection"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"

/** Keep every formal text output and actionable error outside process disclosures. */
export function groupActivity(rows: TimelineRow.TimelineRow[], messages: Map<string, SessionMessageInfo>, previous: TimelineRow.TimelineRow[] = []) {
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
      !(row.group.type === "part" && Timeline.resolveContent(messages.get(row.group.ref.messageID), row.group.ref.partID)?.type === "text"))
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
