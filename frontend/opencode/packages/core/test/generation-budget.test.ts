import { expect, test } from 'bun:test'
import { generationBudget } from '../src/session/generation-budget'

test('budgets follow the selected model rather than a global fixed ceiling', () => {
  expect(generationBudget({ context: 100000, output: 64000 }, { ready: true, outputBudget: 32000, reasoningReserve: 0 }, 5000)).toBe(32000)
  expect(generationBudget({ context: 16000, output: 4000 }, { ready: true, outputBudget: 32000, reasoningReserve: 0 }, 5000)).toBe(4000)
})
test('input ceiling and separate reasoning reserve constrain available output', () => {
  expect(generationBudget({ context: 16000, output: 12000 }, { ready: true, outputBudget: 12000, reasoningReserve: 2000 }, 10000)).toBe(3200)
  expect(() => generationBudget({ context: 16000, output: 4000, input: 8000 }, { ready: true, outputBudget: 4000, reasoningReserve: 0 }, 9000)).toThrow()
})
test('unknown models and exhausted context do not send a guessed request', () => {
  expect(() => generationBudget({ context: 0, output: 0 }, { ready: false, outputBudget: 0, reasoningReserve: 0 }, 50)).toThrow('能力')
  expect(() => generationBudget({ context: 8000, output: 4000 }, { ready: true, outputBudget: 4000, reasoningReserve: 0 }, 8000)).toThrow('上下文')
})
