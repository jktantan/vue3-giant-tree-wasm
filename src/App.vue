<script setup lang="ts">
import '@lib/assets/style/index.scss'
import VueGiantTree from '@lib/VueGiantTree.vue'
import { SelectType, DisplayType, CheckedOutputMode } from '../build/release'

import { nanoid } from 'nanoid'
import { ref, shallowRef, computed, watch } from 'vue'
import type { TreeNodeData, FilterFn, NodeIconResolver } from '@lib/types'

const TREE_SIZES = {
  small: { l1: 5, l2: 3, l3: 2 },
  medium: { l1: 10, l2: 10, l3: 10 },
  large: { l1: 20, l2: 20, l3: 10 },
  '10k': { count: 10_000, branching: 10 },
  '100k': { count: 100_000, branching: 10 },
  '1m': { count: 1_000_000, branching: 32 },
} as const

type TreeSize = keyof typeof TREE_SIZES

const treeSizeOptions = Object.keys(TREE_SIZES) as TreeSize[]
const treeSizeLabel = (size: TreeSize) => {
  const config = TREE_SIZES[size]
  return 'count' in config
    ? `${(config.count / 1000).toLocaleString()}k nodes`
    : `${config.l1}x${config.l2}x${config.l3}`
}

const currentSize = ref<TreeSize>('medium')
const currentSelectType = ref<SelectType>(SelectType.CHECKBOX)
const treeHeight = ref('500px')
const treeFontSize = ref('14px')
const lineHeight = ref(26)
const checkedResult = ref<TreeNodeData | TreeNodeData[] | string | string[]>([])
const searchKeyword = ref('')
const setCheckedIdsInput = ref('')
const currentDisplayType = ref<DisplayType>(DisplayType.TREE)
const wasmTreeSize = ref(0)
const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const useNodeSlot = ref(false)
const useActionsSlot = ref(false)
const lastNodeAction = ref('')
const enableDisabled = ref(true)
type NodeIconMode = 'off' | 'default' | 'business' | 'single' | 'partial'
const nodeIconMode = ref<NodeIconMode>('off')
const useDarkNodeIcons = ref(false)

const enableFilterFn = ref(false)
const filterCategory = ref<'A' | 'B'>('A')

const filterFn = computed<FilterFn | undefined>(() => {
  if (!enableFilterFn.value) return undefined
  return (extendData: Record<string, unknown>) => {
    return extendData.category === filterCategory.value
  }
})

/** Exercises every NodeIconResolver return shape without coupling sample data to icon assets. */
const nodeIcon = computed<boolean | NodeIconResolver>(() => {
  switch (nodeIconMode.value) {
    case 'default':
      return true
    case 'single':
      return () => 'demo-node-icon-document'
    case 'partial':
      return node => (node.extendData?.nodeType === 'hidden' ? false : true)
    case 'business':
      return node => {
        switch (node.extendData?.nodeType) {
          case 'directory':
            return {
              collapsed: 'demo-node-icon-directory-closed',
              expanded: 'demo-node-icon-directory-open',
            }
          case 'hidden':
            return false
          default:
            return 'demo-node-icon-document'
        }
      }
    default:
      return false
  }
})

// 新增：输出模式配置
const outputIdOnly = ref(true)
const checkedOutputMode = ref<CheckedOutputMode>(CheckedOutputMode.All)

// 切换 outputIdOnly 或 checkedOutputMode 时清空结果（组件内部会自动重发）
// 但本地 ref 需要同步置空避免显示旧格式数据
watch([outputIdOnly, checkedOutputMode], () => {
  checkedResult.value = []
})

const rootId = nanoid()

