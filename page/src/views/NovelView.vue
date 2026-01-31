<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const storyNodes = [
  {
    id: 'arrival',
    title: '雾城清晨',
    text: '你在一座漂浮的雾城醒来，口袋里只有一枚正在发热的指南针。它指向城心的光塔。',
    next: 'crossroads',
  },
  {
    id: 'crossroads',
    title: '三岔路口',
    text: '通往光塔的路有两条：一条是充满街头艺人的广场，另一条是安静的书库回廊。',
    choices: [
      { text: '穿过广场，追随人群', next: 'plaza' },
      { text: '走入书库回廊，寻找线索', next: 'library' },
    ],
  },
  {
    id: 'plaza',
    title: '广场回响',
    text: '艺人们的歌声让指南针跳动更快，他们告诉你：光塔需要一个誓言才能开启。',
    next: 'oath',
  },
  {
    id: 'library',
    title: '书库回廊',
    text: '厚重的书卷里夹着旧地图，上面标注着一条隐秘电梯，直达光塔顶层。',
    next: 'oath',
  },
  {
    id: 'oath',
    title: '誓言大厅',
    text: '光塔大厅里悬浮着三句誓言，你只能选择一句刻入指南针。',
    choices: [
      { text: '“我将守护这座城的故事。”', next: 'guardian' },
      { text: '“我将寻找属于我的归宿。”', next: 'home' },
      { text: '“我将把光带回雾中。”', next: 'light' },
    ],
  },
  {
    id: 'guardian',
    title: '守护者',
    text: '指南针变成一把钥匙，你成为光塔的新守护者。雾城的故事从此由你续写。',
    ending: true,
  },
  {
    id: 'home',
    title: '归宿',
    text: '光塔为你投影出记忆中的家。雾城的旅途结束，而你的心找到了停泊之处。',
    ending: true,
  },
  {
    id: 'light',
    title: '光之旅人',
    text: '你带着光离开雾城，新的旅程在晨曦中展开。指南针不再指向过去。',
    ending: true,
  },
]

const storyMap = Object.fromEntries(storyNodes.map((node) => [node.id, node]))
const saveKey = 'hajimi-interactive-novel-save'

const started = ref(false)
const ended = ref(false)
const fastMode = ref(false)
const currentNodeId = ref('arrival')
const history = ref([])
const statusMessage = ref('尚未开始故事。')

const currentNode = computed(() => storyMap[currentNodeId.value])
const historyNodes = computed(() =>
  history.value.map((id) => storyMap[id]).filter(Boolean)
)

let autoTimer = null

const pushHistory = (id) => {
  history.value.push(id)
}

const goToNode = (id) => {
  currentNodeId.value = id
  pushHistory(id)
  const node = storyMap[id]
  ended.value = Boolean(node?.ending)
  statusMessage.value = node?.ending ? '故事已结束。' : '故事进行中。'
}

const startStory = () => {
  started.value = true
  ended.value = false
  history.value = []
  goToNode('arrival')
}

const endStory = () => {
  ended.value = true
  statusMessage.value = '你选择结束故事。'
}

const advanceStory = () => {
  const node = currentNode.value
  if (!node || node.ending) {
    return
  }
  if (node.next) {
    goToNode(node.next)
  }
}

const choosePath = (choice) => {
  if (!choice?.next) {
    return
  }
  goToNode(choice.next)
}

const toggleFastMode = () => {
  fastMode.value = !fastMode.value
}

const saveProgress = () => {
  const payload = {
    started: started.value,
    ended: ended.value,
    currentNodeId: currentNodeId.value,
    history: history.value,
  }
  localStorage.setItem(saveKey, JSON.stringify(payload))
  statusMessage.value = '进度已保存。'
}

const loadProgress = () => {
  const saved = localStorage.getItem(saveKey)
  if (!saved) {
    statusMessage.value = '没有找到存档。'
    return
  }
  const payload = JSON.parse(saved)
  started.value = Boolean(payload.started)
  ended.value = Boolean(payload.ended)
  history.value = Array.isArray(payload.history) ? payload.history : []
  currentNodeId.value = payload.currentNodeId || 'arrival'
  statusMessage.value = started.value ? '已读取存档。' : '已读取存档，但故事尚未开始。'
}

watch([currentNodeId, fastMode, ended, started], () => {
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
  if (!fastMode.value || ended.value || !started.value) {
    return
  }
  const node = currentNode.value
  if (!node || node.ending || node.choices?.length) {
    return
  }
  autoTimer = setTimeout(() => {
    advanceStory()
  }, 800)
})

