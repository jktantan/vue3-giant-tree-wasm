<script setup lang="ts">
/**
 * 完整演示场：覆盖组件的全部 prop、实例方法、插槽与事件。
 * 只在客户端加载（`playground.md` 用 `defineClientComponent`），避免 SSR 期执行浏览器 API。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import {
  VueGiantTree,
  SelectType,
  CheckedOutputMode,
  DisplayType,
} from '@lib/index'
import type {
  FilterFn,
  NodeIconResolver,
  TreeInputItem,
  TreeNodeData,
} from '@lib/types'
import { buildPreorderedTreeData, buildTreeData } from './treeData'
import ControlPanel from './playground/ControlPanel.vue'
import ApiLog from './playground/ApiLog.vue'
import {
  DEFAULT_SETTINGS,
  type ApiAction,
  type LogEntry,
  type PlaygroundSettings,
} from './playground/settings'
import { formatCheckedResult } from './playground/format'
import { useMessages } from './i18n'

const settings = reactive<PlaygroundSettings>({ ...DEFAULT_SETTINGS })
const t = useMessages()
const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const logs = ref<LogEntry[]>([])
const checked = ref<TreeNodeData | TreeNodeData[] | string | string[]>([])
const nodeCount = ref(0)
const metrics = ref({ build: '—', worker: '—' })
let addedCount = 0

const log = (text: string) => {
  logs.value = [{ at: Math.round(performance.now()), text }, ...logs.value].slice(0, 50)
}

const idField = () => (settings.fieldKeysMode === 'custom' ? 'key' : 'id')

/** 自定义字段模式下把默认字段映射成 key/label/parent。 */
const createData = (): TreeInputItem[] => {
  // `preorderedInput` 只有数据真的是前序排列时才有意义（否则组件会静默回退到通用构建），
  // 所以开关打开时换成前序生成器。
  const build = settings.preorderedInput ? buildPreorderedTreeData : buildTreeData
  const nodes = build(settings.size, {
    disabledEvery: settings.enableDisabled ? 9 : 0,
    categoryEvery: 4,
    labelPrefix: t.nodeLabel,
  })
  if (settings.fieldKeysMode !== 'custom') return nodes
  return nodes.map(node => ({
    key: node.id,
    label: node.name,
    parent: node.parentId,
    category: (node as Record<string, unknown>).category,
    disabled: node.disabled,
  }))
}

const tree = ref<TreeInputItem[]>(createData())

const fieldKeys = computed(() =>
  settings.fieldKeysMode === 'custom'
    ? {
        idField: 'key',
        nameField: 'label',
        parentIdField: 'parent',
        leftNodeField: 'lft',
        rightNodeField: 'rgt',
      }
    : {}
)

const selectType = computed(
  () =>
    ({
      CHECKBOX: SelectType.CHECKBOX,
      RADIO: SelectType.RADIO,
      SELECT: SelectType.SELECT,
    })[settings.selectType]
)

const outputMode = computed(
  () =>
    ({
      All: CheckedOutputMode.All,
      RootOnly: CheckedOutputMode.RootOnly,
      LeafOnly: CheckedOutputMode.LeafOnly,
      Custom: CheckedOutputMode.Custom,
    })[settings.checkedOutputMode]
)

const filterFn = computed<FilterFn | undefined>(() =>
  settings.enableFilterFn
    ? extendData => extendData.category === settings.filterCategory
    : undefined
)

/** 五种图标模式：关闭 / 内置 / 业务字段 / 单一 class / 局部隐藏。 */
const nodeIcon = computed<boolean | NodeIconResolver>(() => {
  switch (settings.nodeIcon) {
    case 'default':
      return true
    case 'business':
      // 业务字段 → 自定义 CSS 类：category 为 B 的用文档图标，其余用文件夹（含展开态）。
      return node =>
        node.extendData?.category === 'B'
          ? 'playground-icon-doc'
          : {
              collapsed: 'playground-icon-folder',
              expanded: 'playground-icon-folder-open',
            }
    case 'single':
      return 'playground-icon-doc'
    case 'partial':
      return node =>
        node.extendData?.category === 'B'
          ? false
          : { collapsed: 'playground-icon-folder', expanded: 'playground-icon-folder-open' }
    default:
      return false
  }
})

const showLine = computed(() =>
  settings.showLine
    ? {
        style: settings.showLineStyle,
        color: settings.showLineColor,
        width: settings.showLineWidth,
      }
    : false
)

