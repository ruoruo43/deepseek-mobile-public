import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSystemPrompt,
  formatSharedChat,
  matchesHistory,
  parseAvailableModels,
  togglePinnedSession,
} from '../src/services/mobileTools.ts'

test('keeps supported official models and recognizes image input metadata', () => {
  assert.deepEqual(
    parseAvailableModels({
      data: [
        { id: 'unrecognized-model', input_modalities: ['image'] },
        { id: 'deepseek-v4-pro', input_modalities: ['text'] },
        { id: 'deepseek-flash', input_modalities: ['text', 'image'] },
        { id: 'deepseek-flash' },
      ],
    }),
    [
      { id: 'deepseek-flash', images: true },
      { id: 'deepseek-v4-pro', images: false },
    ]
  )
  assert.deepEqual(parseAvailableModels({ data: [null, { id: 'unknown' }] }), [])
})

test('applies only a nonempty personal instruction to the existing system prompt', () => {
  assert.equal(buildSystemPrompt('基础指令', '  使用简体中文。 '), '基础指令\n\n使用简体中文。')
  assert.equal(buildSystemPrompt('基础指令', '  '), '基础指令')
})

test('finds history text without requiring case or width to match', () => {
  assert.equal(matchesHistory('排产审核', ['本周使用 ABC-12'], '  abc-１２ '), true)
  assert.equal(matchesHistory('排产审核', ['本周使用 ABC-12'], '审核'), true)
  assert.equal(matchesHistory('排产审核', ['本周使用 ABC-12'], '未记录'), false)
})

test('toggles a pinned session without changing the order of other pins', () => {
  assert.deepEqual(togglePinnedSession(['second', 'first'], 'first'), ['second'])
  assert.deepEqual(togglePinnedSession(['second'], 'first'), ['first', 'second'])
})

test('formats only the chat text selected for sharing and refuses overlong text', () => {
  assert.equal(
    formatSharedChat('排产记录', [
      { label: '我', text: '汇总进度' },
      { label: 'DeepSeek', text: '周二完成。' },
      { label: 'DeepSeek', text: ' ' },
    ]),
    '# 排产记录\n\n## 我\n汇总进度\n\n## DeepSeek\n周二完成。'
  )
  assert.equal(formatSharedChat('超长对话', [{ label: '我', text: '中'.repeat(90_000) }]), null)
})
