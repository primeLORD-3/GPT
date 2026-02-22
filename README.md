# Proxy Chat Studio

一个可自由调用反向代理（OpenAI 兼容）的 AI 聊天工具，支持：

- 华丽的玻璃拟态前端界面
- 自由设置 `API Base URL` / `API Path` / `Model` / `API Key`
- 自由配置系统提示词（System Prompt）
- 手动插入 assistant 消息
- 即时自动存档上下文（localStorage）
- 一键导出上下文 JSON
- 上下文体积硬限制 50MB

## 使用方式（可直接用 Cursor 打开编辑）

1. 用 Cursor 打开当前项目目录。
2. 启动服务：

```bash
npm start
```

3. 浏览器访问：`http://localhost:3000`

## 目录结构

- `server.js`：Node HTTP 服务 + 反代请求转发
- `public/index.html`：页面结构
- `public/styles.css`：视觉样式
- `public/app.js`：前端逻辑（上下文管理、自动存档、导出等）

## 说明

- 该项目使用 Node.js 18+（依赖内置 `fetch`）。
- 这是一个本地开发工具，`API Key` 会保存在浏览器本地存储中，请在可信环境使用。
