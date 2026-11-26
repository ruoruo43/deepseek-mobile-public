# DS 对话

DS 对话是基于 DeepSeek API 的第三方 Android 对话客户端。首页、聊天、历史、附件和设置均提供简体中文界面，支持浅色和深色主题。

[下载 Android 正式版](https://github.com/ruoruo43/deepseek-mobile-public/releases/latest)

## 安装与更新

设备需运行 Android 8.0 或以上。安装 APK 后，填入自己的 DeepSeek API Key，点「验证并开始」。

打开连接页的「检查更新」或「设置 → GitHub 更新」，即可查询本项目的公开发行。检查更新无需 GitHub 账号和令牌。已安装 0.2.x 的用户，从上方链接下载 0.3.0 或更新版本，首次手动覆盖安装即可切换到公开更新源。

## 使用与数据

- 在顶栏切换可用模型。按模型能力使用深度思考、智能搜索、流式回答和图片输入。
- 在输入框使用系统拍照、相册和文件选择。选取或粘贴的附件会立即上传到 DeepSeek。
- 会话记录保存在本机，支持搜索、置顶和 ZIP 备份。DeepSeek API Key 用 Android Keystore 管理的密钥加密，备份不包含 API Key。
- 聊天和主动使用的语音功能连接 DeepSeek。检查更新时只读取 GitHub 的公开发行信息。
- 中文使用霞鹜文楷。通用设置提供四档字号和预览，西文优先使用设备已有的 Times New Roman，否则使用兼容字体 Tinos。可在本机导入已获授权的 TTF 或 OTF 字体。

## 开发

使用 Node.js 24 和 pnpm 11。

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm run type
pnpm run lint
pnpm run build
```

[配置 Android 签名及构建 APK](docs/ANDROID.md)

## 来源与许可

项目以 DeepSeek 的 [chat-demo](https://github.com/deepseek-ai/chat-demo/tree/cdf9617c5f265d58e0e1805635b2c10a3d41284d) 为基础，保留原版权声明。源码采用 [MIT 许可](LICENSE)，第三方依赖适用其各自的许可。

内置字库随应用分发，采用 SIL Open Font License 1.1。[霞鹜文楷轻便版 1.530](https://github.com/lxgw/LxgwWenKai-Lite/releases/tag/v1.530) · [本地许可](src/assets/fonts/LXGWWenKaiLite-OFL.txt) · [Tinos](https://github.com/googlefonts/tinos/tree/3b4482a99b80ea5fc75f187b1be3120a3f5905b3) · [本地许可](src/assets/fonts/Tinos-OFL.txt)
