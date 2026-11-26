import clsx from 'clsx'
import { useRef } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { androidApp } from '../../services/android.js'
import { EMPTY_DRAFT, setDraftText, useDrafts } from '../../services/chat/drafts.js'
import {
  IconChevronDownOutline14,
  IconDataOutline16,
  IconEditOutline16,
  IconSearchOutline16,
} from '../base/icons.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

/** 新对话：移动端把快捷提问和输入框放在底部。 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const empty = useDrafts((state) => !(state.drafts.get(null) ?? EMPTY_DRAFT).text.trim())
  const composer = useRef<HTMLDivElement>(null)
  const shortcuts = [
    { label: 'quickSummarize', text: 'quickSummarizeText', icon: <IconDataOutline16 /> },
    { label: 'quickPolish', text: 'quickPolishText', icon: <IconEditOutline16 /> },
    { label: 'quickExplain', text: 'quickExplainText', icon: <IconSearchOutline16 /> },
  ] as const
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div ref={composer} className={clsx(styles.welcome, androidApp && styles.androidWelcome)}>
        {androidApp ? (
          <div className={styles.promptArea}>
            {empty ? (
              <details
                className={styles.promptMenu}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.currentTarget.open = false
                    event.currentTarget.querySelector('summary')?.focus()
                  }
                }}
              >
                <summary>
                  {t('quickPrompts')}
                  <IconChevronDownOutline14 />
                </summary>
                <div className={styles.shortcuts}>
                  {shortcuts.map(({ label, text, icon }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setDraftText(null, t(text))
                        composer.current?.querySelector('textarea')?.focus({ preventScroll: true })
                      }}
                    >
                      <span aria-hidden="true">{icon}</span>
                      {t(label)}
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : (
          <div className={styles.greeting}>{t('welcomeMessageChat250808')}</div>
        )}
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}
