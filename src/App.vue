<script setup lang="ts">
import '@lib/assets/style/index.scss'
import VueGiantTree from '@lib/VueGiantTree.vue'
import { SelectType, DisplayType } from '../build/release'

import { nanoid } from 'nanoid'
import { ref, computed, watch } from 'vue'
import type { TreeNodeData } from '@lib/types'

const TREE_SIZES = {
  small: { l1: 5, l2: 3, l3: 2 },
  medium: { l1: 10, l2: 10, l3: 10 },
  large: { l1: 20, l2: 20, l3: 10 },
} as const

type TreeSize = keyof typeof TREE_SIZES

const currentSize = ref<TreeSize>('medium')
const currentSelectType = ref<SelectType>(SelectType.CHECKBOX)
const treeHeight = ref('500px')
const treeFontSize = ref('14px')
const lineHeight = ref(26)
const checkedResult = ref<TreeNodeData[]>([])
const searchKeyword = ref('')
const setCheckedIdsInput = ref('')
const currentDisplayType = ref<DisplayType>(DisplayType.TREE)
const wasmTreeSize = ref(0)
const treeRef = ref<InstanceType<typeof VueGiantTree>>()

const rootId = nanoid()

const generateTreeData = (size: TreeSize) => {
  const config = TREE_SIZES[size]
  const data: { id: string; parentId: string; name: string }[] = []
  for (let i = 0; i < config.l1; i++) {
    const id1 = nanoid()
    data.push({ id: id1, parentId: rootId, name: `L1-${i}: ${id1.slice(0, 6)}` })
    for (let j = 0; j < config.l2; j++) {
      const id2 = nanoid()
      data.push({ id: id2, parentId: id1, name: `L2-${i}-${j}: ${id2.slice(0, 6)}` })
      for (let z = 0; z < config.l3; z++) {
        const id3 = nanoid()
        data.push({ id: id3, parentId: id2, name: `L3-${i}-${j}-${z}: ${id3.slice(0, 6)}` })
      }
    }
  }
  return data
}

const testData = ref(generateTreeData(currentSize.value))

const totalNodes = computed(() => testData.value.length)

const treeKey = ref(0)
const rebuildTree = () => {
  testData.value = generateTreeData(currentSize.value)
  checkedResult.value = []
  searchKeyword.value = ''
  setCheckedIdsInput.value = ''
  currentDisplayType.value = DisplayType.TREE
  wasmTreeSize.value = 0
  treeKey.value++
}

watch(currentSize, rebuildTree)
watch(currentSelectType, () => {
  treeKey.value++
  checkedResult.value = []
})

const selectTypeLabel = computed(() => {
  switch (currentSelectType.value) {
    case SelectType.CHECKBOX:
      return 'CHECKBOX (多选)'
    case SelectType.RADIO:
      return 'RADIO (单选)'
    case SelectType.SELECT:
      return 'SELECT (点击选中)'
    default:
      return 'Unknown'
  }
})

const checkedCount = computed(() => {
  if (Array.isArray(checkedResult.value)) {
    return checkedResult.value.length
  }
  return checkedResult.value ? 1 : 0
})

const doSearch = () => {
  treeRef.value?.fuzzySearch(searchKeyword.value)
}

const clearSearch = () => {
  searchKeyword.value = ''
  treeRef.value?.fuzzySearch('')
}

const queryTreeSize = () => {
  wasmTreeSize.value = treeRef.value?.getTreeSize() ?? 0
}

const clearAllChecked = () => {
  treeRef.value?.clearAllChecked()
  checkedResult.value = []
}

const setCheckedFromInput = () => {
  const ids = setCheckedIdsInput.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return
  treeRef.value?.setCheckedByIds(ids)
}

