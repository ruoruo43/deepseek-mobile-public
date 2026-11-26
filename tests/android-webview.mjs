// Run against the .qa package's WebView after adb forward. Use github-live for the real public release.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const port = Number(process.argv[2])
const mode = process.argv[3] ?? 'initial'
const screenshots = process.env.DS_QA_SCREENSHOTS
assert(Number.isInteger(port) && port > 0)
const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = tabs.find((tab) => tab.url === 'https://appassets.androidplatform.net/index.html')
assert(page?.webSocketDebuggerUrl, 'DS Chat QA WebView is not available')

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

const active = new Map()
const stubRequests = []
const networkFailures = []
let nextMessage = 0
let stubError
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  const pending = active.get(message.id)
  if (pending) {
    active.delete(message.id)
    if (message.error) pending.reject(new Error(message.error.message))
    else pending.resolve(message.result)
  }
  if (message.method === 'Fetch.requestPaused') {
    void respond(message.params).catch((error) => {
      stubError = error
    })
  }
  if (mode === 'picker' && message.method === 'Network.loadingFailed') {
    networkFailures.push(message.params.errorText)
  }
})

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextMessage
    active.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

const fakeKey = 'qa-key-verified-offline'
const chatTitle = '周末读书计划'
const searchKeyword = '预留缓冲'
const answer = [
  '可以按选书、阅读、整理三步安排。',
  '**周六**上午读 30 分钟，在书里标出一句最有启发的话。',
  '**周日**回顾笔记，用三句话写下感想。每天可以预留缓冲时间。',
  '两天各读 30 分钟，总共 $2 \\times 30 = 60$ 分钟。',
  '```mermaid\nflowchart TD\n  A[选书] --> B[阅读]\n  B --> C[整理]\n```',
].join('\n\n')

function sseBody(m) {
  const events = [
    {
      type: 'message_start',
      message: { id: 'qa_reply', type: 'message', role: 'assistant', model: m },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: answer } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', title: chatTitle },
      usage: {
        input_tokens: 24,
        output_tokens: 55,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
    { type: 'message_stop' },
  ]
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
}

async function respond({ requestId, request }) {
  const path = new URL(request.url).pathname
  const headers = Object.fromEntries(
    Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value])
  )
  let responseCode = 200
  let type = 'application/json'
  let body = ''
  if (request.method === 'OPTIONS') {
    responseCode = 204
  } else if (path === '/models') {
    const authenticated = headers.authorization === `Bearer ${fakeKey}`
    stubRequests.push({ path, authenticated })
    responseCode = authenticated ? 200 : 401
    body = JSON.stringify(
      authenticated
        ? {
            object: 'list',
            data: [
              { id: 'deepseek-flash', object: 'model', input_modalities: ['text', 'image'] },
              { id: 'deepseek-v4-pro', object: 'model', input_modalities: ['text'] },
            ],
          }
        : { error: { type: 'invalid_request_error', message: 'Invalid API key' } }
    )
  } else if (path === '/anthropic/v1/messages') {
    assert.equal(headers['x-api-key'], fakeKey)
    const payload = JSON.parse(request.postData ?? '{}')
    stubRequests.push({ path, payload })
    type = 'text/event-stream'
    body = sseBody(payload.model)
  } else if (path === '/anthropic/v1/files' && mode === 'picker') {
    assert.equal(headers['x-api-key'], fakeKey)
    assert.match(headers['content-type'] ?? '', /^multipart\/form-data/)
    stubRequests.push({ path })
    body = JSON.stringify({ id: 'file_qa_selected_attachment', object: 'file' })
  } else {
    stubRequests.push({ path })
    responseCode = 404
    body = JSON.stringify({ error: { message: 'Unknown QA route' } })
  }
  await send('Fetch.fulfillRequest', {
    requestId,
    responseCode,
    responseHeaders: [
      { name: 'Content-Type', value: type },
      { name: 'Access-Control-Allow-Origin', value: 'https://appassets.androidplatform.net' },
      {
        name: 'Access-Control-Allow-Headers',
        value: 'authorization,x-api-key,content-type,anthropic-beta',
      },
      { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
    ],
    body: Buffer.from(body).toString('base64'),
  })
}

