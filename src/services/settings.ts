import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'
import { androidApp, readAndroidKey, setAndroidTextZoom, writeAndroidKey } from './android.js'
import { officialModels, parseAvailableModels, type AvailableModel } from './mobileTools.js'
import type { ChatModel } from './api/types.js'
import { restoreLocalLatinFont, saveLocalLatinFont } from './latinFont.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

export const fontSizes = [90, 100, 115, 130] as const
export type FontSize = (typeof fontSizes)[number]

/** 本机设置，存 localStorage：API Key、语言、主题、位置、朗读音色、深度思考与智能搜索开关、侧边栏收起状态 */
type Settings = {
  apiKey: string | null
  availableModels: AvailableModel[]
  model: ChatModel
  instructions: string
  pinnedSessionIds: string[]
  locale: Locale
  themePreference: ThemePreference
  fontSize: FontSize
  hasLocalLatinFont: boolean
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  model: 'ds-mobile:model',
  modelCatalog: 'ds-mobile:model-catalog',
  instructions: 'ds-mobile:instructions',
  pinnedSessions: 'ds-mobile:pinned-sessions',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  fontSize: 'ds-mobile:font-size',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return androidApp || isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

const savedFontSize = () => {
  const saved = read(KEYS.fontSize)
  return fontSizes.find((size) => String(size) === saved)
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

const initialPins = (): string[] => {
  try {
    const saved: unknown = JSON.parse(read(KEYS.pinnedSessions) ?? '[]')
    return Array.isArray(saved)
      ? [...new Set(saved.filter((value): value is string => typeof value === 'string'))]
      : []
  } catch {
    return []
  }
}

export const instructionLimit = 2000

const initialModels = (): AvailableModel[] => {
  try {
    const saved = parseAvailableModels(JSON.parse(read(KEYS.modelCatalog) ?? 'null'))
    return saved.length ? saved : officialModels
  } catch {
    return officialModels
  }
}

const initialCatalog = initialModels()
const preferredModel = read(KEYS.model)

export const useSettings = create<Settings>(() => ({
  apiKey: androidApp ? null : read(KEYS.apiKey),
  availableModels: initialCatalog,
  model: initialCatalog.find(({ id }) => id === preferredModel)?.id ?? initialCatalog[0].id,
  instructions: (read(KEYS.instructions) ?? '').slice(0, instructionLimit),
  pinnedSessionIds: initialPins(),
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  fontSize: savedFontSize() ?? 100,
  hasLocalLatinFont: false,
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setFontSize = async (fontSize: FontSize) => {
  await setAndroidTextZoom(fontSize)
  write(KEYS.fontSize, String(fontSize))
  useSettings.setState({ fontSize })
}

export const setLocalLatinFont = async (file: File | null) => {
  await saveLocalLatinFont(file)
  useSettings.setState({ hasLocalLatinFont: file !== null })
}

export const restoreAndroidTypography = () => {
  const fontSize = savedFontSize()
  return Promise.allSettled([
    fontSize === undefined ? undefined : setAndroidTextZoom(fontSize),
    restoreLocalLatinFont().then((hasLocalLatinFont) =>
      useSettings.setState({ hasLocalLatinFont })
    ),
  ])
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setApiKey = async (apiKey: string | null) => {
  if (androidApp) {
    await writeAndroidKey(apiKey)
  } else {
    write(KEYS.apiKey, apiKey)
  }
  useSettings.setState({ apiKey })
}

export const restoreAndroidKey = async () => {
  if (!androidApp) {
    return
  }
  write(KEYS.apiKey, null)
  const apiKey = await readAndroidKey()
  useSettings.setState({ apiKey })
}

export const setChatModel = (model: ChatModel) => {
  if (!useSettings.getState().availableModels.some((available) => available.id === model)) {
    return
  }
  write(KEYS.model, model)
  useSettings.setState({ model })
}

export const canAttachImages = ({ model, availableModels } = useSettings.getState()) =>
  availableModels.some((available) => available.id === model && available.images)

export const setAvailableModels = (availableModels: AvailableModel[]) => {
  if (!availableModels.length) {
    return
  }
  write(
    KEYS.modelCatalog,
    JSON.stringify({
      data: availableModels.map(({ id, images }) => ({
        id,
        input_modalities: images ? ['text', 'image'] : ['text'],
      })),
    })
  )
  useSettings.setState({ availableModels })
  const { model } = useSettings.getState()
  if (!availableModels.some((available) => available.id === model)) {
    setChatModel(availableModels[0].id)
  }
}

export const setInstructions = (text: string) => {
  const instructions = text.slice(0, instructionLimit)
  write(KEYS.instructions, instructions || null)
  useSettings.setState({ instructions })
}

export const setPinnedSessionIds = (pinnedSessionIds: string[]) => {
  write(KEYS.pinnedSessions, JSON.stringify(pinnedSessionIds))
  useSettings.setState({ pinnedSessionIds })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}
