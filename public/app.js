const STORAGE_KEY = 'proxy-chat-studio-state-v4';
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
  variantIndex: document.getElementById('variantIndex'),
  systemPrompt: document.getElementById('systemPrompt'),
  assistantPrompt: document.getElementById('assistantPrompt'),
  sillyRegexRules: document.getElementById('sillyRegexRules'),
  messages: document.getElementById('messages'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  saveAssistantBtn: document.getElementById('saveAssistantBtn'),
  regenerateBtn: document.getElementById('regenerateBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFileInput: document.getElementById('importFileInput'),
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
  variantIndex: 1,
  systemPrompt: '你是一个专业且友好的中文 AI 助手。',
  assistantPrompt: '好的，我会先理解你的目标，再给你可执行的步骤。',
  sillyRegexRules: '/<think>[\\s\\S]*?<\\/think>/gi=>',
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
    state.variantIndex = Math.max(1, Number(state.variantIndex) || 1);
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
  elements.variantIndex.value = String(state.variantIndex);
  elements.systemPrompt.value = state.systemPrompt;
  elements.assistantPrompt.value = state.assistantPrompt;
  elements.sillyRegexRules.value = state.sillyRegexRules;
  renderModelOptions();
}

/**
 * 兼容 SillyTavern 常见正则规则格式，输出可执行规则数组。
 * 支持：
 * 1) `/pattern/flags=>replacement`
 * 2) `s/pattern/replacement/flags`
 * 3) JSON 数组（每项可含 `findRegex|pattern`, `replaceString|replace`, `flags`）
 * @param {string} rawRules
 */
function parseSillyTavernRegexRules(rawRules) {
  const text = String(rawRules || '').trim();
  if (!text) return [];

  if (text.startsWith('[')) {
    try {
      const list = JSON.parse(text);
      if (!Array.isArray(list)) return [];
      return list
        .map((item) => {
          const pattern = item?.findRegex || item?.pattern;
          const replacement = item?.replaceString ?? item?.replace ?? '';
          const flags = item?.flags || 'g';
          if (!pattern) return null;
          return { regex: new RegExp(pattern, flags), replacement: String(replacement) };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'));

  const rules = [];

  for (const line of lines) {
    const arrowMatch = line.match(/^\/(.*)\/([a-z]*)=>(.*)$/i);
    if (arrowMatch) {
      const [, pattern, flags, replacement] = arrowMatch;
      try {
        rules.push({ regex: new RegExp(pattern, flags || 'g'), replacement });
      } catch {
        // 忽略非法规则，保证整体流程不中断。
      }
      continue;
    }

    const sedMatch = line.match(/^s\/(.*)\/(.*)\/([a-z]*)$/i);
    if (sedMatch) {
      const [, pattern, replacement, flags] = sedMatch;
      try {
        rules.push({ regex: new RegExp(pattern, flags || 'g'), replacement });
      } catch {
        // 忽略非法规则，保证整体流程不中断。
      }
    }
  }

  return rules;
}

/**
 * 执行 SillyTavern 风格正则管线。
 * 会按规则顺序逐条替换 assistant 文本。
 * @param {string} rawText
 */
function applySillyTavernRegexPipeline(rawText) {
  let output = String(rawText || '');
  const rules = parseSillyTavernRegexRules(state.sillyRegexRules);
  for (const { regex, replacement } of rules) {
    output = output.replace(regex, replacement);
  }
  return output;
}

function createMessageNode(message) {
  const wrapper = document.createElement('article');
  wrapper.className = `msg ${message.role}`;

  const role = document.createElement('div');
  role.className = 'role';
  role.textContent = message.role;

  const content = document.createElement('div');
  content.textContent = message.role === 'assistant' ? applySillyTavernRegexPipeline(message.content) : message.content;

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
  if (state.systemPrompt.trim()) messages.push({ role: 'system', content: state.systemPrompt.trim() });
  if (state.assistantPrompt.trim()) messages.push({ role: 'assistant', content: state.assistantPrompt.trim() });
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
    ['sillyRegexRules', elements.sillyRegexRules]
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

  elements.variantIndex.addEventListener('input', () => {
    state.variantIndex = Math.max(1, Number(elements.variantIndex.value) || 1);
    elements.variantIndex.value = String(state.variantIndex);
    persistState();
  });
}

function appendMessage(role, content) {
  state.messages.push({ role, content });
  persistState();
  renderMessages();
}

function removeLastAssistantMessage() {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    if (state.messages[i].role === 'assistant') {
      state.messages.splice(i, 1);
      return true;
    }
  }
  return false;
}

function hasUserMessage() {
  return state.messages.some((msg) => msg.role === 'user');
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
    if (!response.ok) throw new Error(data.error || '模型列表获取失败');

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

async function sendMessageNonStream(payload, variantIndex) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      n: Math.max(1, variantIndex),
      choiceIndex: Math.max(1, variantIndex)
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  appendMessage('assistant', data.assistantMessage.content || '');
  setStatus(`完成(非流式)，第 ${data.selectedChoiceIndex || 1} 个结果 / 共 ${data.choicesCount || 1} 个`);
}

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
        setStatus('完成(流式)');
      }
    }
  }
}

