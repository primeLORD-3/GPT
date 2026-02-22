const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_CONTEXT_BYTES = 50 * 1024 * 1024; // 50MB 上下文限制

/**
 * 打印统一格式的后端日志，方便在控制台排查问题。
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} message
 * @param {Record<string, any>} [extra]
 */
function log(level, message, extra = {}) {
  const time = new Date().toISOString();
  console.log(`[${time}] [${level}] ${message}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`);
}

/**
 * 从请求体中读取 JSON 数据。
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<any>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_CONTEXT_BYTES + 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(new Error('JSON 解析失败'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * 写入 JSON 响应，确保所有接口返回统一格式。
 * @param {import('http').ServerResponse} res
 * @param {number} statusCode
 * @param {any} payload
 */
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

/**
 * 向浏览器发送 SSE 数据帧。
 * @param {import('http').ServerResponse} res
 * @param {string} event
 * @param {any} data
 */
function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 静态文件服务。
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath);
    const mimeMap = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8'
    };

    res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'text/plain; charset=utf-8' });
    res.end(content);
  });
}

/**
 * 解析上游请求地址。
 * @param {string} apiBase
 * @param {string} apiPath
 */
function resolveEndpoint(apiBase, apiPath) {
  const trimmedBase = (apiBase || '').trim();
  const trimmedPath = (apiPath || '').trim();

  if (/^https?:\/\//i.test(trimmedPath)) {
    return trimmedPath;
  }

  if (!trimmedBase) {
    throw new Error('缺少 apiBase，或将完整 URL 填写到 apiPath');
  }

  const defaultPath = '/v1/chat/completions';
  const rawPath = trimmedPath || defaultPath;
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  return `${trimmedBase.replace(/\/$/, '')}${normalizedPath}`;
}

/**
 * 将请求转发到用户配置的反代 Chat API（非流式）。
 * @param {any} body
 */
async function proxyChatRequest(body) {
  const {
    apiBase,
    apiPath = '/v1/chat/completions',
    apiKey,
    model,
    messages,
    temperature = 0.7,
    n = 1,
    choiceIndex = 1
  } = body;

  if (!model || !Array.isArray(messages)) {
    throw new Error('缺少必要参数 model/messages');
  }

  const contextBytes = Buffer.byteLength(JSON.stringify(messages), 'utf8');
  if (contextBytes > MAX_CONTEXT_BYTES) {
    const error = new Error(`上下文超过 50MB 限制，当前大小 ${(contextBytes / (1024 * 1024)).toFixed(2)}MB`);
    error.statusCode = 413;
    throw error;
  }

  const endpoint = resolveEndpoint(apiBase, apiPath);
  const safeN = Math.max(1, Number(n) || 1);
  const safeChoiceIndex = Math.max(1, Number(choiceIndex) || 1);

  log('INFO', '发送非流式请求', { endpoint, model, contextBytes, n: safeN, choiceIndex: safeChoiceIndex });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      n: safeN,
      stream: false
    })
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`上游返回了非 JSON 数据，通常是接口地址填错或网关未返回 OpenAI JSON。片段: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    const err = new Error(payload?.error?.message || `上游错误 ${response.status}`);
    err.statusCode = response.status;
    throw err;
  }

  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const selected = choices[safeChoiceIndex - 1] || choices[0];
  const assistantMessage = selected?.message;
  if (!assistantMessage) {
    throw new Error('上游返回中没有可用的 choices.message');
  }

  log('INFO', '非流式请求完成', {
    upstreamStatus: response.status,
    preview: String(assistantMessage.content || '').slice(0, 120)
  });

  return {
    assistantMessage,
    raw: payload,
    contextBytes,
    choicesCount: choices.length,
    selectedChoiceIndex: choices[safeChoiceIndex - 1] ? safeChoiceIndex : 1
  };
}

/**
 * 将上游 SSE 流转发给前端。
 * 前端可用 fetch + ReadableStream 实现实时打字效果。
 * @param {any} body
 * @param {import('http').ServerResponse} res
 */
async function proxyChatStream(body, res) {
  const {
    apiBase,
    apiPath = '/v1/chat/completions',
    apiKey,
    model,
    messages,
    temperature = 0.7,
    n = 1,
    choiceIndex = 1
  } = body;

  if (!model || !Array.isArray(messages)) {
    throw new Error('缺少必要参数 model/messages');
  }

  const contextBytes = Buffer.byteLength(JSON.stringify(messages), 'utf8');
  if (contextBytes > MAX_CONTEXT_BYTES) {
    const error = new Error(`上下文超过 50MB 限制，当前大小 ${(contextBytes / (1024 * 1024)).toFixed(2)}MB`);
    error.statusCode = 413;
    throw error;
  }

  const endpoint = resolveEndpoint(apiBase, apiPath);
  log('INFO', '发送流式请求', { endpoint, model, contextBytes });

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ model, messages, temperature, stream: true })
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    throw new Error(`流式上游错误 ${upstream.status}: ${text.slice(0, 300)}`);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const decoder = new TextDecoder();
  let buffer = '';
  let finalContent = '';

  for await (const chunk of upstream.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const data = trimmed.replace(/^data:\s*/, '');
      if (data === '[DONE]') {
        sendSse(res, 'done', { content: finalContent, contextBytes });
        log('INFO', '流式请求完成', { preview: finalContent.slice(0, 120) });
        res.end();
        return;
      }

      try {
        const payload = JSON.parse(data);
        const delta = payload?.choices?.[0]?.delta?.content || '';
        if (delta) {
          finalContent += delta;
          sendSse(res, 'token', { token: delta });
        }
      } catch {
        // 某些网关可能插入非 JSON 行，直接忽略，保证流不中断。
      }
    }
  }

  sendSse(res, 'done', { content: finalContent, contextBytes });
  res.end();
}

/**
 * 拉取上游模型列表（/v1/models），用于前端模型选择。
 * @param {any} body
 */
async function proxyModelsRequest(body) {
  const { apiBase, modelsPath = '/v1/models', apiKey } = body;
  const endpoint = resolveEndpoint(apiBase, modelsPath);
  log('INFO', '拉取模型列表', { endpoint });

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    }
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`模型列表接口返回了非 JSON 数据。片段: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    const err = new Error(payload?.error?.message || `模型列表上游错误 ${response.status}`);
    err.statusCode = response.status;
    throw err;
  }

  const models = Array.isArray(payload?.data)
    ? payload.data.map((item) => item?.id).filter(Boolean)
    : [];

  log('INFO', '模型列表获取完成', { count: models.length });

  return {
    models,
    raw: payload
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const body = await readJsonBody(req);
      const result = await proxyChatRequest(body);
      sendJson(res, 200, result);
    } catch (error) {
      log('ERROR', '非流式请求失败', { message: error.message });
      sendJson(res, error.statusCode || 400, { error: error.message || '未知错误' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat/stream') {
    try {
      const body = await readJsonBody(req);
      await proxyChatStream(body, res);
    } catch (error) {
      log('ERROR', '流式请求失败', { message: error.message });
      sendJson(res, error.statusCode || 400, { error: error.message || '未知错误' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/models') {
    try {
      const body = await readJsonBody(req);
      const result = await proxyModelsRequest(body);
      sendJson(res, 200, result);
    } catch (error) {
      log('ERROR', '模型列表请求失败', { message: error.message });
      sendJson(res, error.statusCode || 400, { error: error.message || '未知错误' });
    }
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  log('INFO', `Server is running on http://localhost:${PORT}`);
});
