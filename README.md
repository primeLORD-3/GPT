# Proxy Chat Studio

一个可自由调用反向代理（OpenAI 兼容）的 AI 聊天工具，支持：

- 华丽的玻璃拟态前端界面
- 自由设置 `API Base URL` / `API Path` / `Model` / `API Key`
- 自由配置系统提示词（System Prompt）
- 手动插入 assistant 消息
- 即时自动存档上下文（localStorage）
- 一键导出上下文 JSON
- 上下文体积硬限制 50MB

## 快速开始（Cursor）

1. 用 Cursor 打开本项目目录。
2. 安装并启动：

```bash
npm install
npm start
```

3. 浏览器访问：`http://localhost:3000`

## 使用文档

完整文档见：`docs/使用文档.md`

## 目录结构

- `server.js`：Node HTTP 服务 + 反代请求转发
- `public/index.html`：页面结构
- `public/styles.css`：视觉样式
- `public/app.js`：前端逻辑（上下文管理、自动存档、导出等）
- `docs/使用文档.md`：中文使用文档（含常见报错与排查）

## 常见问题（重点）

### 1）为什么出现“上游返回了非 JSON 数据”

这通常是因为你把完整 URL 同时填在了 `API Base URL` 和 `API Path`，拼接后地址错误，服务端返回了 HTML 页面而不是 OpenAI JSON。

现在程序支持两种写法：

- 写法 A（推荐）
  - `API Base URL`: `https://your-proxy.example.com`
  - `API Path`: `/v1/chat/completions`
- 写法 B（完整 URL）
  - `API Base URL`: 留空
  - `API Path`: `https://your-proxy.example.com/v1/chat/completions`

### 2）“在哪个文件夹更改 assistant？”

- **日常使用**：在网页左侧点击“插入 assistant 消息”按钮即可。
- **改默认行为/逻辑**：编辑 `public/app.js`。
  - 默认系统提示词：`state.systemPrompt`
  - 插入 assistant 消息逻辑：`insertAssistantMessageManually()`

## 说明

- 该项目使用 Node.js 18+（依赖内置 `fetch`）。
- 这是一个本地开发工具，`API Key` 会保存在浏览器本地存储中，请在可信环境使用。