async function evaluate(fn, ...args) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression: `(${fn})(...${JSON.stringify(args)})`,
    returnByValue: true,
    awaitPromise: true,
    userGesture: mode === 'picker',
  })
  if (exceptionDetails) throw new Error(exceptionDetails.text)
  return result.value
}

async function until(fn, description, timeout = 18_000) {
  const deadline = Date.now() + timeout
  do {
    if (stubError) throw stubError
    if (await fn()) return
    await new Promise((resolve) => setTimeout(resolve, 160))
  } while (Date.now() < deadline)
  throw new Error(`Timed out waiting for ${description}`)
}

const find = (selector) => evaluate((s) => Boolean(document.querySelector(s)), selector)
const visibleText = (text) => evaluate((value) => document.body.innerText.includes(value), text)
const click = (selector) =>
  evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return false
    el.click()
    return true
  }, selector)
const clickLabel = (pattern, selector = 'button,[role="menuitem"],[role="option"]') =>
  evaluate(
    (re, s) => {
      const match = new RegExp(re, 'i')
      const element = [...document.querySelectorAll(s)].find(
        (it) => match.test(it.innerText.trim()) || match.test(it.getAttribute('aria-label') ?? '')
      )
      if (!element || element.disabled) return false
      element.click()
      return true
    },
    pattern,
    selector
  )
const type = (selector, value) =>
  evaluate(
    (s, v) => {
      const element = document.querySelector(s)
      if (!element) return false
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, v)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    },
    selector,
    value
  )
const back = () =>
  evaluate(() => window.dispatchEvent(new Event('ds-android-back', { cancelable: true })))

async function snapshot(name) {
  if (!screenshots) return
  mkdirSync(screenshots, { recursive: true })
  await evaluate(async () => {
    await document.fonts.ready
    return true
  })
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(screenshots, name + '.png'), Buffer.from(data, 'base64'))
}

const sidebarText = (text) =>
  evaluate(
    (value) =>
      document
        .querySelector('input[type="search"]')
        ?.parentElement.parentElement.innerText.includes(value) ?? false,
    text
  )
const sidebarMore = () =>
  evaluate(() => {
    const sidebar = document.querySelector('input[type="search"]')?.parentElement.parentElement
    const button = [...(sidebar?.querySelectorAll('button') ?? [])].find((el) =>
      /^(More|更多)$/.test(el.getAttribute('aria-label') ?? '')
    )
    if (!button) return false
    button.click()
    return true
  })

async function openUpdates() {
  await until(() => find('textarea'), 'chat restored')
  assert.equal(await evaluate(() => document.documentElement.lang), 'zh-CN')
  assert(await clickLabel('^打开边栏$'))
  assert(await clickLabel('^设置$'))
  assert(await clickLabel('^GitHub 更新$', '[role="tab"]'))
  const version = await evaluate(
    () => document.querySelector('meta[name="application-version"]')?.content
  )
  assert.match(version ?? '', /^\d+\.\d+\.\d+$/)
  await until(
    async () =>
      (await evaluate(() => document.querySelector('[role="tabpanel"] dd')?.textContent)) ===
      version,
    'installed version'
  )
  return version
}

const clickUpdateCheck = () => clickLabel('^检查更新$', '[role="tabpanel"] button')
const updateStatus = () =>
  evaluate(() => document.querySelector('[role="tabpanel"] [role="status"]')?.textContent ?? '')
const updateDownload = () =>
  evaluate(() => document.querySelector('[role="tabpanel"] a')?.getAttribute('href') ?? null)

const fontPreviewSelector = '[role="tabpanel"] fieldset + p'

