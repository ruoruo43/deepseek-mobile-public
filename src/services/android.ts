export const androidApp =
  typeof window !== 'undefined' &&
  window.location.origin === 'https://appassets.androidplatform.net'

type Method =
  | 'key.read'
  | 'key.write'
  | 'github.release.check'
  | 'github.release.download'
  | 'github.release.install'
  | 'ocr.pick'
  | 'appearance.textZoom'
  | 'share.text'
  | 'export.pick'
  | 'export.chunk'
  | 'export.close'
type Request = { id: number; method: Method; value: string | null }
type Pending = { request: Request; resolve: (value: unknown) => void; reject: () => void }

let androidPort: MessagePort | undefined
let nextId = 0
const pending = new Map<number, Pending>()

function receivePort(event: MessageEvent) {
  if (event.data !== 'ds-android-port' || event.ports.length !== 1 || androidPort) {
    return
  }
  window.removeEventListener('message', receivePort)
  androidPort = event.ports[0]
  androidPort.onmessage = (reply: MessageEvent<unknown>) => {
    if (typeof reply.data !== 'string') {
      return
    }
    try {
      const { id, ok, value } = JSON.parse(reply.data) as {
        id: number
        ok?: boolean
        value?: unknown
      }
      const call = pending.get(id)
      if (!call) {
        return
      }
      if (ok === true) {
        call.resolve(value)
      } else {
        call.reject()
      }
    } catch {
      // Invalid responses never complete a request.
    }
  }
  for (const { request } of pending.values()) {
    androidPort.postMessage(JSON.stringify(request))
  }
}

if (androidApp) {
  window.addEventListener('message', receivePort)
}

function callAndroid(method: Method, value: string | null = null): Promise<unknown> {
  if (!androidApp) {
    return Promise.reject(new Error('Android host unavailable'))
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const request = { id, method, value }
    const finish = () => {
      pending.delete(id)
      clearTimeout(timer)
    }
    const fail = () => {
      finish()
      reject(new Error('Android host request failed'))
    }
    // Native pickers can stay open until the user selects a file or cancels.
    const timeout =
      method === 'github.release.download'
        ? 175_000
        : method === 'github.release.check'
          ? 22_000
          : 12_000
    const waitsForPicker = method === 'export.pick' || method === 'ocr.pick'
    const timer = waitsForPicker && androidPort ? undefined : setTimeout(fail, timeout)
    pending.set(id, {
      request,
      resolve(result) {
        finish()
        resolve(result)
      },
      reject: fail,
    })
    androidPort?.postMessage(JSON.stringify(request))
  })
}

export async function readAndroidKey(): Promise<string | null> {
  const value = await callAndroid('key.read')
  if (value === null || typeof value === 'string') {
    return value
  }
  throw new Error('Invalid Android key response')
}

export const writeAndroidKey = (key: string | null) => callAndroid('key.write', key)

export const checkGitHubRelease = () => callAndroid('github.release.check')

export const downloadGitHubUpdate = (tag: string) => callAndroid('github.release.download', tag)

export const installGitHubUpdate = (tag: string) => callAndroid('github.release.install', tag)

export const setAndroidTextZoom = (percent: number) =>
  callAndroid('appearance.textZoom', String(percent))

export const shareAndroidText = (text: string) => callAndroid('share.text', text)

type ImageTextResult =
  | { status: 'recognized'; text: string }
  | { status: 'cancelled' | 'empty' | 'unreadable' | 'busy' | 'failed' }

export async function recognizeAndroidImage(): Promise<ImageTextResult> {
  const result = await callAndroid('ocr.pick')
  if (result && typeof result === 'object' && 'status' in result) {
    switch (result.status) {
      case 'recognized':
        if ('text' in result && typeof result.text === 'string') {
          return { status: 'recognized', text: result.text }
        }
        break
      case 'cancelled':
      case 'empty':
      case 'unreadable':
      case 'busy':
      case 'failed':
        return { status: result.status }
    }
  }
  throw new Error('Invalid Android OCR result')
}

export async function saveAndroidFile(name: string, blob: Blob, type: string): Promise<void> {
  const filename =
    name
      .replace(/[\\/\p{Cc}]/gu, '_')
      .trim()
      .slice(0, 160) || 'attachment'
  if ((await callAndroid('export.pick', JSON.stringify({ filename, type }))) !== true) {
    return
  }
  const chunkSize = 32_768
  try {
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const buffer = await blob.slice(offset, offset + chunkSize).arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
      await callAndroid('export.chunk', base64)
    }
  } finally {
    await callAndroid('export.close')
  }
}
