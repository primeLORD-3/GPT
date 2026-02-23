# Proxy Chat Studio

一个可自由调用反向代理（OpenAI 兼容）的 AI 聊天工具，支持：

- 自定义 OpenAI 兼容网关（`API Base URL`、`Chat API Path`、`Models API Path`）
- 两套提示词：`System Prompt` + `Assistant Prompt`
- 流式传输（SSE）与非流式两种模式
- 反代模型列表发现（`/v1/models`）
- 上下文导出 + 导入
- SillyTavern 正则兼容（含纯 regex 行）
- 后端控制台日志（请求、结果、错误）
- 重新生成第 X 个结果（按钮位于最后一条 assistant 气泡左下角）
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
