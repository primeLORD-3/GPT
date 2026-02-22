# Proxy Chat Studio

一个可自由调用反向代理（OpenAI 兼容）的 AI 聊天工具，支持：

- 自定义 OpenAI 兼容网关（可配 `API Base URL`、Chat API Path、Models API Path）
- 两套提示词：`System Prompt` + `Assistant Prompt`
- 获取反代模型列表并自动填充 Model 候选
- 手动插入 assistant 消息
- 即时自动存档上下文（localStorage）
- 一键导出上下文 JSON
- 上下文体积硬限制 50MB

## 快速开始（Cursor）

```bash
npm install
npm start
```

浏览器访问：`http://localhost:3000`

## 使用文档

完整文档见：`docs/使用文档.md`

## 自定义 OpenAI 兼容说明

你可以按下面两种方式配置上游：

- 方式 A（推荐）
  - `API Base URL`: `https://your-proxy.example.com`
  - `Chat API Path`: `/v1/chat/completions`
  - `Models API Path`: `/v1/models`
- 方式 B（完整 URL）
  - `API Base URL`: 留空
  - `Chat API Path`: `https://your-proxy.example.com/v1/chat/completions`
  - `Models API Path`: `https://your-proxy.example.com/v1/models`

## “assistant 在哪里改？”

- 页面里直接改：左侧 `Assistant Prompt`。
- 代码里改：`public/app.js`
  - 默认 assistant 提示词：`state.assistantPrompt`
  - 拼装到上游消息：`buildApiMessages()`
  - 手动插入 assistant：`insertAssistantMessageManually()`
