import { useState } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { checkGitHubRelease } from '../../services/android.js'
import {
  parseGitHubUpdateResult,
  type GitHubUpdateError,
  type GitHubUpdateResult,
} from '../../services/githubUpdates.js'
import { Button } from '../base/Button.js'
import { IconLinkOutline14, IconRefreshOutline16 } from '../base/icons.js'
import styles from './GitHubUpdates.module.css'

const errorMessages = {
  rateLimited: 'githubUpdateRateLimited',
  notFound: 'githubUpdateNotFound',
  timeout: 'githubUpdateTimeout',
  networkError: 'githubUpdateNetworkError',
  unavailable: 'githubUpdateUnavailable',
  invalidRelease: 'githubUpdateInvalidRelease',
  invalidInstalledVersion: 'githubUpdateInvalidInstalledVersion',
  busy: 'githubUpdateBusy',
  hostError: 'githubUpdateUnavailable',
} satisfies Record<GitHubUpdateError, TranslationKey>

export const GitHubUpdates = () => {
  const t = useTranslate()
  const installed = document.querySelector<HTMLMetaElement>(
    'meta[name="application-version"]'
  )?.content
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<GitHubUpdateResult | null>(null)

  const check = async () => {
    setChecking(true)
    setResult(null)
    try {
      setResult(parseGitHubUpdateResult(installed || null, await checkGitHubRelease()))
    } catch {
      setResult({ status: 'hostError' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <dl className={styles.version}>
          <dt>{t('githubUpdateInstalledVersion')}</dt>
          <dd>{installed || t('githubUpdateUnknownVersion')}</dd>
        </dl>
        <Button size="m" disabled={checking} aria-busy={checking} onClick={() => void check()}>
          <IconRefreshOutline16 />
          {t('githubUpdateCheck')}
        </Button>
      </div>
      <div className={styles.feedback} role="status">
        {checking && <p>{t('githubUpdateChecking')}</p>}
        {result &&
          ('tag' in result ? (
            <p>
              {t(result.status === 'available' ? 'githubUpdateAvailable' : 'githubUpdateCurrent', {
                version: result.tag,
              })}
            </p>
          ) : (
            <p className={styles.error}>{t(errorMessages[result.status])}</p>
          ))}
      </div>
      {result?.status === 'available' && (
        <a className={styles.link} href={result.url}>
          <IconLinkOutline14 />
          {t('githubUpdateOpenRelease')}
        </a>
      )}
    </div>
  )
}