const generateTreeData = (size: TreeSize) => {
  const config = TREE_SIZES[size]
  const data: {
    id: string
    parentId: string
    name: string
    disabled?: boolean
    category?: string
    region?: string
    status?: string
    owner?: string
    score?: number
    nodeType?: 'directory' | 'document' | 'hidden'
  }[] = []

  // 大数据集使用确定性 ID 和规则化的宽深混合层级，避免百万节点生成随机 ID 的额外开销。
  if ('count' in config) {
    for (let i = 0; i < config.count; i++) {
      const id = `node-${i}`
      const parentId =
        i === 0 ? rootId : `node-${Math.floor((i - 1) / config.branching)}`
      data.push({
        id,
        parentId,
        name: `Node ${i}`,
        disabled: enableDisabled.value && i > 0 && i % config.branching === 0,
        category: i % 2 === 0 ? 'A' : 'B',
        region: `region-${i % 8}`,
        status: i % 5 === 0 ? 'warning' : 'active',
        owner: `team-${i % 32}`,
        score: (i * 17) % 1000,
        nodeType:
          i % 11 === 0 ? 'hidden' : i % config.branching === 0 ? 'directory' : 'document',
      })
    }
    return data
  }

  for (let i = 0; i < config.l1; i++) {
    const id1 = nanoid()
    data.push({
      id: id1,
      parentId: rootId,
      name: `L1-${i}: ${id1.slice(0, 6)}`,
      category: i % 2 === 0 ? 'A' : 'B',
      nodeType: 'directory',
    })
    for (let j = 0; j < config.l2; j++) {
      const id2 = nanoid()
      const disableL2 = enableDisabled.value && j === 0
      data.push({
        id: id2,
        parentId: id1,
        name: `L2-${i}-${j}: ${id2.slice(0, 6)}`,
        disabled: disableL2,
        category: j % 2 === 0 ? 'A' : 'B',
        nodeType: 'document',
      })
      for (let z = 0; z < config.l3; z++) {
        const id3 = nanoid()
        const disableL3 = enableDisabled.value && j === 0 && z === 0
        data.push({
          id: id3,
          parentId: id2,
          name: `L3-${i}-${j}-${z}: ${id3.slice(0, 6)}`,
          disabled: disableL3,
          category: z % 2 === 0 ? 'A' : 'B',
          nodeType: z === 0 ? 'hidden' : 'document',
        })
      }
    }
  }
  return data
}

// The tree is replaced as a whole when switching data sizes; none of its
// individual nodes are mutated by the dev page.  Keeping the array shallow
// avoids creating thousands of Vue proxies before the WASM tree is built.
const testData = shallowRef(generateTreeData(currentSize.value))

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

const refreshAfterNodeAction = () => {
  checkedResult.value = []
  searchKeyword.value = ''
  setCheckedIdsInput.value = ''
  currentDisplayType.value = DisplayType.TREE
  wasmTreeSize.value = 0
  treeKey.value++
}

const editNode = (node: TreeNodeData) => {
  const editedName = node.name.endsWith('（已编辑）')
    ? node.name
    : `${node.name}（已编辑）`
  testData.value = testData.value.map(item =>
    item.id === node.id ? { ...item, name: editedName } : item
  )
  lastNodeAction.value = `已编辑节点：${editedName}`
  refreshAfterNodeAction()
}

const deleteNode = (node: TreeNodeData) => {
  const childrenByParent = new Map<string, string[]>()
  for (const item of testData.value) {
    const children = childrenByParent.get(item.parentId) ?? []
    children.push(item.id)
    childrenByParent.set(item.parentId, children)
  }

  const idsToRemove = new Set<string>()
  const pendingIds = [node.id]
  while (pendingIds.length > 0) {
    const id = pendingIds.pop()!
    if (idsToRemove.has(id)) continue
    idsToRemove.add(id)
    pendingIds.push(...(childrenByParent.get(id) ?? []))
  }

  testData.value = testData.value.filter(item => !idsToRemove.has(item.id))
  lastNodeAction.value = `已删除「${node.name}」及 ${idsToRemove.size - 1} 个子节点`
  refreshAfterNodeAction()
}

