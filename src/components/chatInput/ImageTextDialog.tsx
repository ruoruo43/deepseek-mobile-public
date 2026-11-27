import { useState } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { recognizeAndroidImage } from '../../services/android.js'
import { copyText } from '../../utils/clipboard.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './ImageTextDialog.module.css'

const errors = {
  empty: 'imageTextEmpty',
  unreadable: 'imageTextUnreadable',
  busy: 'imageTextBusy',
  failed: 'imageTextFailed',
} satisfies Record<string, TranslationKey>

export function ImageTextDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void
  onInsert?: (text: string) => void
}) {
  const t = useTranslate()
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<TranslationKey | null>(null)
  const output = text.trim()

  const choose = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await recognizeAndroidImage()
      if (result.status === 'recognized') {
        setText(result.text)
      } else if (result.status !== 'cancelled') {
        if (result.status !== 'busy') {
          setText('')
        }
        setError(errors[result.status])
      }
    } catch {
      setError('imageTextFailed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('imageTextTool')}
      className={styles.dialog}
      closable
      onClose={onClose}
      footer={
        <div className={styles.actions}>
          <Button
            size="m"
            variant={output ? 'outlined' : 'primary'}
            disabled={busy}
            onClick={() => void choose()}
          >
            {t(output ? 'imageTextChooseAnother' : 'imageTextChoose')}
          </Button>
          {output ? (
            <Button
              size="m"
              variant={onInsert ? 'outlined' : 'primary'}
              disabled={busy}
              onClick={async () => {
                showToast({ key: (await copyText(output)) ? 'copied' : 'copyFailed' })
              }}
            >
              {t('imageTextCopy')}
            </Button>
          ) : null}
          {output && onInsert ? (
            <Button
              size="m"
              disabled={busy}
              onClick={() => {
                onInsert(output)
                onClose()
              }}
            >
              {t('imageTextInsert')}
            </Button>
          ) : null}
        </div>
      }
    >
      {busy ? (
        <p className={styles.note} role="status">
          {t('imageTextRecognizing')}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {t(error)}
        </p>
      ) : null}
      {text ? (
        <label className={styles.field}>
          <span>{t('imageTextResult')}</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={busy}
          />
        </label>
      ) : !busy && !error ? (
        <p className={styles.note}>{t('imageTextOnDevice')}</p>
      ) : null}
    </Modal>
  )
}
