import { createMemo, createUniqueId, For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { TimelineRow } from "@opencode-ai/session-ui/timeline/projection"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import { activityCounts } from "./activity"
import "./activity-panel.css"

export function ActivityPanel(props: {
  rows: TimelineRow.TimelineRow[]
  messages: Map<string, SessionMessageInfo>
  running: boolean
  open: boolean
  centered?: boolean
  onToggle: () => void
  render: (row: TimelineRow.TimelineRow) => JSX.Element
}) {
  const language = useLanguage()
  const id = createUniqueId()
  const counts = createMemo(() => activityCounts(props.rows, props.messages))
  // Keep mounted row identity stable while live deltas update the source objects.
  const keys = createMemo(() => props.rows.map(TimelineRow.key))
  const byKey = createMemo(() => new Map(props.rows.map(row => [TimelineRow.key(row), row])))
  function Row(p: { rowKey: string }) {
    const initial = byKey().get(p.rowKey)!
    return <>{props.render(byKey().get(p.rowKey) ?? initial)}</>
  }
  return (
    <div classList={{ "min-w-0 w-full px-4 md:px-5 py-3": true, "md:max-w-[1000px] md:mx-auto": props.centered }}>
      <section data-component="turn-activity" data-open={props.open}>
        <button type="button" data-slot="activity-toggle" aria-expanded={props.open} aria-controls={id} onClick={props.onToggle}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" style={{ transform: props.open ? "rotate(90deg)" : undefined, "flex-shrink": 0 }}><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
          <span data-slot="activity-title">{language.t("session.activity.title")}</span>
          <span data-slot="activity-state" data-running={props.running}>{language.t(props.running ? "session.activity.running" : "session.activity.finished")}</span>
          <span data-slot="activity-counts">{language.t("session.activity.counts", counts())}</span>
          <span data-slot="activity-action">{language.t(props.open ? "session.activity.collapse" : "session.activity.expand")}</span>
        </button>
        <Show when={props.open}>
          <div data-slot="activity-hint">{language.t("session.activity.scrollHint")}</div>
          <div id={id} data-slot="activity-scroll" role="region" aria-label={language.t("session.activity.title")} tabIndex={0}>
            <For each={keys()}>{key => <Row rowKey={key} />}</For>
          </div>
        </Show>
      </section>
    </div>
  )
}
