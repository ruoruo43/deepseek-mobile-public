import clsx from 'clsx'
import { memo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconDownloadOutline16,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconLinkOutline14,
  IconTrashOutline16,
} from '../base/icons.js'
import { renameSession, selectSession } from '../../services/chat/store.js'
import { exportSessionMarkdown, shareSession } from '../../services/chat/share.js'
import { androidApp } from '../../services/android.js'
import { togglePinnedSession } from '../../services/mobileTools.js'
import { setPinnedSessionIds, useSettings } from '../../services/settings.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './SessionItem.module.css'

export const SessionItem = memo(function SessionItem({
  session,
  active,
  pinned,
  onDelete,
}: {
  session: SessionSummary
  active: boolean
  pinned: boolean
  onDelete: () => void
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const displayTitle = session.title || t('untitledChat')

  if (editing) {
    const finish = (title: string) => {
      setEditing(false)
      if (title.trim() && title.trim() !== displayTitle) {
        renameSession(session.id, title.trim())
      }
    }
    return (
      <input
        className={styles.renameInput}
        defaultValue={displayTitle}
        autoFocus
        onFocus={(event) => event.target.select()}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            finish(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <div
      className={clsx(styles.item, active && styles.active)}
      aria-current={active ? 'page' : undefined}
      onClick={() => {
        selectSession(session.id)
        closeMobileSider()
      }}
    >
      <div className={styles.title}>{displayTitle}</div>
      <div className={styles.action} onClick={(event) => event.stopPropagation()}>
        <Menu
          options={[
            {
              key: 'pin',
              label: t(pinned ? 'unpinChat' : 'pinChat'),
              icon: <span aria-hidden="true">⌑</span>,
              onSelect: () => {
                setPinnedSessionIds(
                  togglePinnedSession(useSettings.getState().pinnedSessionIds, session.id)
                )
              },
            },
            ...(androidApp
              ? [
                  {
                    key: 'share',
                    label: t('shareChat'),
                    icon: <IconLinkOutline14 />,
                    onSelect: () => void shareSession(session.id),
                  },
                  {
                    key: 'export-markdown',
                    label: t('chatExportMarkdown'),
                    icon: <IconDownloadOutline16 />,
                    onSelect: () => void exportSessionMarkdown(session.id),
                  },
                ]
              : []),
            {
              key: 'rename',
              label: t('sessionItemMenuRenameOption'),
              icon: <IconEditOutline16 />,
              onSelect: () => setEditing(true),
            },
            {
              key: 'delete',
              label: t('delete'),
              icon: <IconTrashOutline16 />,
              danger: true,
              onSelect: onDelete,
            },
          ]}
        >
          {({ toggle }) => (
            <IconButton icon={<IconEllipsisOutline16 />} aria-label={t('more')} onClick={toggle} />
          )}
        </Menu>
      </div>
    </div>
  )
})