const previewTextSize = () =>
  evaluate((selector) => {
    const node = document.querySelector(selector)
    return node ? parseFloat(getComputedStyle(node).fontSize) : 0
  }, fontPreviewSelector)

async function testTypography(restore) {
  await until(() => find('textarea'), 'chat restored')
  assert(await clickLabel('^打开边栏$'))
  assert(await clickLabel('^设置$'))
  await until(() => find(fontPreviewSelector), 'font size preview')
  await evaluate(async () => {
    await document.fonts.ready
    return true
  })

  const pressed = () =>
    evaluate(() => document.querySelector('fieldset button[aria-pressed="true"]')?.textContent)
  if (!restore) {
    assert.equal(await pressed(), '标准')
    await send('DOM.enable')
    await send('CSS.enable')
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: fontPreviewSelector,
    })
    const { fonts } = await send('CSS.getPlatformFontsForNode', { nodeId })
    assert(
      fonts.some(({ postScriptName }) => postScriptName === 'LXGWWenKaiLite-Regular'),
      JSON.stringify(fonts)
    )
    const { nodeId: latin } = await send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: fontPreviewSelector + ' span',
    })
    const western = await send('CSS.getPlatformFontsForNode', { nodeId: latin })
    assert(western.fonts.some(({ familyName }) => /Tinos|Times New Roman/.test(familyName)))
    const standard = await previewTextSize()
    assert(await clickLabel('^特大$', 'fieldset button'))
    await until(async () => (await previewTextSize()) > standard, 'larger rendered text')
    assert.equal(await pressed(), '特大')
    await snapshot('楷书与特大字号')
    console.log('PASS: Kai and Roman-compatible font glyphs loaded and native text size increased')
  } else {
    assert.equal(await pressed(), '特大')
    const large = await previewTextSize()
    assert(await clickLabel('^标准$', 'fieldset button'))
    await until(async () => (await previewTextSize()) < large, 'return to standard text size')
    console.log('PASS: locally saved text size is restored after relaunch')
  }
}

async function testGitHubUpdates() {
  await evaluate(() => {
    const original = MessagePort.prototype.postMessage
    window.qaGitHubRequests = []
    window.qaRestoreGitHubBridge = () => {
      MessagePort.prototype.postMessage = original
      delete window.qaGitHubRequests
      delete window.qaGitHubResult
      delete window.qaRestoreGitHubBridge
    }
    MessagePort.prototype.postMessage = function (data, ...rest) {
      const request = typeof data === 'string' ? JSON.parse(data) : null
      if (typeof request?.method !== 'string' || !request.method.startsWith('github.')) {
        return original.call(this, data, ...rest)
      }
      window.qaGitHubRequests.push({ method: request.method, value: request.value })
      const reply = { id: request.id, ok: true, value: window.qaGitHubResult }
      queueMicrotask(() => {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(reply) }))
      })
    }
  })
  try {
    const installed = await openUpdates()
    assert.deepEqual(await evaluate(() => window.qaGitHubRequests), [])
    assert.deepEqual(
      await evaluate(() =>
        [...document.querySelectorAll('[role="tabpanel"] button')].map((button) =>
          button.innerText.trim()
        )
      ),
      ['检查更新']
    )

    const newer = 'v' + (BigInt(installed.split('.')[0]) + 1n) + '.0.0'
    const releaseLink = 'https://github.com/ruoruo43/deepseek-mobile-public/releases/tag/' + newer
    const checks = [
      [{ status: 'notFound' }, '暂未找到公开的正式版本。', null],
      [{ status: 'rateLimited' }, 'GitHub 请求达到限额，请稍后再试。', null],
      [
        { status: 'release', tag: 'v' + installed },
        '没有可用更新，最新发布为 v' + installed + '。',
        null,
      ],
      [{ status: 'release', tag: newer }, '发现新版本 ' + newer + '。', releaseLink],
    ]
    for (const [result, message, url] of checks) {
      await evaluate((value) => {
        window.qaGitHubResult = value
      }, result)
      assert(await clickUpdateCheck())
      await until(async () => (await updateStatus()) === message, message)
      assert.equal(await updateDownload(), url)
    }
    assert.deepEqual(
      await evaluate(() => window.qaGitHubRequests),
      checks.map(() => ({ method: 'github.release.check', value: null }))
    )
    await evaluate((tag) => {
      window.qaGitHubResult = { status: 'release', tag, downloadAvailable: true }
    }, newer)
    assert(await clickUpdateCheck())
    await until(
      () =>
        evaluate(() =>
          [...document.querySelectorAll('button')].some(
            (button) => button.textContent.trim() === '下载更新'
          )
        ),
      'in-app download button'
    )
    await evaluate(() => {
      window.qaGitHubResult = { status: 'ready' }
    })
    assert(await clickLabel('^下载更新$', '[role="tabpanel"] button'))
    await until(async () => (await updateStatus()).includes('安装包已校验'), 'verified package')
    await evaluate(() => {
      window.qaGitHubResult = { status: 'installerOpened' }
    })
    assert(await clickLabel('^安装更新$', '[role="tabpanel"] button'))
    await until(async () => (await updateStatus()).includes('安卓安装界面'), 'installer state')
    assert.deepEqual((await evaluate(() => window.qaGitHubRequests)).slice(-3), [
      { method: 'github.release.check', value: null },
      { method: 'github.release.download', value: newer },
      { method: 'github.release.install', value: newer },
    ])
    await snapshot('GitHub更新')
  } finally {
    await evaluate(() => window.qaRestoreGitHubBridge?.())
  }
}