function buildRequestPayload() {
  return {
    apiBase: state.apiBase.trim(),
    apiPath: state.apiPath.trim() || '/v1/chat/completions',
    apiKey: state.apiKey,
    model: state.model.trim(),
    messages: buildApiMessages()
  };
}

function validateContextBytes(payloadMessages) {
  const bytes = new TextEncoder().encode(JSON.stringify(payloadMessages)).length;
  if (bytes > MAX_CONTEXT_BYTES) {
    setStatus('上下文超过 50MB，发送已取消');
    return false;
  }
  return true;
}

async function doRequestWithCurrentContext(variantIndex) {
  const payload = buildRequestPayload();
  if (!validateContextBytes(payload.messages)) return;

  elements.sendBtn.disabled = true;
  elements.regenerateBtn.disabled = true;
  setStatus(state.useStream ? '流式请求中...' : '请求中...');

  try {
    if (state.useStream && variantIndex === 1) {
      await sendMessageStream(payload);
    } else {
      await sendMessageNonStream(payload, variantIndex);
    }
  } catch (error) {
    setStatus(`错误: ${error.message}`);
  } finally {
    elements.sendBtn.disabled = false;
    elements.regenerateBtn.disabled = false;
  }
}

async function sendMessage() {
  const content = elements.userInput.value.trim();
  if (!content) return;
  appendMessage('user', content);
  elements.userInput.value = '';
  await doRequestWithCurrentContext(state.variantIndex);
}

async function regenerateMessage() {
  if (!hasUserMessage()) {
    setStatus('没有可重生的用户消息');
    return;
  }

  removeLastAssistantMessage();
  persistState();
  renderMessages();
  await doRequestWithCurrentContext(state.variantIndex);
}

function insertAssistantMessageManually() {
  const content = window.prompt('请输入要插入的 assistant 消息：');
  if (!content || !content.trim()) return;
  appendMessage('assistant', content.trim());
  setStatus('已插入 assistant 消息');
}

function exportContext() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proxy-chat-context-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('上下文已导出');
}

async function importContextFromFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  // 只允许导入受控字段，避免污染运行态。
  const allowedKeys = [
    'apiBase',
    'apiPath',
    'modelsPath',
    'apiKey',
    'model',
    'useStream',
    'variantIndex',
    'systemPrompt',
    'assistantPrompt',
    'sillyRegexRules',
    'messages',
    'modelList'
  ];

  for (const key of allowedKeys) {
    if (key in parsed) state[key] = parsed[key];
  }

  state.variantIndex = Math.max(1, Number(state.variantIndex) || 1);
  if (!Array.isArray(state.messages)) state.messages = [];
  if (!Array.isArray(state.modelList)) state.modelList = [];

  persistState();
  syncFieldsFromState();
  renderMessages();
  setStatus('上下文已导入');
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
  elements.regenerateBtn.addEventListener('click', regenerateMessage);
  elements.refreshModelsBtn.addEventListener('click', refreshModels);
  elements.saveAssistantBtn.addEventListener('click', insertAssistantMessageManually);
  elements.exportBtn.addEventListener('click', exportContext);
  elements.importBtn.addEventListener('click', () => elements.importFileInput.click());
  elements.importFileInput.addEventListener('change', async () => {
    const file = elements.importFileInput.files?.[0];
    if (!file) return;
    try {
      await importContextFromFile(file);
    } catch (error) {
      setStatus(`导入失败: ${error.message}`);
    } finally {
      elements.importFileInput.value = '';
    }
  });
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
