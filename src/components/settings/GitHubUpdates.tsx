import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import {
  checkGitHubRelease,
  downloadGitHubUpdate,
  installGitHubUpdate,
} from '../../services/android.js'
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

const packageMessages = {
  ready: 'githubUpdateReady',
  permissionSettings: 'githubUpdateInstallPermission',
  installerOpened: 'githubUpdateInstallerOpened',
  downloadRequired: 'githubUpdateDownloadRequired',
  downloadFailed: 'githubUpdateDownloadFailed',
  invalidApk: 'githubUpdateInvalidApk',
  installFailed: 'githubUpdateInstallFailed',
  busy: 'githubUpdateBusy',
} satisfies Record<string, TranslationKey>

export const GitHubUpdates = ({ embedded = false }: { embedded?: boolean }) => {
  const t = useTranslate()
  const installed = document.querySelector<HTMLMetaElement>(
    'meta[name="application-version"]'
  )?.content
  const [operation, setOperation] = useState<'check' | 'download' | 'install' | null>(null)
  const [result, setResult] = useState<GitHubUpdateResult | null>(null)
  const [apkReady, setApkReady] = useState(false)
  const [packageMessage, setPackageMessage] = useState<TranslationKey | null>(null)
  const release = result?.status === 'available' ? result : null

  const check = async () => {
    setOperation('check')
    setResult(null)
    setApkReady(false)
    setPackageMessage(null)
    try {
      setResult(parseGitHubUpdateResult(installed || null, await checkGitHubRelease()))
    } catch {
      setResult({ status: 'hostError' })
    } finally {
      setOperation(null)
    }
  }

  const handlePackage = async () => {
    if (!release?.downloadAvailable) {
      return
    }
    setOperation(apkReady ? 'install' : 'download')
    setPackageMessage(null)
    try {
      const response = await (apkReady
        ? installGitHubUpdate(release.tag)
        : downloadGitHubUpdate(release.tag))
      const status =
        typeof response === 'object' && response !== null && 'status' in response
          ? (Object.keys(packageMessages).find((value) => value === response.status) as
              | keyof typeof packageMessages
              | undefined)
          : undefined
      if (status === 'ready' || status === 'downloadRequired') {
        setApkReady(status === 'ready')
      }
      setPackageMessage(status ? packageMessages[status] : 'githubUpdateDownloadFailed')
    } catch {
      setPackageMessage(apkReady ? 'githubUpdateInstallFailed' : 'githubUpdateDownloadFailed')
    } finally {
      setOperation(null)
    }
  }

  return (
    <div className={clsx(styles.panel, embedded && styles.embedded)}>
      <div className={styles.header}>
        <dl className={styles.version}>
          <dt>{t('githubUpdateInstalledVersion')}</dt>
          <dd>{installed || t('githubUpdateUnknownVersion')}</dd>
        </dl>
        <Button
          size="m"
          variant={release ? 'outlined' : 'primary'}
          disabled={operation !== null}
          aria-busy={operation === 'check'}
          onClick={() => void check()}
        >
          <IconRefreshOutline16 />
          {t('githubUpdateCheck')}
        </Button>
      </div>
      <div className={styles.feedback} role="status">
        {operation === 'check' && <p>{t('githubUpdateChecking')}</p>}
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
        {operation === 'download' && <p>{t('githubUpdateDownloading')}</p>}
        {operation === 'install' && <p>{t('githubUpdateOpeningInstaller')}</p>}
        {packageMessage && <p>{t(packageMessage)}</p>}
      </div>
      {release && (
        <div className={styles.actions}>
          {release.downloadAvailable && (
            <Button size="m" disabled={operation !== null} onClick={() => void handlePackage()}>
              {t(apkReady ? 'githubUpdateInstall' : 'githubUpdateDownload')}
            </Button>
          )}
          <a className={styles.link} href={release.url}>
            <IconLinkOutline14 />
            {t(release.downloadAvailable ? 'githubUpdateReleaseNotes' : 'githubUpdateOpenRelease')}
          </a>
        </div>
      )}
    </div>
  )
}
