import { shareAndroidText } from '../android.js'
import { formatSharedChat } from '../mobileTools.js'
import { translate } from '../../i18n/index.js'
import { showToast } from '../../components/base/toastState.js'
import { getVisibleMessages } from './branches.js'
import { loadSession } from './db.js'
import { getReplyText } from './reply.js'
import { useChatStore } from './store.js'

export async function shareSession(id: string) {
  try {
    const { sessionCache, importingHistory } = useChatStore.getState()
    if (importingHistory) {
      return
    }
    const session =
      (Object.hasOwn(sessionCache, id) ? sessionCache[id] : undefined) ?? (await loadSession(id))
    if (!session || useChatStore.getState().importingHistory) {
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
