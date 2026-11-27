import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { BrandMark } from '../base/BrandMark.js'
import { IconBrowseOutline16, IconRefreshOutline16 } from '../base/icons.js'
import { Modal } from '../base/Modal.js'
import { Toast } from '../base/Toast.js'
import { ImageTextDialog } from '../chatInput/ImageTextDialog.js'
import { GitHubUpdates } from './GitHubUpdates.js'
import { useApiKeyForm } from './useApiKeyForm.js'
import styles from './ConnectScreen.module.css'

export function ConnectScreen() {
  const t = useTranslate()
  const form = useApiKeyForm()
  const [tool, setTool] = useState<'imageText' | 'updates' | null>(null)
  useEffect(() => {
    if (!tool) {
      return
    }
    const closeOnBack = (event: Event) => {
      event.preventDefault()
      setTool(null)
    }
    window.addEventListener('ds-android-back', closeOnBack)
    return () => window.removeEventListener('ds-android-back', closeOnBack)
  }, [tool])

  return (
    <main className={styles.page}>
      <form
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault()
          void form.submit()
        }}
      >
        <header className={styles.identity}>
          <BrandMark className={styles.mark} />
          <div>
            <h1>{t('appName')}</h1>
            <p className={styles.description}>{t('mobileConnectIntro')}</p>
          </div>
        </header>
        <div className={styles.fields}>
          <label htmlFor="connect-key">DeepSeek API Key</label>
          <input
            id="connect-key"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={512}
            placeholder={t('apiKeyPlaceholder')}
            value={form.value}
            onChange={(event) => form.setValue(event.target.value)}
            disabled={form.verifying}
          />
          {form.error ? (
            <p className={styles.error} role="alert">
              {form.error}
            </p>
          ) : null}
          <Button type="submit" size="l" disabled={!form.value.trim() || form.verifying}>
            {t(form.verifying ? 'apiKeyVerifying' : 'mobileConnectAction')}
          </Button>
          <p className={styles.note}>
            {t('mobileKeyStorage')}{' '}
            <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">
              {t('mobileGetKey')}
            </a>
          </p>
        </div>
        <footer className={styles.footer}>
          <button type="button" onClick={() => setTool('imageText')}>
            <IconBrowseOutline16 />
            {t('imageTextTool')}
          </button>
          <button type="button" onClick={() => setTool('updates')}>
            <IconRefreshOutline16 />
            {t('githubUpdateCheck')}
          </button>
        </footer>
      </form>
      {tool === 'updates' ? (
        <Modal
          title={t('githubUpdates')}
          className={styles.updateDialog}
          closable
          onClose={() => setTool(null)}
        >
          <GitHubUpdates embedded />
        </Modal>
      ) : null}
      {tool === 'imageText' ? <ImageTextDialog onClose={() => setTool(null)} /> : null}
      <Toast />
    </main>
  )
}
