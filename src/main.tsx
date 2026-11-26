import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { ConnectScreen } from './components/settings/ConnectScreen.js'
import { showToast } from './components/base/toastState.js'
import { setupTheme } from './app/theme.js'
import { androidApp } from './services/android.js'
import { restoreAndroidKey, restoreAndroidTypography, useSettings } from './services/settings.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'
import './app/androidTheme.css'

if (androidApp) {
  document.documentElement.dataset.dsAndroid = ''
}
ensureKatex()
setupTheme()

function Entry() {
  const key = useSettings((state) => state.apiKey)
  return androidApp && !key ? <ConnectScreen /> : <App />
}

const root = createRoot(document.getElementById('root') as HTMLElement)
if (androidApp) {
  void Promise.allSettled([
    restoreAndroidKey().catch(() => showToast({ key: 'deviceKeyReadFailed', type: 'error' })),
    restoreAndroidTypography(),
  ]).then(() => root.render(<Entry />))
} else {
  root.render(<Entry />)
}
