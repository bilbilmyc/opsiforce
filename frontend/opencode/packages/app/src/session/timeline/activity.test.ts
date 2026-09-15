import { expect, test } from "bun:test"
import { createTimelineProjection, TimelineRow } from "@opencode-ai/session-ui/timeline/projection"
import { timelinePresets } from "@opencode-ai/session-ui/timeline/detail"
import { groupActivity, activityCounts } from "./activity"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
const detail = { ...timelinePresets.find(p => p.id === "detailed")!.value, thinking: { placement: "separate" as const, details: "expanded" as const } }
function project(messages: SessionMessageInfo[], busy = false) {
  const source = createTimelineProjection({ sessionMessages: messages, status: { type: busy ? "busy" : "idle" }, reasoningMode: "full", timelineDetail: detail })
  return { source, rows: groupActivity(source.rows, source.messageByID) }
}
const user = { id: "msg_user", type: "user" as const, text: "Question", time: { created: 1 } }
const assistant = (id: string, content: any[], completed?: number): SessionMessageInfo => ({ id, type: "assistant", agent: "build", model: { id: "m", providerID: "p" }, time: { created: 2, completed }, content })

test("a whole process folds together while trailing answer parts remain outside", () => {
  const { rows, source } = project([user, assistant("msg_a", [{ type: "reasoning", text: "first" }, { type: "text", text: "Checking..." }], 3), assistant("msg_b", [{ type: "reasoning", text: "second" }, { type: "text", text: "Answer" }, { type: "text", text: "More answer" }], 5)])
  expect(rows.map(r => r._tag)).toEqual(["UserMessage", "Activity", "AssistantPart", "AssistantPart"])
  const activity = rows[1] as TimelineRow.Activity
  expect(activityCounts(activity.rows, source.messageByID).thoughts).toBe(2)
  expect(activity.rows.some(r => r._tag === "AssistantPart" && r.group.type === "part" && r.group.ref.partID === "msg_a:text:0")).toBe(true)
})
test("activity identity survives active reasoning becoming completed", () => {
  const running = project([user, assistant("msg_a", [{ type: "reasoning", text: "" }])], true)
  const finished = project([user, assistant("msg_a", [{ type: "reasoning", text: "done" }, { type: "text", text: "Answer" }], 5)])
  expect(TimelineRow.key(running.rows[1])).toBe(TimelineRow.key(finished.rows[1]))
})
test("plain responses are never collapsed and turns remain separate", () => {
  const { rows } = project([user, assistant("msg_a", [{ type: "text", text: "Answer" }], 3), { ...user, id: "msg_user2" }, assistant("msg_b", [{ type: "reasoning", text: "Thought" }, { type: "text", text: "Second answer" }], 5)])
  expect(rows.filter(r => r._tag === "Activity").map(r => r.userMessageID)).toEqual(["msg_user2"])
  expect(rows.filter(r => r._tag === "AssistantPart")).toHaveLength(2)
})
test("errors and retry rows remain outside a closed process", () => {
  const thinking = new TimelineRow.Thinking({ userMessageID: "u", ref: { messageID: "a", partID: "a:reasoning:0" } })
  const error = new TimelineRow.Error({ userMessageID: "u", text: "Request failed" })
  const retry = new TimelineRow.Retry({ userMessageID: "u" })
  expect(groupActivity([thinking, error, retry], new Map()).map(r => r._tag)).toEqual(["Activity", "Error", "Retry"])
})

test("background completion notices stay inside the same process", () => {
  const messages = [user, assistant("msg_a", [{ type: "reasoning", text: "first" }], 3), { id: "msg_notice", type: "synthetic" as const, text: "Background complete", metadata: { source: "shell", state: "completed" }, time: { created: 4 } }, assistant("msg_b", [{ type: "reasoning", text: "second" }, { type: "text", text: "Answer" }], 5)]
  const { rows } = project(messages)
  expect(rows.filter(r => r._tag === "Activity")).toHaveLength(1)
})
test("loading older history keeps the process disclosure identity", () => {
  const tail = assistant("msg_tail", [{ type: "reasoning", text: "last" }, { type: "text", text: "Answer" }], 5)
  const partial = project([tail])
  const full = project([user, assistant("msg_first", [{ type: "reasoning", text: "earlier" }], 3), tail])
  const merged = groupActivity(full.source.rows, full.source.messageByID, partial.rows)
  expect(merged.find(r => r._tag === "Activity")?.id).toBe(partial.rows.find(r => r._tag === "Activity")?.id)
})
