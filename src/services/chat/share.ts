import { saveAndroidFile, shareAndroidText } from '../android.js'
import { formatSharedChat } from '../mobileTools.js'
import { translate } from '../../i18n/index.js'
import { showToast } from '../../components/base/toastState.js'
import { getVisibleMessages } from './branches.js'
import { loadSession } from './db.js'
import { getReplyText } from './reply.js'
import { useChatStore } from './store.js'

async function readShareableSession(id: string) {
  const { sessionCache, importingHistory } = useChatStore.getState()
  if (importingHistory) {
    return undefined
  }
  const session =
    (Object.hasOwn(sessionCache, id) ? sessionCache[id] : undefined) ?? (await loadSession(id))
  return useChatStore.getState().importingHistory ? undefined : session
}

export async function shareSession(id: string) {
  try {
    const session = await readShareableSession(id)
    if (!session) {
      return
    }

    const text = formatSharedChat(
      session.title || translate('untitledChat'),
      getVisibleMessages(session).map((message) =>
        message.role === 'user'
          ? { label: translate('shareChatUser'), text: message.content }
          : { label: translate('shareChatAssistant'), text: getReplyText(message) }
      )
    )
    if (text === null) {
      showToast({ key: 'shareChatTooLong', type: 'error' })
      return
    }
    await shareAndroidText(text)
  } catch {
    showToast({ key: 'shareChatFailed', type: 'error' })
  }
}

const singleLine = (text: string) => text.replace(/\s+/g, ' ').trim()

const markdownLabel = (text: string) => singleLine(text).replace(/[\\`*_[\]<>#]/g, '\\$&')

export async function exportSessionMarkdown(id: string) {
  try {
    const session = await readShareableSession(id)
    if (!session) {
      return
    }
    const title = singleLine(session.title) || translate('untitledChat')
    const turns = getVisibleMessages(session).map((message) => {
      if (message.role === 'assistant') {
        return [`## ${translate('shareChatAssistant')}`, getReplyText(message)]
          .filter(Boolean)
          .join('\n\n')
      }
      const files = message.files.map((file) => `- ${markdownLabel(file.name)}`)
      return [
        `## ${translate('shareChatUser')}`,
        message.content,
        files.length ? `**${translate('chatExportAttachments')}**\n\n${files.join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    })
    const body = [`# ${markdownLabel(title)}`, ...turns].join('\n\n') + '\n'
    const name =
      title
        .replace(/[<>:"\\/|?*]/g, '_')
        .slice(0, 100)
        .trim() || 'DS Chat'
    await saveAndroidFile(
      `${name}.md`,
      new Blob([body], { type: 'text/markdown' }),
      'text/markdown'
    )
  } catch {
    showToast({ key: 'chatExportFailed', type: 'error' })
  }
}