async function testLivePackageDownload() {
  await until(async () => (await find('#connect-key')) || (await find('textarea')), 'app ready')
  const isConnectionScreen = await find('#connect-key')
  let panel = '[role="tabpanel"]'
  let installed
  if (isConnectionScreen) {
    panel = '[role="dialog"]'
    assert(await clickLabel('^检查更新$'))
    await until(() => find(panel + ' dd'), 'connection-screen update panel')
    installed = await evaluate(
      (selector) => document.querySelector(selector + ' dd').textContent,
      panel
    )
  } else {
    installed = await openUpdates()
  }
  const feedback = () =>
    evaluate(
      (selector) => document.querySelector(selector + ' [role="status"]')?.textContent ?? '',
      panel
    )
  const expected = process.env.DS_QA_EXPECTED_RELEASE
  assert.match(expected ?? '', /^v\d+\.\d+\.\d+$/)
  assert.notEqual('v' + installed, expected)
  assert(await clickLabel('^检查更新$', panel + ' button'))
  await until(async () => (await feedback()).includes(expected), 'live release ' + expected)
  assert(await clickLabel('^下载更新$', panel + ' button'))
  await until(async () => (await feedback()).includes('安装包已校验'), 'verified live APK', 60_000)
  await snapshot('已下载并验证安装包')
  assert(await clickLabel('^安装更新$', panel + ' button'))
  console.log('PASS: GitHub APK downloaded and verified by the installed app')
}