/** 影响构建方式的配置变化时整体重挂载，避免半新半旧的树状态。 */
const treeKey = computed(
  () =>
    `w${settings.workerMode ? 1 : 0}-c${settings.chunkedBuild ? 1 : 0}-p${
      settings.preorderedInput ? 1 : 0
    }-f${settings.fieldKeysMode}`
)

const checkedSummary = computed(() => {
  const value = checked.value
  if (Array.isArray(value)) return `${value.length}`
  if (!value) return '0'
  return '1'
})

const checkedResultText = computed(() =>
  formatCheckedResult(checked.value, settings.outputIdOnly)
)

const idsOf = (rows: TreeInputItem[]) =>
  rows
    .map(row => String((row as Record<string, unknown>)[idField()] ?? ''))
    .filter(Boolean)

const firstId = () => idsOf(tree.value)[0] ?? ''
const lastId = () => idsOf(tree.value).at(-1) ?? ''

const refreshCount = async () => {
  await nextTick()
  const size = treeRef.value?.getTreeSize() ?? 0
  // 组件首帧还没构建完时 getTreeSize() 会短暂返回 0，此时退回数据行数。
  nodeCount.value = size || tree.value.length
}

const runAction = (action: ApiAction) => {
  const instance = treeRef.value
  switch (action) {
    case 'reload':
      tree.value = createData()
      checked.value = []
      log(t.reload)
      break
    case 'expandAll':
      instance?.expandAll()
      log('expandAll()')
      break
    case 'collapseAll':
      instance?.collapseAll()
      log('collapseAll()')
      break
    case 'clearAllChecked':
      instance?.clearAllChecked()
      log('clearAllChecked()')
      break
    case 'setCheckedFromInput': {
      const ids = settings.checkedIdsInput
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
      instance?.setCheckedByIds(ids)
      log(`setCheckedByIds([${ids.join(', ')}])`)
      break
    }
    case 'setCheckedRandom': {
      const pool = idsOf(tree.value)
      const picked: string[] = []
      for (let i = 0; i < 5 && pool.length > 0; i++) {
        picked.push(pool[Math.floor(Math.random() * pool.length)])
      }
      instance?.setCheckedByIds(picked)
      log(`setCheckedByIds(${picked.length} 随机)`)
      break
    }
    case 'search':
      instance?.fuzzySearch(settings.keyword)
      log(`fuzzySearch(${settings.keyword})`)
      break
    case 'clearSearch':
      settings.keyword = ''
      instance?.fuzzySearchRaw('')
      log("fuzzySearchRaw('')")
      break
    case 'switchDisplayTree':
      instance?.switchDisplay(DisplayType.TREE)
      log('switchDisplay(TREE)')
      break
    case 'switchDisplaySearch':
      instance?.switchDisplay(DisplayType.SEARCH)
      log('switchDisplay(SEARCH)')
      break
    case 'refreshCheckedResult':
      instance?.refreshCheckedResult()
      log('refreshCheckedResult()')
      break
    case 'updateFirst': {
      const id = firstId()
      const nameField = settings.fieldKeysMode === 'custom' ? 'label' : 'name'
      if (id) instance?.updateNode(id, { [nameField]: `已改名 ${id}` })
      log(`updateNode(${id})`)
      break
    }
    case 'addChild': {
      addedCount += 1
      const parentId = firstId() || 'root'
      const node =
        settings.fieldKeysMode === 'custom'
          ? { key: `新增${addedCount}`, label: `${t.nodeLabel} 新增${addedCount}`, parent: parentId }
          : { id: `新增${addedCount}`, name: `${t.nodeLabel} 新增${addedCount}`, parentId }
      const ok = instance?.addNode(node)
      log(`addNode(${JSON.stringify(node)}) → ${ok}`)
      break
    }
    case 'removeLast': {
      const id = lastId()
      const ok = id ? instance?.removeNode(id) : false
      log(`removeNode(${id}) → ${ok}`)
      break
    }
    case 'queryMetrics': {
      const build = instance?.getBuildMetrics() as
        | { totalMs?: number; inputBridgeMs?: number; finalizeMs?: number }
        | undefined
      const worker = instance?.getWorkerMetrics() as
        | {
            enabled?: boolean
            lastRoundTripMs?: number
            lastWorkerResponseMs?: number
            lastWorkerSerializeMs?: number
            structuralBatches?: number
            lastBatchSize?: number
          }
        | undefined
      metrics.value = {
        build: `ready=${instance?.getBuildReady()} · total=${(
          build?.totalMs ?? 0
        ).toFixed(1)}ms · inputBridge=${(build?.inputBridgeMs ?? 0).toFixed(
          1
        )}ms · finalize=${(build?.finalizeMs ?? 0).toFixed(1)}ms`,
        worker: `enabled=${worker?.enabled} · roundTrip=${(
          worker?.lastRoundTripMs ?? 0
        ).toFixed(1)}ms · workerResponse=${(
          worker?.lastWorkerResponseMs ?? 0
        ).toFixed(1)}ms · serialize=${(
          worker?.lastWorkerSerializeMs ?? 0
        ).toFixed(1)}ms · batches=${worker?.structuralBatches} · lastBatch=${
          worker?.lastBatchSize
        }`,
      }
      log('getBuildReady() / getBuildMetrics() / getWorkerMetrics()')
      break
    }
  }
  void refreshCount()
}