const setRandomChecked = () => {
  const data = testData.value
  const count = Math.min(3, data.length)
  const picked: string[] = []
  const used = new Set<number>()
  while (picked.length < count) {
    const idx = Math.floor(Math.random() * data.length)
    if (!used.has(idx)) {
      used.add(idx)
      picked.push(data[idx].id)
    }
  }
  setCheckedIdsInput.value = picked.join(', ')
  treeRef.value?.setCheckedByIds(picked)
}

const switchDisplay = (type: DisplayType) => {
  currentDisplayType.value = type
  treeRef.value?.switchDisplay(type)
}
</script>

<template>
  <div class="dev-container">
    <header class="dev-header">
      <h1>VueGiantTree 开发测试</h1>
      <p class="dev-subtitle">
        WASM 驱动的超大树组件 · 当前节点数: <strong>{{ totalNodes }}</strong>
      </p>
    </header>

    <div class="dev-layout">
      <aside class="dev-sidebar">
        <section class="ctrl-section">
          <h3>数据规模</h3>
          <div class="btn-group">
            <button
              v-for="size in (['small', 'medium', 'large'] as const)"
              :key="size"
              :class="{ active: currentSize === size }"
              @click="currentSize = size"
            >
              {{ size }}
              <span class="btn-detail">{{ TREE_SIZES[size].l1 }}x{{ TREE_SIZES[size].l2 }}x{{ TREE_SIZES[size].l3 }}</span>
            </button>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>选择模式: {{ selectTypeLabel }}</h3>
          <div class="btn-group">
            <button
              :class="{ active: currentSelectType === SelectType.CHECKBOX }"
              @click="currentSelectType = SelectType.CHECKBOX"
            >
              Checkbox
            </button>
            <button
              :class="{ active: currentSelectType === SelectType.RADIO }"
              @click="currentSelectType = SelectType.RADIO"
            >
              Radio
            </button>
            <button
              :class="{ active: currentSelectType === SelectType.SELECT }"
              @click="currentSelectType = SelectType.SELECT"
            >
              Select
            </button>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>容器高度</h3>
          <div class="btn-group">
            <button
              v-for="h in ['300px', '500px', '700px']"
              :key="h"
              :class="{ active: treeHeight === h }"
              @click="treeHeight = h"
            >
              {{ h }}
            </button>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>行高: {{ lineHeight }}px</h3>
          <input
            type="range"
            min="20"
            max="48"
            v-model.number="lineHeight"
            @change="treeKey++"
          />
        </section>

        <section class="ctrl-section">
          <h3>字体大小</h3>
          <div class="btn-group">
            <button
              v-for="fs in ['12px', '14px', '16px', '18px']"
              :key="fs"
              :class="{ active: treeFontSize === fs }"
              @click="treeFontSize = fs"
            >
              {{ fs }}
            </button>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>模糊查询</h3>
          <div class="search-box">
            <input
              type="text"
              v-model="searchKeyword"
              placeholder="输入关键词搜索节点..."
              class="search-input"
              @keyup.enter="doSearch"
            />
            <div class="search-actions">
              <button class="action-btn search-btn" @click="doSearch">搜索</button>
              <button class="action-btn" @click="clearSearch">清除</button>
            </div>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>显示模式</h3>
          <div class="btn-group">
            <button
              :class="{ active: currentDisplayType === DisplayType.TREE }"
              @click="switchDisplay(DisplayType.TREE)"
            >
              树视图
            </button>
            <button
              :class="{ active: currentDisplayType === DisplayType.SEARCH }"
              @click="switchDisplay(DisplayType.SEARCH)"
            >
              搜索视图
            </button>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>编程式选中 (回显)</h3>
          <div class="search-box">
            <input
              type="text"
              v-model="setCheckedIdsInput"
              placeholder="输入节点 ID，逗号分隔..."
              class="search-input"
            />
            <div class="search-actions">
              <button class="action-btn search-btn" @click="setCheckedFromInput">设置选中</button>
              <button class="action-btn" @click="setRandomChecked">随机选中3个</button>
            </div>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>操作</h3>
          <div class="action-group">
            <button class="action-btn" @click="rebuildTree">
              重新生成树数据
            </button>
            <button class="action-btn" @click="clearAllChecked">
              清空所有选中
            </button>
            <button class="action-btn" @click="queryTreeSize">
              查询 WASM 树节点数
            </button>
          </div>
          <div v-if="wasmTreeSize > 0" class="info-badge">
            WASM 树节点数: <strong>{{ wasmTreeSize }}</strong>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>选中结果 ({{ checkedCount }})</h3>
          <div class="result-box">
            <template v-if="Array.isArray(checkedResult) && checkedResult.length > 0">
              <div
                v-for="node in checkedResult.slice(0, 20)"
                :key="node.id"
                class="result-item"
              >
                {{ node.name || node.id }}
              </div>
              <div v-if="checkedResult.length > 20" class="result-more">
                ... 还有 {{ checkedResult.length - 20 }} 项
              </div>
            </template>
            <div v-else-if="!Array.isArray(checkedResult) && checkedResult" class="result-item">
              {{ (checkedResult as TreeNodeData).name || (checkedResult as TreeNodeData).id }}
            </div>
            <div v-else class="result-empty">暂无选中节点</div>
          </div>
        </section>
      </aside>

      <main class="dev-main">
        <div class="tree-wrapper" :style="{ height: treeHeight }">
          <VueGiantTree
            ref="treeRef"
            :key="treeKey"
            :tree="testData"
            :root="rootId"
            :select-type="currentSelectType"
            :line-height="lineHeight"
            :font-size="treeFontSize"
            :height="'100%'"
            :width="'100%'"
            v-model="checkedResult"
          />
        </div>
      </main>
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f0f2f5;
  color: #1a1a2e;
}

