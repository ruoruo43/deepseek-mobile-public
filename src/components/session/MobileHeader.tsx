import type { MouseEventHandler } from 'react'
import { IconChevronDownOutline14, IconMenuOutline20, IconNewChatOutline20 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import { ModelSelect } from '../settings/ConversationSettings.js'
import styles from './MobileHeader.module.css'

/** 移动端顶栏：左侧菜单打开侧边栏；会话页再显示标题与开启新对话 */
export const MobileHeader = ({
  title,
  onOpenOutline,
}: {
  title?: string
  onOpenOutline?: MouseEventHandler<HTMLButtonElement>
}) => {
  const t = useTranslate()
  return (
    <header className={styles.header}>
      <IconButton
        className={styles.chromeButton}
        size="xl"
        tone="primary"
        icon={<IconMenuOutline20 />}
        aria-label={t('expandSiderbarButton')}
        onClick={openMobileSider}
      />
      {onOpenOutline ? (
        <button
          type="button"
          className={`${styles.title} ${styles.titleButton}`}
          aria-label={t('chatOutline')}
          aria-haspopup="dialog"
          onClick={onOpenOutline}
        >
          <span>{title}</span>
          <IconChevronDownOutline14 />
        </button>
      ) : (
        <div className={styles.title}>{title ?? t('appName')}</div>
      )}
      <div className={styles.models}>
        <ModelSelect />
      </div>
      {title !== undefined ? (
        <IconButton
          className={styles.chromeButton}
          size="xl"
          tone="primary"
          icon={<IconNewChatOutline20 />}
          aria-label={t('newChat')}
          onClick={newChat}
        />
      ) : null}
    </header>
  )
}