const onContextMenu = (node: TreeNodeData, event: MouseEvent) => {
  log(`item-contextmenu(${node.id}) @ ${event.clientX},${event.clientY}（未调用 preventDefault）`)
}

/** 行内操作：直接作用在点击的那一行上。 */
const renameNode = (node: TreeNodeData) => {
  const nameField = settings.fieldKeysMode === 'custom' ? 'label' : 'name'
  const ok = treeRef.value?.updateNode(node.id, { [nameField]: `改名 ${node.id}` })
  log(`updateNode(${node.id}) → ${ok}`)
  void refreshCount()
}

const addChildNode = (node: TreeNodeData) => {
  addedCount += 1
  const row =
    settings.fieldKeysMode === 'custom'
      ? { key: `新增${addedCount}`, label: `${t.nodeLabel} 新增${addedCount}`, parent: node.id }
      : { id: `新增${addedCount}`, name: `${t.nodeLabel} 新增${addedCount}`, parentId: node.id }
  const ok = treeRef.value?.addNode(row)
  log(`addNode(under ${node.id}) → ${ok}`)
  void refreshCount()
}

const deleteNode = (node: TreeNodeData) => {
  const ok = treeRef.value?.removeNode(node.id)
  log(`removeNode(${node.id}) → ${ok}`)
  void refreshCount()
}

watch(
  [
    () => settings.size,
    () => settings.fieldKeysMode,
    () => settings.preorderedInput,
    () => settings.enableDisabled,
  ],
  async ([size, mode, preordered]) => {
    log(`${t.dataChanged}: ${size}${mode === 'custom' ? ` / ${t.customFields}` : ''}${preordered ? ` / ${t.preorder}` : ''}`)
    // 与 app.vue 的 rebuildTree 对齐：换数据时一并清掉搜索词与选中，并回到树视图。
    settings.keyword = ''
    treeRef.value?.switchDisplay(DisplayType.TREE)
    tree.value = createData()
    checked.value = []
    await refreshCount()
  }
)

watch(checked, () => log(`update:modelValue → ${checkedSummary.value}`))
watch(tree, () => log(`update:tree → ${tree.value.length}`))

onMounted(async () => {
  log(t.mounted)
  await refreshCount()
  // 首次构建完成后校正一次计数（首帧时组件可能还没就绪）。
  setTimeout(() => void refreshCount(), 300)
})
</script>