.dev-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.dev-header {
  margin-bottom: 24px;
}

.dev-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
}

.dev-subtitle {
  margin-top: 4px;
  font-size: 14px;
  color: #666;
}

.dev-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  align-items: start;
}

.dev-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ctrl-section {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.ctrl-section h3 {
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.btn-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.btn-group button {
  flex: 1;
  min-width: 60px;
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #333;
  font-size: 12px;
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.btn-group button:hover {
  border-color: #4096ff;
  color: #4096ff;
}

.btn-group button.active {
  background: #4096ff;
  border-color: #4096ff;
  color: #fff;
}

.btn-detail {
  font-size: 10px;
  opacity: 0.7;
}

.action-btn {
  width: 100%;
  padding: 8px 16px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #333;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;
}

.action-btn:hover {
  border-color: #4096ff;
  color: #4096ff;
}

.search-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 150ms ease;
}

.search-input:focus {
  border-color: #4096ff;
}

.search-actions {
  display: flex;
  gap: 6px;
}

.search-actions .action-btn {
  flex: 1;
}

.search-btn {
  background: #4096ff !important;
  border-color: #4096ff !important;
  color: #fff !important;
}

.search-btn:hover {
  background: #1677ff !important;
  border-color: #1677ff !important;
}

input[type='range'] {
  width: 100%;
  accent-color: #4096ff;
}

.dev-main {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.tree-wrapper {
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
  transition: height 300ms ease;
}

.result-box {
  max-height: 200px;
  overflow-y: auto;
  font-size: 12px;
}

.result-item {
  padding: 3px 6px;
  border-radius: 4px;
  background: #f5f5f5;
  margin-bottom: 3px;
  word-break: break-all;
}

.result-more {
  padding: 3px 6px;
  color: #999;
  font-style: italic;
}

.result-empty {
  padding: 8px;
  color: #bbb;
  text-align: center;
  font-style: italic;
}

.action-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-badge {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #f0f7ff;
  border: 1px solid #bae0ff;
  color: #1677ff;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 768px) {
  .dev-layout {
    grid-template-columns: 1fr;
  }
}
</style>
