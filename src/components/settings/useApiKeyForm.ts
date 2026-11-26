import { useRef, useState } from 'react'
import { ApiError, verifyApiKey } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import { setApiKey, setAvailableModels } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'

/** 输入 API Key 后先用 GET /models 校验，通过才保存 */
export const useApiKeyForm = (onSaved?: () => void) => {
  const t = useTranslate()
  const [value, setValue] = useState('')
  const [verifying, setVerifying] = useState(false)
  const submitting = useRef(false)
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null)
  const cause = failure?.cause
  const error =
    failure === null
      ? null
      : classifyApiError(cause) === 'unauthorized'
        ? t('apiKeyInvalid')
        : classifyApiError(cause) === 'network'
          ? t('commonNetworkErrorToast')
          : cause instanceof DOMException && cause.name === 'TimeoutError'
            ? t('apiKeyTimeout')
            : cause instanceof ApiError && cause.localMessage
              ? t(cause.localMessage.key, cause.localMessage.params)
              : t('modelCheckFailed')

  const submit = async () => {
    const apiKey = value.trim()
    if (!apiKey || submitting.current) {
      return
    }
    submitting.current = true
    setVerifying(true)
    setFailure(null)
    try {
      const models = await verifyApiKey(apiKey)
      try {
        await setApiKey(apiKey)
      } catch {
        throw new ApiError('protocol', { key: 'deviceKeyWriteFailed' })
      }
      setAvailableModels(models)
      setValue('')
      onSaved?.()
    } catch (e) {
      setFailure({ cause: e })
    } finally {
      submitting.current = false
      setVerifying(false)
    }
  }

  return { value, setValue, verifying, error, submit }
}
