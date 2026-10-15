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
import type { FilterFn, NodeIconResolver, TreeInputItem, TreeNodeData } from '@lib/types'
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

const settings = reactive<PlaygroundSettings>({ ...DEFAULT_SETTINGS })
const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const logs = ref<LogEntry[]>([])
const checked = ref<TreeNodeData | TreeNodeData[] | string | string[]>([])
const nodeCount = ref(0)
const metrics = ref({ build: '—', worker: '—' })
let addedCount = 0

const log = (text: string) => {
  logs.value = [
    { at: Math.round(performance.now()), text },
    ...logs.value,
  ].slice(0, 50)
}

/** 自定义字段模式下把默认字段映射成 key/label/parent。 */
const createData = (): TreeInputItem[] => {
  // `preorderedInput` 只有数据真的是前序排列时才有意义（否则组件会静默回退到通用构建，
  // 用户看不出差别），所以开关打开时换成前序生成器。
  const build = settings.preorderedInput
    ? buildPreorderedTreeData
    : buildTreeData
  const nodes = build(settings.size, {
    disabledEvery: 9,
    categoryEvery: 4,
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
    ? extendData => extendData.category === 'A'
    : undefined
)

const nodeIcon = computed<boolean | NodeIconResolver>(() => {
  if (settings.nodeIcon === 'off') return false
  if (settings.nodeIcon === 'default') return true
  return node => node.extendData?.category !== 'B'
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
  if (Array.isArray(value)) return `${value.length} 项`
  if (!value) return '空'
  return typeof value === 'string' ? `id=${value}` : `id=${value.id}`
})

/** 结果面板：按 `outputIdOnly` 分别渲染 ID 列表或完整 JSON。 */
const checkedResultText = computed(() =>
  formatCheckedResult(checked.value, settings.outputIdOnly)
)

const firstId = () => {
  const [first] = tree.value
  const idField = settings.fieldKeysMode === 'custom' ? 'key' : 'id'
  return first ? String((first as Record<string, unknown>)[idField] ?? '') : ''
}

const lastId = () => {
  const last = tree.value[tree.value.length - 1]
  const idField = settings.fieldKeysMode === 'custom' ? 'key' : 'id'
  return last ? String((last as Record<string, unknown>)[idField] ?? '') : ''
}

const refreshCount = async () => {
  await nextTick()
  nodeCount.value = treeRef.value?.getTreeSize() ?? tree.value.length
}

const runAction = (action: ApiAction) => {
  const instance = treeRef.value
  switch (action) {
    case 'reload':
      tree.value = createData()
      checked.value = []
      log('重建数据（v-model:tree 重组）')
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
    case 'setCheckedFirst': {
      const id = firstId()
      if (id) instance?.setCheckedByIds([id])
      log(`setCheckedByIds([${id}])`)
      break
    }
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
          ? { key: `新增${addedCount}`, label: `新节点 ${addedCount}`, parent: parentId }
          : { id: `新增${addedCount}`, name: `新节点 ${addedCount}`, parentId }
      const ok = instance?.addNode(node)
      log(`addNode(${node}) → ${ok}`)
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
        build: `ready=${instance?.getBuildReady()} total=${(
          build?.totalMs ?? 0
        ).toFixed(1)}ms inputBridge=${(build?.inputBridgeMs ?? 0).toFixed(
          1
        )}ms finalize=${(build?.finalizeMs ?? 0).toFixed(1)}ms`,
        worker: `enabled=${worker?.enabled} roundTrip=${(
          worker?.lastRoundTripMs ?? 0
        ).toFixed(1)}ms workerResponse=${(
          worker?.lastWorkerResponseMs ?? 0
        ).toFixed(1)}ms serialize=${(
          worker?.lastWorkerSerializeMs ?? 0
        ).toFixed(1)}ms batches=${worker?.structuralBatches} lastBatch=${
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
  log(
    `item-contextmenu(${node.id}) @ ${event.clientX},${event.clientY}（未调用 preventDefault）`
  )
}

const onRowEdit = (node: TreeNodeData) => {
  log(`#actions 插槽：改名 ${node.id}`)
  const nameField = settings.fieldKeysMode === 'custom' ? 'label' : 'name'
  treeRef.value?.updateNode(node.id, { [nameField]: `插槽改名 ${node.id}` })
}

watch(
  [
    () => settings.size,
    () => settings.fieldKeysMode,
    () => settings.preorderedInput,
  ],
  ([size, mode, preordered]) => {
    tree.value = createData()
    checked.value = []
    log(
      `数据更换：${size}${mode === 'custom' ? '（自定义字段）' : ''}${
        preordered ? '（深度优先前序）' : ''
      }`
    )
    void refreshCount()
  }
)

watch(checked, () => log(`update:modelValue → ${checkedSummary.value}`))
watch(tree, () => log(`update:tree → ${tree.value.length} 行`))

onMounted(() => {
  log('演示场已挂载，WASM 就绪')
  void refreshCount()
})
</script>

<template>
  <div class="playground">
    <ControlPanel :settings="settings" @action="runAction" />

    <div class="playground__tree">
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
        <template v-if="settings.useNodeSlot" #node="{ node }">
          <strong>{{ node.name }}</strong>
          <em class="playground__slot-tag">#node 插槽</em>
        </template>
        <template v-if="settings.useActionsSlot" #actions="{ node }">
          <button type="button" @click="onRowEdit(node)">改名</button>
        </template>
      </VueGiantTree>
    </div>

    <div class="playground__output">
      <div class="playground__result">
        <strong>选中结果：</strong>
        <pre>{{ checkedResultText }}</pre>
      </div>
      <p><strong>getTreeSize()：</strong>{{ nodeCount }}</p>
      <p><strong>getBuildReady() / getBuildMetrics()：</strong>{{ metrics.build }}</p>
      <p><strong>getWorkerMetrics()：</strong>{{ metrics.worker }}</p>
      <p>
        <strong>当前数据：</strong>{{ tree.length }} 行 · 字段模式
        {{ settings.fieldKeysMode }} · 根标识 root
      </p>
    </div>

    <ApiLog :entries="logs" />
  </div>
</template>

<style scoped>
.playground__tree {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.playground__slot-tag {
  margin-left: 6px;
  font-size: 11px;
  color: var(--vp-c-text-3);
}

.playground__output {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.8;
  word-break: break-all;
}

.playground__result {
  display: flex;
  gap: 6px;
}

.playground__result pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  max-height: 180px;
  overflow: auto;
}
</style>
