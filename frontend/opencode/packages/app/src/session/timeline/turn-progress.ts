export function turnProgress(busy: boolean, assistant?: {
  finish?: string;
  error?: { type: string; message: string };
  content: ReadonlyArray<{ type: string; text?: string; state?: unknown }>;
}, outcome?: 'succeeded' | 'failed' | 'interrupted', locale = 'zh') {
  const text = (zh: string, en: string) => locale.startsWith('zh') ? zh : en
  if (!busy && outcome === 'interrupted') return text("本轮已停止。", "This turn was stopped.")
  if (!assistant && !busy && outcome === 'failed') return text("本轮未完成，请查看上方错误信息。", "This turn did not complete. See the error above.")
  if (!assistant) return ''
  if (assistant.error?.type === 'aborted') return text("本轮已停止。", "This turn was stopped.")
  if (assistant.error && !busy) return text(`本轮未完成：${assistant.error.message}`, `This turn did not complete: ${assistant.error.message}`)
  if (assistant.finish === 'length') return busy ? text("输出达到上限，正在续接…", "Output limit reached. Continuing\u2026") : text("输出达到上限，本轮任务尚未完成。请调整输出预算或缩小任务后继续。", "Output limit reached before the task finished. Increase the output budget or narrow the task to continue.")
  if (!busy && outcome === 'failed') return text("本轮未完成，请查看上方错误信息。", "This turn did not complete. See the error above.")
  if (!busy) {
    if (assistant.finish === 'stop' && assistant.content.some(p => p.type === 'text' && p.text?.trim())) return text("本轮已完成", "This turn is complete")
    if (assistant.finish === 'stop') return text("模型没有提供最终答复，本轮任务尚未完成。", "The model did not provide a final response. This turn is not complete.")
    return ''
  }
  if (assistant.content.some(p => p.type === 'tool' && typeof p.state === 'object' && p.state !== null && 'status' in p.state && p.state.status === 'running')) return text("正在执行工具…", "Running tools\u2026")
  const last = assistant.content.at(-1)
  return last?.type === 'reasoning' ? text("正在思考…", "Thinking\u2026") : text("正在生成答复…", "Generating a response\u2026")
}
