export function turnProgress(busy: boolean, assistant?: {
  finish?: string;
  error?: { type: string; message: string };
  content: ReadonlyArray<{ type: string; text?: string; state?: unknown }>;
}, outcome?: 'succeeded' | 'failed' | 'interrupted') {
  if (!busy && outcome === 'interrupted') return '本轮已停止。'
  if (!assistant && !busy && outcome === 'failed') return '本轮未完成，请查看上方错误信息。'
  if (!assistant) return ''
  if (assistant.error?.type === 'aborted') return '本轮已停止。'
  if (assistant.error && !busy) return `本轮未完成：${assistant.error.message}`
  if (assistant.finish === 'length') return busy ? '输出达到上限，正在续接…' : '输出达到上限，本轮任务尚未完成。请调整输出预算或缩小任务后继续。'
  if (!busy && outcome === 'failed') return '本轮未完成，请查看上方错误信息。'
  if (!busy) {
    if (assistant.finish === 'stop' && assistant.content.some(p => p.type === 'text' && p.text?.trim())) return '本轮已完成'
    if (assistant.finish === 'stop') return '模型没有提供最终答复，本轮任务尚未完成。'
    return ''
  }
  if (assistant.content.some(p => p.type === 'tool' && typeof p.state === 'object' && p.state !== null && 'status' in p.state && p.state.status === 'running')) return '正在执行工具…'
  const last = assistant.content.at(-1)
  return last?.type === 'reasoning' ? '正在思考…' : '正在生成答复…'
}
