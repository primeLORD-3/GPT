const STORAGE_KEY = 'proxy-chat-studio-state-v5';
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
  sillyRegexRules: document.getElementById('sillyRegexRules'),
  messages: document.getElementById('messages'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  saveAssistantBtn: document.getElementById('saveAssistantBtn'),
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
  systemPrompt: '你是一个专业且友好的中文 AI 助手。',
  assistantPrompt: '好的，我会先理解你的目标，再给你可执行的步骤。',
  sillyRegexRules: '<(thinking|think|analysis|internal)>[\\s\\S]*?<\\/(thinking|think|analysis|internal)>',
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
  elements.sillyRegexRules.value = state.sillyRegexRules;
  renderModelOptions();
}

/**
 * 兼容 SillyTavern 常见正则格式。
 * 支持：
 * 1) /pattern/flags=>replacement
 * 2) s/pattern/replacement/flags
 * 3) JSON数组规则
 * 4) 纯 regex（无分隔符），默认按 gi 且 replacement 为空（直接删除）
 * @param {string} rawRules
 * @returns {Array<{regex: RegExp, replacement: string}>}
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
      } catch {}
      continue;
    }

    const sedMatch = line.match(/^s\/(.*)\/(.*)\/([a-z]*)$/i);
    if (sedMatch) {
      const [, pattern, replacement, flags] = sedMatch;
      try {
        rules.push({ regex: new RegExp(pattern, flags || 'g'), replacement });
      } catch {}
      continue;
    }

    // 纯正则：例如 <(thinking)>[\s\S]*?<\/(thinking)>
    // 允许写成 /.../flags 也允许裸模式。
    const slashRegex = line.match(/^\/(.*)\/([a-z]*)$/i);
    if (slashRegex) {
      const [, pattern, flags] = slashRegex;
      try {
        rules.push({ regex: new RegExp(pattern, flags || 'gi'), replacement: '' });
      } catch {}
      continue;
    }

    try {
      rules.push({ regex: new RegExp(line, 'gi'), replacement: '' });
    } catch {
      // 忽略坏规则。
    }
  }

  return rules;
}

function applySillyTavernRegexPipeline(rawText) {
  let output = String(rawText || '');
  const rules = parseSillyTavernRegexRules(state.sillyRegexRules);
  for (const { regex, replacement } of rules) {
    output = output.replace(regex, replacement);
  }
  return output;
}

function buildApiMessages() {
  const messages = [];
  if (state.systemPrompt.trim()) messages.push({ role: 'system', content: state.systemPrompt.trim() });
  if (state.assistantPrompt.trim()) messages.push({ role: 'assistant', content: state.assistantPrompt.trim() });
  messages.push(...state.messages);
  return messages;
}

function renderContextInfo() {
  const bytes = new TextEncoder().encode(JSON.stringify(buildApiMessages())).length;
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  elements.contextInfo.textContent = `上下文大小: ${mb} MB / 50 MB`;
  elements.contextInfo.style.color = bytes > MAX_CONTEXT_BYTES ? '#ff8ea1' : '#c0c9f5';
}

function setStatus(text) {
  elements.status.textContent = text;
}

function renderModelOptions() {
  elements.modelOptions.innerHTML = '';
  for (const item of state.modelList || []) {
    const option = document.createElement('option');
    option.value = item;
    elements.modelOptions.append(option);
  }
}

function appendMessage(role, content) {
  state.messages.push({ role, content });
  persistState();
  renderMessages();
}

function removeAssistantAt(index) {
  state.messages.splice(index, 1);
}

function latestAssistantIndex() {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    if (state.messages[i].role === 'assistant') return i;
  }
  return -1;
}

/**
 * 基于当前消息数组重新渲染。
 * 仅在“最后一条 assistant 消息”底部显示“生成第X个结果”按钮，保持界面简洁。
 */
function renderMessages() {
  elements.messages.innerHTML = '';

  if (state.systemPrompt.trim()) {
    elements.messages.append(createMessageNode({ role: 'system', content: state.systemPrompt.trim() }));
  }
  if (state.assistantPrompt.trim()) {
    elements.messages.append(createMessageNode({ role: 'assistant_prompt', content: state.assistantPrompt.trim() }));
  }

  const latestAssistant = latestAssistantIndex();

  state.messages.forEach((msg, idx) => {
    const node = createMessageNode(msg, idx === latestAssistant ? idx : -1);
    elements.messages.append(node);
  });

  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function createMessageNode(message, assistantIndex = -1) {
  const wrapper = document.createElement('article');
  wrapper.className = `msg ${message.role}`;

  const role = document.createElement('div');
  role.className = 'role';
  role.textContent = message.role;

  const content = document.createElement('div');
  content.textContent = message.role === 'assistant' ? applySillyTavernRegexPipeline(message.content) : message.content;

  wrapper.append(role, content);

  if (message.role === 'assistant' && assistantIndex >= 0) {
    const footer = document.createElement('div');
    footer.className = 'msg-footer';

    const nInput = document.createElement('input');
    nInput.type = 'number';
    nInput.min = '1';
    nInput.step = '1';
    nInput.value = '2';
    nInput.className = 'mini-input';

    const btn = document.createElement('button');
    btn.className = 'secondary tiny-btn';
    btn.textContent = '生成第X个结果';
    btn.addEventListener('click', async () => {
      const target = Math.max(1, Number(nInput.value) || 1);
      await regenerateFromAssistant(assistantIndex, target);
    });

    footer.append(nInput, btn);
    wrapper.append(footer);
  }

  return wrapper;
}

function validateContextBytes(payloadMessages) {
  const bytes = new TextEncoder().encode(JSON.stringify(payloadMessages)).length;
  if (bytes > MAX_CONTEXT_BYTES) {
    setStatus('上下文超过 50MB，发送已取消');
    return false;
  }
  return true;
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

async function doRequestWithCurrentContext(variantIndex) {
  const payload = buildRequestPayload();
  if (!validateContextBytes(payload.messages)) return;

  elements.sendBtn.disabled = true;
  setStatus(state.useStream && variantIndex === 1 ? '流式请求中...' : '请求中...');

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
  }
}

async function sendMessage() {
  const content = elements.userInput.value.trim();
  if (!content) return;
  appendMessage('user', content);
  elements.userInput.value = '';
  await doRequestWithCurrentContext(1);
}

/**
 * 从某条 assistant 气泡触发“第X个结果重生”。
 * 位置：该气泡左下角按钮。
 */
async function regenerateFromAssistant(assistantIndex, variantIndex) {
  if (assistantIndex < 0 || assistantIndex >= state.messages.length) return;

  // 保留到该 assistant 前一条消息为止，随后重新请求。
  state.messages = state.messages.slice(0, assistantIndex);
  persistState();
  renderMessages();
  await doRequestWithCurrentContext(variantIndex);
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
  const allowedKeys = [
    'apiBase', 'apiPath', 'modelsPath', 'apiKey', 'model', 'useStream',
    'systemPrompt', 'assistantPrompt', 'sillyRegexRules', 'messages', 'modelList'
  ];
  for (const key of allowedKeys) {
    if (key in parsed) state[key] = parsed[key];
  }
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
}

function bindEvents() {
  bindInputPersistence();
  elements.sendBtn.addEventListener('click', sendMessage);
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