watch(currentSize, rebuildTree)
watch(currentSelectType, () => {
  treeKey.value++
  checkedResult.value = []
})
watch(useActionsSlot, enabled => {
  if (!enabled) lastNodeAction.value = ''
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
  if (checkedResult.value && typeof checkedResult.value === 'object') {
    return 1
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

const expandAll = () => {
  treeRef.value?.expandAll()
}

const collapseAll = () => {
  treeRef.value?.collapseAll()
}

const clearAllChecked = () => {
  treeRef.value?.clearAllChecked()
  checkedResult.value = []
}

const setCheckedFromInput = () => {
  const ids = setCheckedIdsInput.value
    .split(',')
    .map(s => s.trim())
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
  <div class="dev-container" :class="{ 'dev-container--dark-icons': useDarkNodeIcons }">
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
              v-for="size in treeSizeOptions"
              :key="size"
              :class="{ active: currentSize === size }"
              @click="currentSize = size"
            >
              {{ size }}
              <span class="btn-detail">{{ treeSizeLabel(size) }}</span>
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
              <button class="action-btn search-btn" @click="doSearch">
                搜索
              </button>
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
          <h3>功能开关</h3>
          <div class="toggle-group">
            <label class="toggle-label">
              <input
                type="checkbox"
                v-model="enableDisabled"
                @change="rebuildTree"
              />
              启用节点禁用 (每组第1个L2/L3)
            </label>
            <label class="toggle-label">
              <input type="checkbox" v-model="useNodeSlot" />
              启用节点内容插槽
            </label>
            <label class="toggle-label">
              <input type="checkbox" v-model="useActionsSlot" />
              启用操作插槽
            </label>
            <label class="toggle-label">
              <input type="checkbox" v-model="outputIdOnly" />
              仅输出 ID（默认，否则完整 JSON）
            </label>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>节点图标</h3>
          <p class="control-hint">
            演示 `false`、`true`、单个 class 与收起/展开 class 对四种返回值。
          </p>
          <div class="btn-group node-icon-mode-group">
            <button
              :class="{ active: nodeIconMode === 'off' }"
              @click="nodeIconMode = 'off'"
            >
              关闭
            </button>
            <button
              :class="{ active: nodeIconMode === 'default' }"
              @click="nodeIconMode = 'default'"
            >
              默认图标
            </button>
            <button
              :class="{ active: nodeIconMode === 'business' }"
              @click="nodeIconMode = 'business'"
            >
              类型映射
            </button>
            <button
              :class="{ active: nodeIconMode === 'single' }"
              @click="nodeIconMode = 'single'"
            >
              单一图标
            </button>
            <button
              :class="{ active: nodeIconMode === 'partial' }"
              @click="nodeIconMode = 'partial'"
            >
              局部隐藏
            </button>
          </div>
          <label class="toggle-label node-icon-theme-toggle">
            <input type="checkbox" v-model="useDarkNodeIcons" />
            深色树背景预览
          </label>
          <p class="control-hint">
            类型映射：directory 使用收起/展开图标，document 使用单一图标，hidden 不显示。
          </p>
        </section>

        <section
          v-if="currentSelectType === SelectType.CHECKBOX"
          class="ctrl-section"
        >
          <h3>CHECKBOX 输出 ID 模式</h3>
          <div class="btn-group">
            <button
              :class="{ active: checkedOutputMode === CheckedOutputMode.All }"
              @click="checkedOutputMode = CheckedOutputMode.All"
            >
              All
            </button>
            <button
              :class="{
                active: checkedOutputMode === CheckedOutputMode.RootOnly,
              }"
              @click="checkedOutputMode = CheckedOutputMode.RootOnly"
            >
              RootOnly
            </button>
            <button
              :class="{
                active: checkedOutputMode === CheckedOutputMode.LeafOnly,
              }"
              @click="checkedOutputMode = CheckedOutputMode.LeafOnly"
            >
              LeafOnly
            </button>
            <button
              :class="{
                active: checkedOutputMode === CheckedOutputMode.Custom,
              }"
              @click="checkedOutputMode = CheckedOutputMode.Custom"
            >
              Custom
            </button>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>filterFn 自定义过滤</h3>
          <p style="font-size: 11px; color: #888; margin-bottom: 8px">
            CHECKBOX+Custom: 只输出 category 匹配的选中节点<br />
            RADIO: 只显示 category 匹配节点的 Radio 框
          </p>
          <div class="toggle-group">
            <label class="toggle-label">
              <input type="checkbox" v-model="enableFilterFn" />
              启用 filterFn
            </label>
          </div>
          <div v-if="enableFilterFn" class="btn-group" style="margin-top: 8px">
            <button
              :class="{ active: filterCategory === 'A' }"
              @click="filterCategory = 'A'"
            >
              仅 category="A"
            </button>
            <button
              :class="{ active: filterCategory === 'B' }"
              @click="filterCategory = 'B'"
            >
              仅 category="B"
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
              <button
                class="action-btn search-btn"
                @click="setCheckedFromInput"
              >
                设置选中
              </button>
              <button class="action-btn" @click="setRandomChecked">
                随机选中3个
              </button>
            </div>
          </div>
        </section>

        <section class="ctrl-section">
          <h3>操作</h3>
          <div class="action-group">
            <button class="action-btn" @click="rebuildTree">
              重新生成树数据
            </button>
                        <button class="action-btn" @click="expandAll">全部展开</button>
            <button class="action-btn" @click="collapseAll">全部收起</button><button class="action-btn" @click="clearAllChecked">
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
            <!-- ID 模式：string[] -->
            <template
              v-if="
                outputIdOnly &&
                Array.isArray(checkedResult) &&
                checkedResult.length > 0
              "
            >
              <div
                v-for="id in (checkedResult as string[]).slice(0, 20)"
                :key="id"
                class="result-item result-id"
              >
                {{ id }}
              </div>
              <div v-if="checkedResult.length > 20" class="result-more">
                ... 还有 {{ checkedResult.length - 20 }} 项
              </div>
            </template>
            <!-- ID 模式单值 -->
            <div
              v-else-if="
                outputIdOnly &&
                typeof checkedResult === 'string' &&
                checkedResult
              "
              class="result-item result-id"
            >
              {{ checkedResult }}
            </div>
            <!-- 完整 JSON 模式：TreeNodeData[] -->
            <template
              v-else-if="
                !outputIdOnly &&
                Array.isArray(checkedResult) &&
                checkedResult.length > 0
              "
            >
              <div
                v-for="node in (checkedResult as TreeNodeData[]).slice(0, 20)"
                :key="node.id"
                class="result-item"
              >
                <span class="result-name">{{ node.name || node.id }}</span>
                <span class="result-extend" v-if="node.extendData">
                  {{ JSON.stringify(node.extendData) }}
                </span>
              </div>
              <div v-if="checkedResult.length > 20" class="result-more">
                ... 还有 {{ checkedResult.length - 20 }} 项
              </div>
            </template>
            <!-- 完整 JSON 模式单值 -->
            <div
              v-else-if="
                !outputIdOnly && !Array.isArray(checkedResult) && checkedResult
              "
              class="result-item"
            >
              <span class="result-name">{{
                (checkedResult as TreeNodeData).name ||
                (checkedResult as TreeNodeData).id
              }}</span>
              <span
                class="result-extend"
                v-if="(checkedResult as TreeNodeData).extendData"
              >
                {{ JSON.stringify((checkedResult as TreeNodeData).extendData) }}
              </span>
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
            :output-id-only="outputIdOnly"
            :checked-output-mode="checkedOutputMode"
            :filter-fn="filterFn"
            :node-icon="nodeIcon"
            v-model="checkedResult"
          >
            <template v-if="useNodeSlot" #node="{ node }">
              <span>{{ node.name }}</span>
              <span class="custom-badge">D{{ node.deep }}</span>
              <span v-if="node.disabled" class="custom-disabled-tag">禁用</span>
            </template>
            <template v-if="useActionsSlot" #actions="{ node }">
              <button
                type="button"
                class="node-action"
                @click="editNode(node)"
              >
                编辑
              </button>
              <button
                type="button"
                class="node-action node-action--danger"
                @click="deleteNode(node)"
              >
                删除
              </button>
            </template>
          </VueGiantTree>
          <p v-if="lastNodeAction" class="node-action-feedback">
            {{ lastNodeAction }}
          </p>
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
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
  height: 720px;
  overflow-y: auto;
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

.control-hint {
  margin-top: 10px;
  color: #788596;
  font-size: 11px;
  line-height: 1.5;
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

.result-id {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
  color: #1677ff;
  background: #f0f7ff;
}

.result-name {
  font-weight: 500;
}

.result-extend {
  display: block;
  font-size: 10px;
  color: #888;
  margin-top: 2px;
  font-family: 'SF Mono', 'Fira Code', monospace;
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

  .dev-sidebar {
    height: auto;
    overflow: visible;
  }
}

.toggle-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #333;
  cursor: pointer;
}

.toggle-label input[type='checkbox'] {
  accent-color: #4096ff;
}

.node-icon-mode-group button {
  min-width: 76px;
}

.node-icon-theme-toggle {
  margin-top: 10px;
}

.demo-node-icon-directory-closed {
  background-image: url('../lib/assets/image/node-folder-closed.svg');
}

.demo-node-icon-directory-open {
  background-image: url('../lib/assets/image/node-folder-open.svg');
}

.demo-node-icon-document {
  background-image: url('../lib/assets/image/node-leaf.svg');
}

.dev-container--dark-icons .tree-wrapper {
  background: #1e2936;
  border-color: #35465d;
}

.dev-container--dark-icons .giant-tree,
.dev-container--dark-icons .giant-tree .tree-item {
  color: #e7edf5;
}

.dev-container--dark-icons .giant-tree .tree-item:hover,
.dev-container--dark-icons .giant-tree .tree-item.selected {
  background: #2a4058;
}

.dev-container--dark-icons .giant-tree__mask-button {
  background-color: #b9c6d8;
}

.custom-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 16px;
  border-radius: 3px;
  background: #e6f4ff;
  color: #1677ff;
  border: 1px solid #bae0ff;
}

.custom-disabled-tag {
  display: inline-block;
  margin-left: 4px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 16px;
  border-radius: 3px;
  background: #fff1f0;
  color: #ff4d4f;
  border: 1px solid #ffccc7;
}

.node-action {
  padding: 2px 6px;
  border: 1px solid #91caff;
  border-radius: 3px;
  background: #fff;
  color: #1677ff;
  cursor: pointer;
}

.node-action--danger {
  border-color: #ffccc7;
  color: #ff4d4f;
}

.node-action-feedback {
  margin: 8px 0 0;
  color: #595959;
  font-size: 12px;
}
</style>