<template>
  <div class="playground">
    <ControlPanel :settings="settings" @action="runAction" />

    <div class="playground__stage">
      <div
        class="playground__tree"
        :class="{ 'playground__tree--dark': settings.darkIconBg }"
      >
        <VueGiantTree
          ref="treeRef"
          :key="treeKey"
          v-model="checked"
          v-model:tree="tree"
          root="root"
          :height="settings.height"
          :line-height="settings.lineHeight"
          :font-size="settings.fontSize"
          :select-type="selectType"
          :show-line="showLine"
          :node-icon="nodeIcon"
          :filter-fn="filterFn"
          :output-id-only="settings.outputIdOnly"
          :checked-output-mode="outputMode"
          :worker-mode="settings.workerMode"
          :chunked-build="settings.chunkedBuild"
          :build-batch-size="settings.buildBatchSize"
          :preordered-input="settings.preorderedInput"
          :field-keys="fieldKeys"
          @item-contextmenu="onContextMenu"
        >
          <template v-if="settings.useNodeSlot || settings.mptt" #node="{ node }">
            <span>{{ node.name }}</span>
            <code v-if="settings.mptt" class="playground__mptt">
              L{{ node.leftNode }} R{{ node.rightNode }}
            </code>
          </template>
          <template v-if="settings.useActionsSlot" #actions="{ node }">
            <button type="button" class="playground__row-action" @click="renameNode(node)">
              {{ t.editNode }}
            </button>
            <button type="button" class="playground__row-action" @click="addChildNode(node)">
              {{ t.addChildNode }}
            </button>
            <button type="button" class="playground__row-action danger" @click="deleteNode(node)">
              {{ t.deleteNode }}
            </button>
          </template>
        </VueGiantTree>

        <p v-if="settings.useActionsSlot" class="playground__note">
          {{ t.rowActions }}：{{ t.editNode }} / {{ t.addChildNode }} / {{ t.deleteNode }}
        </p>
      </div>

      <aside class="playground__result">
        <div class="result-row">
          <span class="result-key">{{ t.checkedResult }}</span>
          <span class="result-count">{{ checkedSummary }}</span>
        </div>
        <pre class="result-value">{{ checkedResultText }}</pre>
        <div class="result-row">
          <span class="result-key">{{ t.totalNodes }}</span>
          <span class="result-count">{{ nodeCount }}</span>
        </div>
        <dl class="result-meta">
          <div><dt>{{ t.rows }}</dt><dd>{{ tree.length }}</dd></div>
          <div><dt>{{ t.fieldMode }}</dt><dd>{{ settings.fieldKeysMode }}</dd></div>
          <div><dt>{{ t.sizeLabel }}</dt><dd>{{ settings.size }}</dd></div>
        </dl>
        <dl class="result-meta">
          <div><dt>getBuildMetrics()</dt><dd>{{ metrics.build }}</dd></div>
          <div><dt>getWorkerMetrics()</dt><dd>{{ metrics.worker }}</dd></div>
        </dl>
      </aside>
    </div>

    <ApiLog :entries="logs" />
  </div>
</template>

<style scoped>
.playground__stage {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
  gap: 14px;
  align-items: start;
}

@media (max-width: 860px) {
  .playground__stage {
    grid-template-columns: minmax(0, 1fr);
  }
}

.playground__tree {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.playground__tree--dark {
  background: #1e2936;
  border-color: #35465d;
}

/* 深色预览必须同时把文字与交互态调亮，否则深字压深底根本看不见。 */
.playground__tree--dark :deep(.giant-tree),
.playground__tree--dark :deep(.giant-tree .tree-item) {
  color: #e7edf5;
}

.playground__tree--dark :deep(.giant-tree .tree-item:hover),
.playground__tree--dark :deep(.giant-tree .tree-item.selected) {
  background: #2a4058;
}

.playground__tree--dark :deep(.giant-tree__mask-button) {
  background-color: #b9c6d8;
}

.playground__note {
  margin: 0;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--vp-c-text-3);
  border-top: 1px solid var(--vp-c-divider);
}

.playground__mptt {
  margin-left: 8px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-3);
}

.playground__result {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--vp-c-bg-soft);
}

.result-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.result-key {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.result-count {
  font-size: 22px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

.result-value {
  margin: 8px 0 12px;
  padding: 8px 10px;
  max-height: 150px;
  overflow: auto;
  border-radius: 8px;
  background: var(--vp-c-bg);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.result-meta {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 12px;
}

.result-meta div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.result-meta dt {
  color: var(--vp-c-text-3);
}

.result-meta dd {
  margin: 0;
  text-align: right;
  color: var(--vp-c-text-2);
  word-break: break-all;
}

.playground__row-action {
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 4px;
  font-size: 11px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.playground__row-action:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.playground__row-action.danger:hover {
  border-color: var(--vp-c-danger-1);
  color: var(--vp-c-danger-1);
}

/* 演示用自定义图标类：只给 background-image，其余交给组件。 */
.playground__tree :deep(.playground-icon-folder) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%233b82f6' d='M1.5 3.5h4.2l1.4 1.8h7.4v7.2h-13z'/%3E%3C/svg%3E");
}

.playground__tree :deep(.playground-icon-folder-open) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%232563eb' d='M1.5 3.5h4.2l1.4 1.8h7.4v2h-13z'/%3E%3Cpath fill='%2360a5fa' d='M1.5 7h13l-1.6 5.5h-11.4z'/%3E%3C/svg%3E");
}

.playground__tree :deep(.playground-icon-doc) {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%2364748b' d='M3 1.5h6.5L13 5v9.5H3z'/%3E%3Cpath fill='%23e2e8f0' d='M9.5 1.5 13 5H9.5z'/%3E%3C/svg%3E");
}
</style>
