const STORAGE_KEY = 'proxy-chat-studio-state-v2';
const MAX_CONTEXT_BYTES = 50 * 1024 * 1024;

const elements = {
  apiBase: document.getElementById('apiBase'),
  apiPath: document.getElementById('apiPath'),
  modelsPath: document.getElementById('modelsPath'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  modelOptions: document.getElementById('modelOptions'),
  refreshModelsBtn: document.getElementById('refreshModelsBtn'),
  systemPrompt: document.getElementById('systemPrompt'),
  assistantPrompt: document.getElementById('assistantPrompt'),
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
  systemPrompt: '你是一个专业且友好的中文 AI 助手。',
  assistantPrompt: '好的，我会先理解你的目标，再给你可执行的步骤。',
  messages: [],
  modelList: []
};

/**
 * 将状态同步到 localStorage，确保刷新页面也不会丢上下文。
 */
function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderContextInfo();
}

/**
 * 初始化状态，优先从本地持久化读取。
 */
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    Object.assign(state, parsed);
  } catch (error) {
    console.warn('读取本地存档失败，使用默认配置', error);
  }
}

/**
 * 将当前 state 渲染到 UI 控件。
 */
function syncFieldsFromState() {
  elements.apiBase.value = state.apiBase;
  elements.apiPath.value = state.apiPath;
  elements.modelsPath.value = state.modelsPath;
  elements.apiKey.value = state.apiKey;
  elements.model.value = state.model;
  elements.systemPrompt.value = state.systemPrompt;
  elements.assistantPrompt.value = state.assistantPrompt;
  renderModelOptions();
}

/**
 * 根据消息角色创建消息节点。
 * @param {{role: string, content: string}} message
 */
function createMessageNode(message) {
  const wrapper = document.createElement('article');
  wrapper.className = `msg ${message.role}`;

  const role = document.createElement('div');
  role.className = 'role';
  role.textContent = message.role;

  const content = document.createElement('div');
  content.textContent = message.content;

  wrapper.append(role, content);
  return wrapper;
}

/**
 * 重新渲染整个消息区。
 */
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

/**
 * 计算并展示上下文字节占用。
 */
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

/**
 * 组装发给上游 OpenAI 兼容接口的消息数组。
 * 这里支持“两套提示词”：
 * - systemPrompt -> role=system
 * - assistantPrompt -> role=assistant（预置助手行为）
 */
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
    ['assistantPrompt', elements.assistantPrompt]
  ];

  for (const [key, element] of fieldMapping) {
    element.addEventListener('input', () => {
      state[key] = element.value;
      persistState();
      renderMessages();
    });
  }
}

/**
 * 添加一条消息并即时存档。
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
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
  setStatus('请求中...');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }

    appendMessage('assistant', data.assistantMessage.content || '');
    setStatus(`完成，上下文 ${(data.contextBytes / (1024 * 1024)).toFixed(2)}MB`);
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
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        ...state
      },
      null,
      2
    )
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
