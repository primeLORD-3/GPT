# Proxy Chat Studio

一个可自由调用反向代理（OpenAI 兼容）的 AI 聊天工具，支持：

- 自定义 OpenAI 兼容网关（`API Base URL`、`Chat API Path`、`Models API Path`）
- 两套提示词：`System Prompt` + `Assistant Prompt`
- 流式传输（SSE）与非流式两种模式
- 反代模型列表发现（`/v1/models`）
- **上下文导出 + 导入**
- **重新生成**（支持生成“第 X 个不同结果”）
- **SillyTavern 正则兼容格式**（多格式规则）
- 后端控制台日志：可看到请求地址、模型、返回预览、错误信息
- 手动插入 assistant 消息
- 即时自动存档上下文（localStorage）
- 上下文体积硬限制 50MB

## 快速开始

```bash
npm install
npm start
```

浏览器访问：`http://localhost:3000`

## 使用文档

完整文档见：`docs/使用文档.md`

## assistant 在哪里改

- 页面里：左侧 `Assistant Prompt`。
- 代码里：`public/app.js`
  - 默认 assistant 提示词：`state.assistantPrompt`
  - 注入逻辑：`buildApiMessages()`
  - 手动插入：`insertAssistantMessageManually()`
