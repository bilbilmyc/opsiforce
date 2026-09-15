import { expect, test } from 'bun:test'
import { turnProgress } from './turn-progress'
test('collapsed reasoning cannot hide length truncation', () => {
  expect(turnProgress(false, { finish: 'length', content: [{ type: 'reasoning' }] })).toContain('尚未完成')
  expect(turnProgress(true, { finish: 'length', content: [] })).toContain('续接')
})
test('only a final answer becomes completed; cancellation stays stopped', () => {
  expect(turnProgress(false, { finish: 'stop', content: [{ type: 'reasoning' }] })).toContain('尚未完成')
  expect(turnProgress(false, { finish: 'stop', content: [{ type: 'text', text: 'done' }] })).toBe('本轮已完成')
  expect(turnProgress(false, { error: { type: 'aborted', message: 'stopped' }, content: [] })).toContain('已停止')
})

test('execution outcome wins over an earlier completed answer', () => {
  const answer = { finish: 'stop', content: [{ type: 'text', text: 'earlier answer' }] }
  expect(turnProgress(false, answer, 'failed')).toContain('未完成')
  expect(turnProgress(false, { finish: 'length', content: [] }, 'interrupted')).toContain('已停止')
  expect(turnProgress(false, undefined, 'failed')).toContain('未完成')
})
