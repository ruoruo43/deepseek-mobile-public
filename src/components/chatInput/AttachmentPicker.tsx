import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { androidApp } from '../../services/android.js'
import { ACCEPT } from '../../services/attachments.js'
import { canAttachImages, useSettings } from '../../services/settings.js'
import { IconButton } from '../base/IconButton.js'
import {
  IconBrowseOutline16,
  IconChevronRightOutline14,
  IconPaperclipOutline16,
} from '../base/icons.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { ImageTextDialog } from './ImageTextDialog.js'
import styles from './AttachmentPicker.module.css'

function CameraIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

function PhotosIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m4 16 5-4.5 4.5 4 2.5-2.5 4 3.5" />
      <circle cx="14.8" cy="8.7" r="1.15" />
    </svg>
  )
}

export function AttachmentPicker({
  disabled,
  onFiles,
  onInsertText,
}: {
  disabled: boolean
  onFiles: (files: File[]) => void
  onInsertText: (text: string) => void
}) {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [imageTextOpen, setImageTextOpen] = useState(false)
  const imagesAllowed = useSettings(canAttachImages)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const files = useRef<HTMLInputElement>(null)
  const photos = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!androidApp) {
      return
    }
    const onCameraFailed = () => showToast({ key: 'cameraUnavailable', type: 'error' })
    window.addEventListener('ds-android-camera-failed', onCameraFailed)
    return () => window.removeEventListener('ds-android-camera-failed', onCameraFailed)
  }, [])

  const close = () => {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }
  const pick = (input: HTMLInputElement | null) => {
    close()
    input?.click()
  }
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    onFiles(Array.from(input.files ?? []))
    input.value = ''
  }

  return (
    <>
      <IconButton
        size="m"
        tone="primary"
        className={androidApp ? styles.trigger : undefined}
        icon={<IconPaperclipOutline16 />}
        tooltip={t(androidApp ? 'addAttachment' : 'uploadFile')}
        aria-haspopup={androidApp ? 'dialog' : undefined}
        aria-expanded={androidApp ? open : undefined}
        disabled={disabled}
        onClick={(event) => {
          if (!ensureApiKey()) {
            return
          }
          if (!androidApp) {
            files.current?.click()
            return
          }
          trigger.current = event.currentTarget
          if (document.activeElement instanceof HTMLTextAreaElement) {
            document.activeElement.blur()
          }
          setOpen(true)
        }}
      />
      <input ref={files} type="file" multiple hidden accept={ACCEPT} onChange={onChange} />
      {androidApp ? (
        <>
          <input ref={photos} type="file" multiple hidden accept="image/*" onChange={onChange} />
          <input
            ref={camera}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={onChange}
          />
          {open ? (
            <Modal title={t('addAttachment')} closable onClose={close} className={styles.sheet}>
              <div className={styles.actions}>
                <button
                  type="button"
                  autoFocus={imagesAllowed}
                  disabled={!imagesAllowed}
                  onClick={() => pick(camera.current)}
                >
                  <span className={styles.actionIcon}>
                    <CameraIcon />
                  </span>
                  <span className={styles.actionLabel}>{t('takePhoto')}</span>
                  <IconChevronRightOutline14 />
                </button>
                <button
                  type="button"
                  disabled={!imagesAllowed}
                  onClick={() => pick(photos.current)}
                >
                  <span className={styles.actionIcon}>
                    <PhotosIcon />
                  </span>
                  <span className={styles.actionLabel}>{t('choosePhotos')}</span>
                  <IconChevronRightOutline14 />
                </button>
                <button
                  type="button"
                  autoFocus={!imagesAllowed}
                  onClick={() => pick(files.current)}
                >
                  <span className={styles.actionIcon}>
                    <IconPaperclipOutline16 />
                  </span>
                  <span className={styles.actionLabel}>{t('chooseFiles')}</span>
                  <IconChevronRightOutline14 />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    setImageTextOpen(true)
                  }}
                >
                  <span className={styles.actionIcon}>
                    <IconBrowseOutline16 />
                  </span>
                  <span className={styles.actionLabel}>{t('imageTextTool')}</span>
                  <IconChevronRightOutline14 />
                </button>
              </div>
              {imagesAllowed ? null : <p className={styles.hint}>{t('photosRequireFlash')}</p>}
            </Modal>
          ) : null}
          {imageTextOpen ? (
            <ImageTextDialog onClose={() => setImageTextOpen(false)} onInsert={onInsertText} />
          ) : null}
        </>
      ) : null}
    </>
  )
}
