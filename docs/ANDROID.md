# DS 对话 Android 客户端

安装 APK 后粘贴你的 DeepSeek API Key，点「验证并开始」。App 使用官方模型列表接口确认账号可用性，并依据返回的结果提供 Flash 和 Pro。可从应用顶栏切换模型。

Android 客户端默认显示简体中文。需要切换时，打开「设置 → 通用设置 → 语言」。

- 「设置 → 通用设置 → 字号」提供小、标准、大、特大四档。字号保存在本机，应用重启后继续使用。
- 中文显示为霞鹜文楷。英文和常见数学符号优先使用本机导入字体或设备可用的 Times New Roman，兼容字体为 Tinos。公式中的可伸缩括号和专用字形仍由 KaTeX 排版。导入的字体文件仅用于本机显示，不包含在对话备份中。
- Flash 保留官方底座的图片输入、联网搜索和自动命名。Pro 支持文本对话和深度思考，标题取自首条消息。
- 设置中保存的自定义指令会随对话请求发送给 DeepSeek。同一回答的续写沿用开始生成时的指令。
- 会话抽屉可以搜索标题、消息正文和文件名，并可通过会话菜单置顶、分享当前分支的文本。记录保存在本机。设置提供 ZIP 导出与恢复。
- 对话有两次或更多提问时，点标题展开「提问目录」，选一条即可跳到对应消息。会话菜单的「导出为 Markdown」保存当前分支的正文和附件名称。
- 从输入框「添加附件」选择拍照、相册或文件。相册通过 Android 系统选择器授权已选照片，拍照通过系统相机取得图片。Flash 可发送图片。点击对话里的附件可以保存原件。
- 「添加附件 → 图片转文字」在本机识别选中图片里的简体中文和英文，结果可修改、复制或插入草稿。连接页也提供这个入口，可直接选图和复制文字。
- 首页的「快捷提问」提供总结、润色和解释，把提示词放进输入框，确认发送后才调用 API。

## GitHub 更新

在连接页点「检查更新」，或在「设置 → GitHub 更新」里查询公开仓库 `ruoruo43/deepseek-mobile-public` 的最新正式发布。检查更新无需登录 GitHub 或填写 GitHub 令牌。[GitHub 最新发布接口](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)

如果 GitHub API 限流，应用读取同一仓库的最新公开发行链接，核对其指向的正式版本标签。[GitHub 最新发行链接](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)

0.3.3 起，发现新版本后可点「下载更新」，校验完成后点「安装更新」。首次使用时，按 Android 提示允许 DS 对话安装应用，返回后再点「安装更新」，在系统安装界面确认。0.3.2 及更早的版本需要从 GitHub 下载一次新包并覆盖安装。

应用内下载使用 `ds-chat-<版本>-android.apk` 作为附件名，使用 `v<版本>` 作为标签。应用核对安装包的包名、签名证书和版本，有发布摘要时同时核对 SHA-256 和文件大小。

## 数据与连接

APK 内置页面，通过 HTTPS 调用 `api.deepseek.com`。聊天内容和主动使用的录音由 DeepSeek API 处理。选择或粘贴附件时即开始上传到 DeepSeek。外部链接由用户点击后交给系统浏览器。

API Key 通过 Android Keystore 管理的 AES-GCM 密钥加密后保存在应用私有数据中。密钥在请求时进入内存，聊天归档不包含密钥或自定义指令。卸载或清除应用数据后需要重新配置。

手动检查更新时，Android 原生代码通过 HTTPS 查询 GitHub 的公开发布信息。

图片转文字使用 APK 内置的模型。原图交给本机识别，识别结果插入草稿后，由用户点发送才作为对话文字交给 DeepSeek。

## 构建

使用 Windows、Node.js 24、pnpm 11、JDK 21、Android SDK Platform 35 和 Build Tools 35.0.0。先安装锁定依赖并运行核验。

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm run type
pnpm run lint
pnpm audit --prod
pnpm run build
```

首次签名请在源码目录外或忽略的 `build` 目录中使用 `keytool` 生成 PKCS12 密钥库，别名为 `ds-mobile`。保存密钥库及口令以便以后覆盖升级。签名口令文件应位于私有位置，仅含一行口令。

```powershell
./android/build-apk.ps1 -SdkRoot $SdkPath -JdkRoot $JdkPath `
  -Keystore $KeystorePath -SigningPasswordFile $PasswordFile -SkipWebBuild
```

安装包位于 `build/ds-chat-<版本>-android.apk`，适用 Android 8.0 及以上。请使用设备可更新到的最新版 Android System WebView。加 `-Qa` 构建隔离的 QA 包，包名后缀为 `.qa`，可供测试人员检查 WebView。

构建脚本按 `android/ocr.lock.json` 获取 OCR 依赖与模型，验证 SHA-256 后缓存在 `build/android-ocr`。APK 内的 `assets/ocr/licenses` 保留依赖许可和声明。[Tesseract4Android 4.9.0](https://github.com/adaptech-cz/Tesseract4Android/releases/tag/4.9.0) · [tessdata_fast 4.1.0](https://github.com/tesseract-ocr/tessdata_fast/tree/65727574dfcd264acbb0c3e07860e4e9e9b22185)

## 来源

官方 `chat-demo` 固定在提交 `cdf9617c5f265d58e0e1805635b2c10a3d41284d`，保留原版权和 MIT 许可。自定义指令、模型发现、提问目录和 Markdown 导出借鉴社区功能，本项目实现相应代码。[官方底座](https://github.com/deepseek-ai/chat-demo/tree/cdf9617c5f265d58e0e1805635b2c10a3d41284d) · [DeepsleepChat](https://github.com/NyaNyaMan/DeepsleepChat) · [Astra](https://github.com/Greenchannel/astra) · [Cherry Studio 移动版](https://github.com/CherryHQ/cherry-studio-app/releases/tag/v0.6.1)
