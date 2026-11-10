# DSH MonkeyAI 会话

[English](README.md) | 简体中文

在 DeepSeek Harness 里读取并继续你的 MonkeyAI 对话。

浏览 MonkeyAI 设备上的会话，打开任意一个查看完整对话历史，直接下发新指令接着做之前在 MonkeyAI 客户端上的工作——不用复制上下文，不用重新起任务。回复实时流式返回，还能在 DSH 里停止正在执行的回合、切换模型。

授权走 MonkeyAI 的 OAuth 授权码 + PKCE 流程，拿到的凭证由 DSH 存进自己的凭证库。

## 安装

从 npm 安装：

```sh
dsh plugin --profile web add dsh-monkeyai-sessions
```

从插件市场索引安装：在 **插件 → 实验性插件** 中打开 **自定义插件索引**，进入 **发现** 页添加索引源：

```
https://artenx.github.io/dsh-monkeyai-sessions/index.json
```

从源码安装：

```sh
npm install
npm run build
npm pack
dsh plugin --profile web add ./dsh-monkeyai-sessions-0.1.10.tgz
```

已在真实的 DSH `0.2.2-rc.1` web profile 与在线 MonkeyAI runtime 上端到端验证：授权、完整历史加载、指令下发、模型切换、回合取消均正常工作。

## 连接账号

三种方式，按便利程度排序：

- **账号登录（默认）**：在面板里填 MonkeyAI 服务器地址、账号邮箱和密码。整个 OAuth 流程由 Host 侧完成——登录、发起授权请求、批准、用返回的 code 换 token——浏览器不需要回传任何东西。**手机或任何非 Host 本机的浏览器只能用这种方式。** 密码仅用于这几次请求，不做任何存储，登录成功后面板立即清空输入框。
- **浏览器授权（loopback）**：Host 在 `127.0.0.1` 随机端口监听，MonkeyAI 服务器重定向到 `http://127.0.0.1:<port>/oauth/callback`。当浏览器与 Host 在同一台机器上时，回调页会把 code 通过 postMessage 发回面板，自动完成授权，无需粘贴。远程浏览器访问不到这个 loopback 地址，此时请改用账号登录。
- **粘贴回调（scheme）**：原始的 `monkeyai-desktop://oauth/callback` 重定向，用于 loopback 被拒绝的环境。

三种方式都通过已注册的 `monkeyai-desktop` 公共客户端申请 `device:connect`、`session:read`、`session:control` 权限。OAuth state 与 PKCE verifier 始终留在 DSH Host 进程内。

## 会话能力

完整对话历史通过 runtime 的 HTTP 读取通道加载（`POST {http_base}/read/session`，方法 `_monkeyai/session/messages`，按游标翻页），而不是 ACP `session/load` 的有界回放，因此长会话能看到每一轮内容，包括最新回复。会话使用与 MonkeyAI 客户端相同的 `historyHTTP` 能力挂载后，面板会订阅 ACP 实时更新：在 MonkeyAI 桌面客户端发起的用户消息和助手回复都会边生成边显示，无需刷新。对于 runtime 先持久化再通知的超大回复，收到 `history_changed` 后会按游标增量读取，并用完整快照补齐部分内容。

会话标题旁会显示会话状态徽章（进行中 / 空闲 / 出错 / 已中断），数据来自 runtime 广播的 `_monkeyai/session/state` 通知，因此由 MonkeyAI 桌面客户端发起的回合同样会显示为「进行中」——打开面板时如果回合已经在跑，Host 会主动读取一次当前状态补齐。回合执行期间（无论哪一端发起）输入框旁会显示停止按钮，点击发送 `session/cancel`；模型切换在会话自己的连接上调用 `_monkeyai/session/model/set`。助手消息支持轻量 Markdown 渲染（代码块、行内代码、粗体、标题、列表）。

## 界面说明

面板采用 DSH 浅色主题，按状态切换布局：

- **未连接**：一张登录卡片（服务器地址 + 账号密码 + 主按钮），浏览器授权方式折叠收起
- **已连接**：会话卡片上方是紧凑工具栏（账号、设备、一个刷新按钮同时加载设备与会话、断开连接）
- **会话中**：紧凑会话头（返回、标题、模型切换）、审批卡片用普通选项按钮而非原始 JSON、回车发送的输入框

次要操作（按 machine ID 手动添加设备、新建会话）都收在折叠区里。

设备列表读取账号级的 endpoint 目录（`GET /api/v1/endpoints`），因此所有已注册设备都会出现，在线状态取自 `status` 字段，已撤销的条目会被跳过。选中设备后自动加载其会话。通过独立设备码授权注册的 headless runtime 可能不在该目录里，这类设备可在面板「找不到设备？」区域按 machine ID 手动添加，条目保存在浏览器本地存储并合并进设备选择器。

## 开发

插件面向 DSH `v0.2.2-rc.1` 与 Node.js `>=24.9.0`。

```sh
npm test
npm run build
```

`npm test` 会先构建 Client bundle 再跑测试。构建产出 `client.js` 与 `lib/client-runtime.cjs`，两者都随包分发。

测试会加载生成的 Client bundle，校验一元与双向流描述符，检查 `main` 与 `sidebar.panellist` 注册，验证卸载时流与 Remote 的清理，并测试 PKCE state/challenge 构造。Host 服务与 Host 流测试用凭证库、fetch、WebSocket 的替身覆盖授权交换、设备/会话作用域、连接票据、历史与实时帧、指令投递、连接中断、权限撤销、只读拒绝等场景。

Host 通过 `ctx.typert` 注册调用描述符，Client 用 `$mount()` 挂载包的 Remote 贡献。共享的 Remote 元数据使用协议包的 `remote-info` 入口，它不引入 Cordis 运行时。Client bundle 内联了该工厂的规范兼容副本（`src/shared/remote-info-lite.mjs`）：DSH 只实例化 `dsh.client.inject` 中列出的模块，协议包的子路径入口不在其种子词表内。

## 发布

包声明了 DSH bundle（`dsh.bundle.patch`）、web Client（`dsh.client`）与 `engines.dsh`。Host 提供的模块通过运行中的 DSH 安装解析，因此唯一的 peer 依赖是 `@deepseek-ai/cordis`。

```sh
# 构建 Client bundle 与市场索引
npm run build
npm run build:market

# 发布（需要有发布权限的 npm 账号）
npm publish --access public
```

`scripts/build-market-index.mjs` 从 npm registry 读取已发布版本及其发布时间，首次发布前回退到当前 `package.json` 版本。生成的 `market/index.json` 遵循插件市场索引 format 1，由 `.github/workflows/market-index.yml` 部署到 GitHub Pages。设置 `MARKET_INDEX_URL` 可覆盖打印出的索引地址。

## 许可

MIT
