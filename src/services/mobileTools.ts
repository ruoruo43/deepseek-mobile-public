import type { ChatModel } from './api/types.js'

export type AvailableModel = { id: ChatModel; images: boolean }

export const officialModels: AvailableModel[] = [
  { id: 'deepseek-flash', images: true },
  { id: 'deepseek-v4-pro', images: false },
]

export function parseAvailableModels(payload: unknown): AvailableModel[] {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    return []
  }
  const data: unknown = payload.data
  if (!Array.isArray(data)) {
    return []
  }

  return officialModels.flatMap((model) => {
    const entry = data.find(
      (item): item is { id: ChatModel; input_modalities?: unknown } =>
        typeof item === 'object' && item !== null && item.id === model.id
    )
    if (!entry) {
      return []
    }
    return [
      {
        id: model.id,
        images:
          model.images &&
          (!Array.isArray(entry.input_modalities) || entry.input_modalities.includes('image')),
      },
    ]
  })
}

export function buildSystemPrompt(base: string, instructions: string): string {
  const custom = instructions.trim()
  return custom ? `${base}\n\n${custom}` : base
}

const searchable = (text: string) => text.normalize('NFKC').trim().toLowerCase()

export function matchesHistory(title: string, messages: Iterable<string>, query: string): boolean {
  const term = searchable(query)
  if (searchable(title).includes(term)) {
    return true
  }
  for (const message of messages) {
    if (searchable(message).includes(term)) {
      return true
    }
  }
  return false
}

export function togglePinnedSession(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [id, ...ids]
}

export const shareCharacterLimit = 90_000

export function formatSharedChat(
  title: string,
  messages: { label: string; text: string }[]
): string | null {
  const parts = [`# ${title.trim()}`]
  let length = parts[0].length
  for (const { label, text } of messages) {
    if (!text.trim()) {
      continue
    }
    const part = `## ${label}\n${text.trim()}`
    length += 2 + part.length
    if (length > shareCharacterLimit) {
      return null
    }
    parts.push(part)
  }
  return parts.join('\n\n')
}