async function testChatExtras() {
  await until(() => find('textarea'), 'chat restored')
  assert(await clickLabel('^打开边栏$'))
  assert(await clickLabel('^(开启新对话|新建对话|新对话|开始新对话)$'))
  await until(
    () =>
      evaluate(async () => {
        await document.fonts.ready
        return ['深度思考', '智能搜索'].every((label) =>
          document.querySelector(`button[aria-label="${label}"]`)?.innerText.trim()
        )
      }),
    'both composer modes retain readable labels'
  )
  await snapshot('中文首页')
  const prompts = ['目录核验第一问', '目录核验第二问']
  for (const [index, prompt] of prompts.entries()) {
    await until(() => find('textarea'), 'active composer')
    assert(await type('textarea', prompt))
    assert(await clickLabel('^发送$'))
    await until(
      async () =>
        await evaluate(
          (count) =>
            document.querySelectorAll('[data-question-id]').length === count &&
            document.body.innerText.split('可以按选书、阅读、整理三步安排。').length > count,
          index + 1
        ),
      'answer ' + (index + 1)
    )
  }
  assert(await clickLabel('^提问目录$'))
  await until(() => find('[role="dialog"]'), 'question outline')
  assert(await visibleText(prompts[0]))
  assert(await visibleText(prompts[1]))
  await snapshot('提问目录')
  await back()
  assert.equal(await find('[role="dialog"]'), false)
  assert(await clickLabel('^提问目录$'))
  assert(await clickLabel('^' + prompts[0] + '$', '[role="dialog"] button'))
  await until(
    () =>
      evaluate(() => {
        const first = document.querySelector('[data-question-id]')
        const top = first?.getBoundingClientRect().top
        return top >= 0 && top < innerHeight / 2
      }),
    'scroll to the first question'
  )
  await snapshot('跳转到提问')

  await evaluate(() => {
    const original = MessagePort.prototype.postMessage
    window.qaExport = { name: null, chunks: [], complete: false }
    window.qaRestoreExportBridge = () => {
      MessagePort.prototype.postMessage = original
      delete window.qaRestoreExportBridge
      delete window.qaExport
    }
    MessagePort.prototype.postMessage = function (data, ...rest) {
      const request = typeof data === 'string' ? JSON.parse(data) : null
      switch (request?.method) {
        case 'export.pick':
          window.qaExport.name = JSON.parse(request.value)
          break
        case 'export.chunk':
          window.qaExport.chunks.push(request.value)
          break
        case 'export.close':
          window.qaExport.complete = true
          break
        default:
          return original.call(this, data, ...rest)
      }
      const reply = { id: request.id, ok: true, value: true }
      queueMicrotask(() =>
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(reply) }))
      )
    }
  })
  try {
    assert(await clickLabel('^打开边栏$'))
    assert(await click('[aria-current="page"] button[aria-label="更多"]'))
    await snapshot('会话导出入口')
    assert(await clickLabel('^导出为 Markdown$'))
    await until(() => evaluate(() => window.qaExport.complete), 'Markdown export completed')
    const exported = await evaluate(() => window.qaExport)
    assert.equal(exported.name.type, 'text/markdown')
    assert.match(exported.name.filename, /\.md$/)
    const body = Buffer.concat(
      exported.chunks.map((chunk) => Buffer.from(chunk, 'base64'))
    ).toString('utf8')
    assert(body.startsWith('# '))
    for (const prompt of prompts) assert(body.includes(prompt))
    assert(body.includes('**周六**'))
    assert(!body.includes(fakeKey))
  } finally {
    await evaluate(() => window.qaRestoreExportBridge?.())
  }
  console.log('PASS: question navigation, Android back, and local Markdown export')
}

