const STORAGE_KEY = 'proxy-chat-studio-state-v3';
const MAX_CONTEXT_BYTES = 50 * 1024 * 1024;

const elements = {
  apiBase: document.getElementById('apiBase'),
  apiPath: document.getElementById('apiPath'),
  modelsPath: document.getElementById('modelsPath'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  modelOptions: document.getElementById('modelOptions'),
  refreshModelsBtn: document.getElementById('refreshModelsBtn'),
  streamMode: document.getElementById('streamMode'),
  systemPrompt: document.getElementById('systemPrompt'),
  assistantPrompt: document.getElementById('assistantPrompt'),
  hiddenTagRegex: document.getElementById('hiddenTagRegex'),
  messages: document.getElementById('messages'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  saveAssistantBtn: document.getElementById('saveAssistantBtn'),
  exportBtn: document.getElementById('exportBtn'),
  clearBtn: document.getElementById('clearBtn'),
  status: document.getElementById('status'),
  contextInfo: document.getElementById('contextInfo')
};

const state = {
  apiBase: '',
  apiPath: '/v1/chat/completions',
  modelsPath: '/v1/models',
  apiKey: '',
  model: 'gpt-4o-mini',
  useStream: true,
  systemPrompt: '你是一个专业且友好的中文 AI 助手。',
  assistantPrompt: '好的，我会先理解你的目标，再给你可执行的步骤。',
  hiddenTagRegex: 'think|analysis|internal',
  messages: [],
  modelList: []
};

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderContextInfo();
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    Object.assign(state, JSON.parse(saved));
  } catch (error) {
    console.warn('读取本地存档失败，使用默认配置', error);
  }
}

function syncFieldsFromState() {
  elements.apiBase.value = state.apiBase;
  elements.apiPath.value = state.apiPath;
  elements.modelsPath.value = state.modelsPath;
  elements.apiKey.value = state.apiKey;
  elements.model.value = state.model;
  elements.streamMode.checked = Boolean(state.useStream);
  elements.systemPrompt.value = state.systemPrompt;
  elements.assistantPrompt.value = state.assistantPrompt;
  elements.hiddenTagRegex.value = state.hiddenTagRegex;
  renderModelOptions();
}

/**
 * 正则标签渲染系统：
 * - 标签格式：<tag>内容</tag>
 * - 若 tag 命中 hiddenTagRegex，则内容不展示
 * - 未命中的标签保留其内部文本并去掉标签本身
 * @param {string} rawText
 */
function applyTagRenderRules(rawText) {
  const text = String(rawText || '');
  if (!text.includes('<')) return text;

  let hiddenRegex;
  try {
    hiddenRegex = new RegExp(`^(?:${state.hiddenTagRegex || ''})$`, 'i');
  } catch {
    hiddenRegex = /^$/;
  }

  return text.replace(/<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g, (_, tagName, content) => {
    if (hiddenRegex.test(tagName)) {
      return '';
    }
    return content;
  });
}

function createMessageNode(message) {
  const wrapper = document.createElement('article');
  wrapper.className = `msg ${message.role}`;

  const role = document.createElement('div');
  role.className = 'role';
  role.textContent = message.role;

  const content = document.createElement('div');
  content.textContent = message.role === 'assistant' ? applyTagRenderRules(message.content) : message.content;

  wrapper.append(role, content);
  return wrapper;
}

function renderMessages() {
  elements.messages.innerHTML = '';

  if (state.systemPrompt.trim()) {
    elements.messages.append(createMessageNode({ role: 'system', content: state.systemPrompt.trim() }));
  }

  if (state.assistantPrompt.trim()) {
    elements.messages.append(createMessageNode({ role: 'assistant_prompt', content: state.assistantPrompt.trim() }));
  }

  for (const msg of state.messages) {
    elements.messages.append(createMessageNode(msg));
  }

  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function renderContextInfo() {
  const assembled = buildApiMessages();
  const bytes = new TextEncoder().encode(JSON.stringify(assembled)).length;
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  elements.contextInfo.textContent = `上下文大小: ${mb} MB / 50 MB`;
  elements.contextInfo.style.color = bytes > MAX_CONTEXT_BYTES ? '#ff8ea1' : '#c0c9f5';
}

function setStatus(text) {
  elements.status.textContent = text;
}

function buildApiMessages() {
  const messages = [];
  if (state.systemPrompt.trim()) {
    messages.push({ role: 'system', content: state.systemPrompt.trim() });
  }
  if (state.assistantPrompt.trim()) {
    messages.push({ role: 'assistant', content: state.assistantPrompt.trim() });
  }
  messages.push(...state.messages);
  return messages;
}

function renderModelOptions() {
  elements.modelOptions.innerHTML = '';
  for (const item of state.modelList || []) {
    const option = document.createElement('option');
    option.value = item;
    elements.modelOptions.append(option);
  }
}

function bindInputPersistence() {
  const fieldMapping = [
    ['apiBase', elements.apiBase],
    ['apiPath', elements.apiPath],
    ['modelsPath', elements.modelsPath],
    ['apiKey', elements.apiKey],
    ['model', elements.model],
    ['systemPrompt', elements.systemPrompt],
    ['assistantPrompt', elements.assistantPrompt],
    ['hiddenTagRegex', elements.hiddenTagRegex]
  ];

  for (const [key, element] of fieldMapping) {
    element.addEventListener('input', () => {
      state[key] = element.value;
      persistState();
      renderMessages();
    });
  }

  elements.streamMode.addEventListener('change', () => {
    state.useStream = elements.streamMode.checked;
    persistState();
  });
}

function appendMessage(role, content) {
  state.messages.push({ role, content });
  persistState();
  renderMessages();
}

async function refreshModels() {
  setStatus('正在拉取模型列表...');
  elements.refreshModelsBtn.disabled = true;

  try {
    const response = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiBase: state.apiBase.trim(),
        modelsPath: state.modelsPath.trim() || '/v1/models',
        apiKey: state.apiKey
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '模型列表获取失败');
    }

    state.modelList = data.models || [];
    renderModelOptions();

    if (state.modelList.length > 0 && !state.modelList.includes(state.model)) {
      state.model = state.modelList[0];
      elements.model.value = state.model;
    }

    persistState();
    setStatus(`模型列表获取成功，共 ${state.modelList.length} 个`);
  } catch (error) {
    setStatus(`模型列表错误: ${error.message}`);
  } finally {
    elements.refreshModelsBtn.disabled = false;
  }
}

