import { useRef, useState } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import {
  fontSizes,
  setFontSize,
  setLocalLatinFont,
  useSettings,
  type FontSize,
} from '../../services/settings.js'
import { Button } from '../base/Button.js'
import styles from './Settings.module.css'

const sizeLabels = {
  90: 'fontSizeSmall',
  100: 'fontSizeStandard',
  115: 'fontSizeLarge',
  130: 'fontSizeExtraLarge',
} satisfies Record<FontSize, TranslationKey>

export const TypographySetting = () => {
  const t = useTranslate()
  const fontSize = useSettings((state) => state.fontSize)
  const hasLocalFont = useSettings((state) => state.hasLocalLatinFont)
  const fileInput = useRef<HTMLInputElement>(null)
  const [resizing, setResizing] = useState(false)
  const [fontBusy, setFontBusy] = useState(false)
  const [sizeError, setSizeError] = useState(false)
  const [fontError, setFontError] = useState(false)

  const chooseSize = async (size: FontSize) => {
    setResizing(true)
    setSizeError(false)
    try {
      await setFontSize(size)
    } catch {
      setSizeError(true)
    } finally {
      setResizing(false)
    }
  }

  const chooseFont = async (file: File | null) => {
    setFontBusy(true)
    setFontError(false)
    try {
      await setLocalLatinFont(file)
    } catch {
      setFontError(true)
    } finally {
      setFontBusy(false)
    }
  }

  return (
    <section className={styles.typography}>
      <fieldset className={styles.fontSizes}>
        <legend>{t('fontSizeLabel')}</legend>
        <div className={styles.fontSizeOptions}>
          {fontSizes.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={fontSize === size}
              disabled={resizing}
              onClick={() => void chooseSize(size)}
            >
              {t(sizeLabels[size])}
            </button>
          ))}
        </div>
      </fieldset>
      <p className={styles.fontPreview}>
        {t('fontPreview')}
        <br />
        <span lang="en">Flash · x² + y² = r²</span>
      </p>
      {sizeError ? (
        <p className={styles.error} role="alert">
          {t('fontSizeError')}
        </p>
      ) : null}
      <details className={styles.latinFont}>
        <summary>{t('latinFontLabel')}</summary>
        <p className={styles.description}>{t(hasLocalFont ? 'latinFontLocal' : 'latinFontHelp')}</p>
        <div className={styles.latinFontActions}>
          <Button
            variant="outlined"
            size="m"
            disabled={fontBusy}
            onClick={() => fileInput.current?.click()}
          >
            {t('latinFontImport')}
          </Button>
          {hasLocalFont ? (
            <Button
              variant="outlined"
              size="m"
              disabled={fontBusy}
              onClick={() => void chooseFont(null)}
            >
              {t('latinFontReset')}
            </Button>
          ) : null}
        </div>
        <input
          type="file"
          accept=".ttf,.otf,font/ttf,font/otf"
          ref={fileInput}
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) {
              void chooseFont(file)
            }
          }}
        />
        {fontError ? (
          <p className={styles.error} role="alert">
            {t('latinFontError')}
          </p>
        ) : null}
      </details>
    </section>
  )
}