try {
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.deepseek.com/*' }] })
  if (mode === 'reopen') {
    await until(() => find('textarea'), 'chat without a second key prompt')
    assert.equal(await find('#connect-key'), false)
    assert(await clickLabel('^(Open sidebar|打开边栏)$'))
    await until(
      async () => (await sidebarText(chatTitle)) || (await sidebarText('QA first chat')),
      'saved chat'
    )
    assert(await sidebarText('置顶'))
    console.log('PASS: encrypted key, local conversation and pin restored on restart')
  } else if (mode === 'export') {
    await until(() => find('textarea'), 'chat restored')
    assert(await clickLabel('^(Open sidebar|打开边栏)$'))
    assert(await clickLabel('^(Settings|设置)$'))
    assert(await clickLabel('^(Data|Data Management|数据管理)$', '[role="tab"]'))
    assert(await clickLabel('^(Download|下载)$', '[role="dialog"] button'))
    console.log('PASS: requested an Android document destination for history export')
  } else if (mode === 'github-updates') {
    await testGitHubUpdates()
    console.log('PASS: GitHub check, download, installer action, and release fallback UI')
  } else if (mode === 'github-download-live') {
    await testLivePackageDownload()
  } else if (mode === 'chat-extras') {
    await testChatExtras()
  } else if (mode === 'typography' || mode === 'typography-restore') {
    await testTypography(mode === 'typography-restore')
  } else if (mode === 'github-live') {
    await openUpdates()
    assert(await clickUpdateCheck())
    await until(
      async () => {
        const status = await updateStatus()
        return Boolean(status && !status.startsWith('正在检查'))
      },
      'native public release check',
      25_000
    )
    const status = await updateStatus()
    const match = /^(发现新版本 |没有可用更新，最新发布为 )(v\d+\.\d+\.\d+)。$/.exec(status)
    assert(match, status)
    assert.equal(
      await updateDownload(),
      match[1] === '发现新版本 '
        ? 'https://github.com/ruoruo43/deepseek-mobile-public/releases/tag/' + match[2]
        : null
    )
    console.log('PASS: anonymous Android GitHub release check returned ' + match[2])
  } else if (mode === 'picker') {
    const action = process.env.DS_QA_PICKER_ACTION
    assert(['拍照', '相册', '文件'].includes(action))
    await send('Network.enable')
    await until(() => find('textarea'), 'chat restored')
    await until(() => clickLabel('^选择对话模型$'), 'model selector')
    await until(() => clickLabel('^Flash$', '[role="option"]'), 'Flash model')
    await evaluate(() => {
      window.qaPickerFiles = []
      document.addEventListener(
        'change',
        (event) => {
          if (event.target instanceof HTMLInputElement && event.target.type === 'file') {
            window.qaPickerFiles = Array.from(event.target.files ?? []).map(
              ({ name, type, size }) => ({
                name,
                type,
                size,
              })
            )
          }
        },
        true
      )
    })
    assert(await clickLabel('^添加附件$'))
    assert(await clickLabel('^' + action + '$', '[role="dialog"] button'))
    console.log('OPEN: ' + action)
    try {
      await until(
        () => stubRequests.some(({ path }) => path === '/anthropic/v1/files'),
        'upload of the user-selected Android fixture',
        75_000
      )
    } catch (error) {
      console.log('Picker result:', await evaluate(() => window.qaPickerFiles), networkFailures)
      throw error
    }
    await snapshot(action + '返回输入框')
    console.log('PASS: ' + action + ' returned an attachment to the existing upload flow')
  } else {
    await until(() => find('#connect-key'), 'first-run key form')
    assert.equal(await evaluate(() => document.documentElement.lang), 'zh-CN')
    assert(await visibleText('验证并开始'))
    await snapshot('首次连接')
    assert(await clickLabel('^检查更新$'))
    await until(() => find('[role="dialog"] dd'), 'update panel before DeepSeek setup')
    assert.equal(await find('[role="dialog"] input'), false)
    assert(await clickLabel('^关闭$', '[role="dialog"] button'))
    await until(() => find('#connect-key'), 'first-run key form after closing updates')
    assert(await type('#connect-key', 'qa-key-invalid'))
    assert(await click('form button[type="submit"]'))
    await until(() => find('[role="alert"]'), 'invalid-credential feedback')
    assert(await type('#connect-key', fakeKey))
    assert(await click('form button[type="submit"]'))
    await until(
      async () => (await find('textarea')) && !(await find('#connect-key')),
      'chat after key validation'
    )
    assert.deepEqual(
      stubRequests
        .filter(({ path }) => path === '/models')
        .map(({ authenticated }) => authenticated),
      [false, true]
    )
    assert.equal(
      await evaluate(() =>
        Object.values(localStorage).some((value) => value.includes('qa-key-verified-offline'))
      ),
      false
    )
    console.log(
      'PASS: invalid key rejected, valid key opens chat without plaintext WebView storage'
    )
    assert.equal(await visibleText('今天想聊点什么？'), false)
    assert(
      await evaluate(async () => {
        await document.fonts.ready
        const labels = ['深度思考', '智能搜索', '添加附件', '语音输入']
        const boxes = labels.map((label) =>
          document.querySelector('button[aria-label="' + label + '"]')?.getBoundingClientRect()
        )
        return (
          !document.querySelector('button[aria-label="发送"]') &&
          boxes.every(
            (box, index) =>
              box &&
              box.width >= 43.5 &&
              box.height >= 43.5 &&
              Math.abs(box.top - boxes[0].top) < 2 &&
              (index === 0 || box.left >= boxes[index - 1].right)
          )
        )
      }),
      'the empty composer groups four full touch targets on a single non-overlapping row'
    )
    await snapshot('首页')
    assert(await clickLabel('^添加附件$'))
    for (const action of ['拍照', '相册', '文件']) {
      assert(await visibleText(action))
    }
    await snapshot('附件面板')
    await back()
    assert.equal(await find('[role="dialog"]'), false)
    assert(await clickLabel('^快捷提问$', 'summary'))
    await snapshot('快捷提问')
    assert(await clickLabel('^总结要点$'))
    assert(
      await evaluate(() => /Summarize|总结|提炼/.test(document.querySelector('textarea').value))
    )
    assert(await evaluate(() => document.activeElement === document.querySelector('textarea')))
    await send('DOM.enable')
    await send('CSS.enable')
    const { root } = await send('DOM.getDocument')
    const { nodeId } = await send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'textarea',
    })
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus-visible'] })
    const composerFocus = await evaluate(() => {
      const textarea = document.querySelector('textarea')
      const composer = textarea.parentElement.parentElement
      const composerStyle = getComputedStyle(composer)
      const accent = document.createElement('span').style
      accent.color = composerStyle.getPropertyValue('--ds-app-accent').trim()
      return {
        textareaOutline: getComputedStyle(textarea).outlineStyle,
        composerBorder: composerStyle.borderTopColor,
        accentColor: accent.color,
      }
    })
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    assert.equal(composerFocus.textareaOutline, 'none', 'the textarea has no inner focus outline')
    assert.equal(
      composerFocus.composerBorder,
      composerFocus.accentColor,
      'the composer keeps its accent border while the textarea is focused'
    )
    assert(await find('button[aria-label="发送"]'))
    assert(!stubRequests.some(({ payload }) => payload))
    console.log('PASS: welcome prompt shortcut fills the draft without sending')

    assert(await clickLabel('^(Open sidebar|打开边栏)$'))
    assert(
      await evaluate(async () => {
        const drawer = document.querySelector('input[type="search"]')?.parentElement?.parentElement
        const mark = drawer?.querySelector('[class^="brand-"]')
        if (!mark) return false
        const asset = /url\(["']?([^"')]+ds-dolphin[^"')]+)["']?\)/.exec(
          getComputedStyle(mark).backgroundImage
        )?.[1]
        if (!asset) return false
        const image = new Image()
        image.src = asset
        await image.decode()
        return image.naturalWidth === 320 && image.naturalHeight === 320
      })
    )
    assert(await clickLabel('^(Settings|设置)$'))
    await snapshot('设置')
    if (screenshots) {
      assert(await clickLabel('^(Dark|深色)$', '[role="dialog"] button'))
      await until(() => find('body[data-ds-dark-theme]'), 'dark palette')
      await snapshot('深色设置')
      assert(await clickLabel('^(System|跟随系统)$', '[role="dialog"] button'))
    }
    const instructions = '请先给结论，再按天安排。'
    assert(await type('#instructions', instructions))
    assert(await clickLabel('^(Confirm|OK|确定|确认)$', '[role="dialog"] button'))
    await back()
    await back()

    assert(await type('textarea', '帮我安排一个周末读书计划。每天只有半小时。'))
    assert(await clickLabel('^(Send|发送)$'))
    await until(() => visibleText(searchKeyword), 'streaming answer')
    await until(() => find('.katex'), 'KaTeX formulas')
    assert(
      await evaluate(() => {
        const operator = document.querySelector('.katex .katex-html .mbin')
        return (
          operator?.textContent === '×' &&
          getComputedStyle(operator).fontFamily.includes('DS Latin')
        )
      })
    )
    await until(() => find('.md-mermaid-diagram svg'), 'Mermaid diagram')
    if (screenshots) {
      await until(
        async () =>
          !(await visibleText('Instructions saved.')) && !(await visibleText('指令已保存。')),
        'instruction feedback to clear'
      )
      await evaluate(() =>
        document
          .querySelector('.ds-assistant-message-main-content')
          ?.parentElement?.scrollIntoView({ block: 'start' })
      )
      await snapshot('会话')
    }
    assert.equal(stubRequests.find(({ payload }) => payload)?.payload.model, 'deepseek-flash')
    assert(stubRequests.find(({ payload }) => payload)?.payload.system.includes(instructions))
    console.log('PASS: custom instructions, Flash SSE, formula and diagram rendering')

    assert(await clickLabel('^(Choose chat model|选择对话模型)$'))
    assert(await clickLabel('^Pro$', '[role="option"]'))
    assert(
      await evaluate(() => {
        const input = document.querySelector('input[type="file"]')
        if (!input) return false
        const files = new DataTransfer()
        files.items.add(new File(['test'], 'fixture.png', { type: 'image/png' }))
        input.files = files.files
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })
    )
    await until(
      () => evaluate(() => /Switch to Flash|切换到 Flash/.test(document.body.innerText)),
      'Pro image rejection'
    )
    assert(!stubRequests.some(({ path }) => path.endsWith('/files')))
    assert(await type('textarea', '能不能再精简一点？'))
    assert(await clickLabel('^(Send|发送)$'))
    await until(() => stubRequests.filter(({ payload }) => payload).length === 2, 'Pro request')
    const pro = stubRequests.filter(({ payload }) => payload)[1].payload
    assert.equal(pro.model, 'deepseek-v4-pro')
    assert.equal(pro.tools, undefined)
    assert(!pro.messages.some(({ role }) => role === 'latest_reminder'))
    console.log('PASS: model switch, local image rejection before upload and Pro request')

    assert(await clickLabel('^(Open sidebar|打开边栏)$'))
    await until(() => sidebarText(chatTitle), 'saved title')
    assert(await type('input[type="search"]', searchKeyword))
    await until(() => sidebarText(chatTitle), 'match in chat body')
    assert(await sidebarMore())
    await until(() => clickLabel('(Pin chat|置顶会话)$', '[role="menuitem"]'), 'pin action')
    await until(() => evaluate(() => /Pinned|置顶/.test(document.body.innerText)), 'pinned group')
    if (screenshots) {
      await until(
        async () => !(await visibleText('当前对话包含图片')),
        'image warning feedback to clear'
      )
      await snapshot('会话抽屉')
    }
    assert(await type('input[type="search"]', 'allow-only-unmatched-result'))
    await until(
      () => evaluate(() => /No matching chats|没有找到匹配的会话/.test(document.body.innerText)),
      'empty history search'
    )
    assert(await type('input[type="search"]', ''))
    console.log('PASS: local body search, empty result and pinned group')

    const egressBlocked = await evaluate(async () => {
      try {
        await fetch('https://example.com/', { signal: AbortSignal.timeout(4000) })
        return false
      } catch (error) {
        return error instanceof TypeError
      }
    })
    assert(egressBlocked)
    await until(() => sidebarText(chatTitle), 'restored list')
    assert(await sidebarMore())
    await until(
      () => clickLabel('(Share current branch|分享当前分支)$', '[role="menuitem"]'),
      'share action'
    )
    console.log('PASS: blocked non-DeepSeek connection and opened native share action')
  }
} finally {
  socket.close()
}
