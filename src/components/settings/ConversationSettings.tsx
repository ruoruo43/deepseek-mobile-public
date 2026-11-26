import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { verifyApiKey } from '../../services/api/client.js'
import {
  instructionLimit,
  setAvailableModels,
  setChatModel,
  setInstructions,
  useSettings,
} from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import styles from './ConversationSettings.module.css'

export function ModelSelect() {
  const t = useTranslate()
  const model = useSettings((state) => state.model)
  const availableModels = useSettings((state) => state.availableModels)
  return (
    <Select
      value={model}
      options={availableModels.map(({ id }) => ({
        value: id,
        label: t(id === 'deepseek-flash' ? 'modelFlashLabel' : 'modelProLabel'),
      }))}
      ariaLabel={t('chooseChatModel')}
      onChange={setChatModel}
    />
  )
}

export function ModelConnectionButton() {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  const [checking, setChecking] = useState(false)
  async function check() {
    if (!apiKey || checking) {
      return
    }
    setChecking(true)
    try {
      const models = await verifyApiKey(apiKey)
      if (useSettings.getState().apiKey !== apiKey) {
        return
      }
      setAvailableModels(models)
      showToast({ key: 'modelCheckSuccess' })
    } catch {
      showToast({ key: 'modelCheckFailed', type: 'error' })
    } finally {
      setChecking(false)
    }
  }

  return apiKey ? (
    <Button size="m" variant="outlined" disabled={checking} onClick={() => void check()}>
      {t(checking ? 'apiKeyVerifying' : 'modelCheck')}
    </Button>
  ) : null
}

export function InstructionsSetting() {
  const t = useTranslate()
  const saved = useSettings((state) => state.instructions)
  const [draft, setDraft] = useState(saved)
  return (
    <div className={styles.instructions}>
      <label htmlFor="instructions">{t('personalInstructions')}</label>
      <p id="instructions-help">{t('personalInstructionsHelp')}</p>
      <textarea
        id="instructions"
        aria-describedby="instructions-help"
        maxLength={instructionLimit}
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button
        size="m"
        variant="outlined"
        disabled={draft === saved}
        onClick={() => {
          setInstructions(draft)
          showToast({ key: 'personalInstructionsSaved' })
        }}
      >
        {t('confirm')}
      </Button>
    </div>
  )
}