async function sendMessageNonStream(payload) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  appendMessage('assistant', data.assistantMessage.content || '');
  setStatus(`完成(非流式)，上下文 ${(data.contextBytes / (1024 * 1024)).toFixed(2)}MB`);
}

/**
 * 使用后端 SSE 进行流式渲染。
 * 后端事件：
 * - token: 单个增量 token
 * - done: 全量完成
 */
async function sendMessageStream(payload) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '流式请求失败');
  }

  appendMessage('assistant', '');
  const assistantIndex = state.messages.length - 1;

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';

    for (const frame of frames) {
      const eventLine = frame.split('\n').find((line) => line.startsWith('event:'));
      const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
      if (!eventLine || !dataLine) continue;

      const eventName = eventLine.replace('event:', '').trim();
      const payloadJson = JSON.parse(dataLine.replace('data:', '').trim());

      if (eventName === 'token') {
        full += payloadJson.token || '';
        state.messages[assistantIndex].content = full;
        renderMessages();
      }

      if (eventName === 'done') {
        state.messages[assistantIndex].content = payloadJson.content || full;
        persistState();
        renderMessages();
        setStatus(`完成(流式)，上下文 ${(payloadJson.contextBytes / (1024 * 1024)).toFixed(2)}MB`);
      }
    }
  }
}

async function sendMessage() {
  const content = elements.userInput.value.trim();
  if (!content) return;

  appendMessage('user', content);
  elements.userInput.value = '';

  const payload = {
    apiBase: state.apiBase.trim(),
    apiPath: state.apiPath.trim() || '/v1/chat/completions',
    apiKey: state.apiKey,
    model: state.model.trim(),
    messages: buildApiMessages()
  };

  const bytes = new TextEncoder().encode(JSON.stringify(payload.messages)).length;
  if (bytes > MAX_CONTEXT_BYTES) {
    setStatus('上下文超过 50MB，发送已取消');
    return;
  }

  elements.sendBtn.disabled = true;
  setStatus(state.useStream ? '流式请求中...' : '请求中...');

  try {
    if (state.useStream) {
      await sendMessageStream(payload);
    } else {
      await sendMessageNonStream(payload);
    }
  } catch (error) {
    setStatus(`错误: ${error.message}`);
  } finally {
    elements.sendBtn.disabled = false;
  }
}

function insertAssistantMessageManually() {
  const content = window.prompt('请输入要插入的 assistant 消息：');
  if (!content || !content.trim()) return;
  appendMessage('assistant', content.trim());
  setStatus('已插入 assistant 消息');
}

function exportContext() {
  const blob = new Blob([
    JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)
  ], { type: 'application/json' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proxy-chat-context-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('上下文已导出');
}

function clearContext() {
  if (!window.confirm('确定要清空全部上下文吗？')) return;
  state.messages = [];
  persistState();
  renderMessages();
  setStatus('上下文已清空');
}

function bindEvents() {
  bindInputPersistence();

  elements.sendBtn.addEventListener('click', sendMessage);
  elements.refreshModelsBtn.addEventListener('click', refreshModels);
  elements.saveAssistantBtn.addEventListener('click', insertAssistantMessageManually);
  elements.exportBtn.addEventListener('click', exportContext);
  elements.clearBtn.addEventListener('click', clearContext);

  elements.userInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      sendMessage();
    }
  });
}

function init() {
  loadState();
  syncFieldsFromState();
  renderMessages();
  renderContextInfo();
  bindEvents();
}

init();
