import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState, type MouseEventHandler } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import type { Session } from '../../services/chat/types.js'
import { IconChevronDownOutline14, IconChevronRightOutline14 } from '../base/icons.js'
import { Modal } from '../base/Modal.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './SessionView.module.css'

/** 会话页：标题栏（移动端为顶栏）+ 消息列表，输入框吸底 */
export const SessionView = ({
  session,
  streaming,
  siderCollapsed,
}: {
  session: Session
  streaming: boolean
  siderCollapsed: boolean
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const title = session.title || t('untitledChat')
  const messages = getVisibleMessages(session)
  const questions = messages.filter((message) => message.role === 'user')
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [jump, setJump] = useState<{ messageId: string } | null>(null)
  const outlineTrigger = useRef<HTMLButtonElement | null>(null)

  const openOutline: MouseEventHandler<HTMLButtonElement> = (event) => {
    outlineTrigger.current = event.currentTarget
    setOutlineOpen(true)
  }

  const closeOutline = useCallback(() => {
    setOutlineOpen(false)
    outlineTrigger.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!outlineOpen) {
      return
    }
    const closeOnAndroidBack = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      closeOutline()
    }
    window.addEventListener('ds-android-back', closeOnAndroidBack, true)
    return () => window.removeEventListener('ds-android-back', closeOnAndroidBack, true)
  }, [outlineOpen, closeOutline])

  return (
    <div className={styles.view}>
      {isMobile ? (
        <MobileHeader
          title={title}
          onOpenOutline={questions.length > 1 ? openOutline : undefined}
        />
      ) : (
        <div className={styles.header}>
          {questions.length > 1 ? (
            <button
              type="button"
              className={clsx(
                styles.title,
                styles.outlineTitle,
                siderCollapsed && styles.withCollapsedSider
              )}
              aria-label={t('chatOutline')}
              aria-haspopup="dialog"
              onClick={openOutline}
            >
              <span>{title}</span>
              <IconChevronDownOutline14 />
            </button>
          ) : (
            <div className={clsx(styles.title, siderCollapsed && styles.withCollapsedSider)}>
              {title}
            </div>
          )}
        </div>
      )}
      <MessageList
        session={session}
        messages={messages}
        streaming={streaming}
        jump={jump}
        footer={
          <div className={styles.inputContainer}>
            <ChatInput sessionId={session.id} />
            <div className={styles.caveat}>{t('contentCaveat')}</div>
          </div>
        }
      />
      {outlineOpen && (
        <Modal
          title={t('chatOutline')}
          closable
          onClose={closeOutline}
          mainClassName={styles.outline}
        >
          <ul className={styles.questionList}>
            {questions.map((question, index) => (
              <li key={question.id}>
                <button
                  type="button"
                  autoFocus={index === 0}
                  onClick={() => {
                    closeOutline()
                    setJump({ messageId: question.id })
                  }}
                >
                  <span>
                    {question.content.trim() || question.files[0]?.name || t('untitledChat')}
                  </span>
                  <IconChevronRightOutline14 />
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  )
}
