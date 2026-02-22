const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_CONTEXT_BYTES = 50 * 1024 * 1024; // 50MB 上下文限制

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
 * 兼容两种输入方式：
 * 1) apiBase + 相对 apiPath（推荐）
 * 2) apiPath 直接填写完整 URL（当完整 URL 存在时优先使用它）
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

  const normalizedPath = (trimmedPath || '/v1/chat/completions').startsWith('/')
    ? (trimmedPath || '/v1/chat/completions')
    : `/${trimmedPath || '/v1/chat/completions'}`;

  return `${trimmedBase.replace(/\/$/, '')}${normalizedPath}`;
}

/**
 * 解析模型列表接口地址。可单独配置，便于适配不同反代实现。
 * @param {string} apiBase
 * @param {string} modelsPath
 */
function resolveModelsEndpoint(apiBase, modelsPath) {
  return resolveEndpoint(apiBase, modelsPath || '/v1/models');
}

/**
 * 将请求转发到用户配置的反代 Chat API。
 * 支持自定义 base URL + path，适配任意 OpenAI 兼容网关。
 * @param {any} body
 */
async function proxyChatRequest(body) {
  const {
    apiBase,
    apiPath = '/v1/chat/completions',
    apiKey,
    model,
    messages,
    temperature = 0.7
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

  const assistantMessage = payload?.choices?.[0]?.message;
  if (!assistantMessage) {
    throw new Error('上游返回中没有 choices[0].message');
  }

  return {
    assistantMessage,
    raw: payload,
    contextBytes
  };
}

/**
 * 拉取上游模型列表（/v1/models），用于前端模型选择。
 * @param {any} body
 */
async function proxyModelsRequest(body) {
  const { apiBase, modelsPath = '/v1/models', apiKey } = body;
  const endpoint = resolveModelsEndpoint(apiBase, modelsPath);

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
      sendJson(res, error.statusCode || 400, {
        error: error.message || '未知错误'
      });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/models') {
    try {
      const body = await readJsonBody(req);
      const result = await proxyModelsRequest(body);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, error.statusCode || 400, {
        error: error.message || '未知错误'
      });
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
  console.log(`Server is running on http://localhost:${PORT}`);
});