onBeforeUnmount(() => {
  if (autoTimer) {
    clearTimeout(autoTimer)
  }
})
</script>

<template>
  <div class="novel-view">
    <header class="novel-header">
      <div>
        <p class="eyebrow">互动式小说</p>
        <h1>雾城指南针</h1>
        <p class="subtitle">
          点击开始进入故事，随时存档或读档。启用快速模式后，剧情会自动推进。
        </p>
      </div>
      <div class="status">
        <span class="status-label">状态</span>
        <span class="status-value">{{ statusMessage }}</span>
      </div>
    </header>

    <section class="controls">
      <button class="primary" type="button" @click="startStory">开始</button>
      <button type="button" @click="loadProgress">读档</button>
      <button type="button" @click="saveProgress" :disabled="!started">存档</button>
      <button type="button" @click="toggleFastMode" :class="{ active: fastMode }" :disabled="!started">
        快速模式
      </button>
      <button class="danger" type="button" @click="endStory" :disabled="!started || ended">结束</button>
    </section>

    <section class="story" v-if="started">
      <div class="story-card">
        <h2>{{ currentNode?.title }}</h2>
        <p>{{ currentNode?.text }}</p>

        <div v-if="currentNode?.choices" class="choices">
          <button
            v-for="choice in currentNode.choices"
            :key="choice.text"
            type="button"
            @click="choosePath(choice)"
          >
            {{ choice.text }}
          </button>
        </div>

        <button
          v-else
          class="primary"
          type="button"
          @click="advanceStory"
          :disabled="ended"
        >
          继续
        </button>
      </div>

      <aside class="log">
        <h3>旅途记录</h3>
        <ol>
          <li v-for="(node, index) in historyNodes" :key="`${node.id}-${index}`">
            <strong>{{ node.title }}</strong>
            <span>{{ node.text }}</span>
          </li>
        </ol>
      </aside>
    </section>

    <section v-else class="empty-state">
      <p>准备好开始一段新的互动式小说旅程了吗？点击“开始”按钮进入雾城。</p>
    </section>
  </div>
</template>

<style scoped>
.novel-view {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 20px 48px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.novel-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 2px;
  font-size: 12px;
  font-weight: 600;
  color: #6c63ff;
  margin: 0 0 8px;
}

.novel-header h1 {
  margin: 0 0 8px;
  font-size: 32px;
  color: #2c3e50;
}

.subtitle {
  margin: 0;
  color: #6c757d;
  max-width: 560px;
}

.status {
  background: #f1f3ff;
  padding: 12px 16px;
  border-radius: 12px;
  color: #3d3b8e;
  box-shadow: inset 0 0 0 1px rgba(61, 59, 142, 0.12);
}

.status-label {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
  color: #6c63ff;
}

.status-value {
  font-weight: 600;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.controls button {
  border: none;
  padding: 10px 18px;
  border-radius: 999px;
  background: #e9ecef;
  color: #2d3436;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s ease;
}

.controls button:hover:not(:disabled) {
  background: #dee2e6;
}

.controls button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.controls button.primary {
  background: #6c63ff;
  color: white;
}

.controls button.primary:hover:not(:disabled) {
  background: #5a54e6;
}

.controls button.active {
  background: #00b894;
  color: white;
}

.controls button.danger {
  background: #ff6b6b;
  color: white;
}

.story {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 24px;
}

.story-card {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.story-card h2 {
  margin: 0;
  color: #2c3e50;
}

.story-card p {
  margin: 0;
  color: #495057;
  line-height: 1.7;
  font-size: 16px;
}

.story-card .primary {
  align-self: flex-start;
}

.choices {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.choices button {
  border: 1px solid #dee2e6;
  background: #f8f9fa;
  padding: 12px 16px;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: border 0.2s ease, transform 0.2s ease;
}

.choices button:hover {
  border-color: #6c63ff;
  transform: translateY(-1px);
}

.log {
  background: #ffffff;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
}

.log h3 {
  margin-top: 0;
  color: #2c3e50;
}

.log ol {
  padding-left: 18px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log li {
  font-size: 14px;
  color: #6c757d;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log strong {
  color: #343a40;
}

.empty-state {
  background: #ffffff;
  padding: 28px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  color: #6c757d;
}

@media (max-width: 900px) {
  .story {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .novel-header h1 {
    font-size: 26px;
  }

  .controls {
    flex-direction: column;
    align-items: stretch;
  }

  .controls button {
    width: 100%;
  }
}
</style>
