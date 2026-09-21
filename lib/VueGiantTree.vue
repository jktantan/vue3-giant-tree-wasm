<script setup lang="ts">
/**
 * VueGiantTree 主组件：高性能虚拟滚动树，基于 WASM (AssemblyScript) 实现核心算法
 * VueGiantTree main component: high-performance virtual scroll tree, core algorithms implemented in WASM (AssemblyScript)
 * Главный компонент VueGiantTree: высокопроизводительное дерево с виртуальной прокруткой, основные алгоритмы реализованы в WASM (AssemblyScript)
 *
 * 特性: MPTT 树结构 · 虚拟滚动 · 增量可见性维护 · 模糊搜索 · 多选/单选/点击模式 · JSON/ID 双输出
 * Features: MPTT tree structure · virtual scrolling · incremental visibility · fuzzy search · multi/single/click select · JSON/ID dual output
 * Особенности: структура MPTT · виртуальная прокрутка · инкрементное обновление видимости · нечёткий поиск · множественный/одиночный/кликовый выбор · двойной вывод JSON/ID
 */
import {
  newTree,
  newTreeWithKeys,
  setBoundary,
  SelectType,
  CheckedOutputMode,
  clear,
  setNeighborTree,
  pushNeighborNodesUtf8,
  popNeighbor,
  getShownHeight,
  collapseTree,
  collapseAll,
  checkNode,
  getCheckedIds,
  getCheckedIdList,
  CheckType,
  DisplayType,
  fuzzyTree,
  getSize,
  switchDisplayTree,
  clearCheckedNodes,
  setCheckedNode,
  setCheckedNodes,
  setCheckedOutputMode,
  getAllNodes,
  getAllNodeIds,
  getAllNodeLayouts,
  getShownIndices,
  getNodeSelectionStates,
  getNodeCollapsedStates,
  getInputNodeLayouts,
  clearInputNodeLayouts,
  setTrackInputLayouts,
  setUsePreorderedNeighborInput,
} from '../build/release'

import { debounce } from 'throttle-debounce'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import TreeItem from '@lib/TreeItem.vue'
import type {
  TreeNodeData,
  TreeInputItem,
  TreeFieldKeys,
  FilterFn,
  NodeIconResolver,
  TreeMutationItem,
  TreeNodePatch,
} from './types'
const props = withDefaults(
  defineProps<{
    modelValue: TreeNodeData | TreeNodeData[] | string | string[]
    width?: string
    height?: string
    lineHeight?: number
    size?: number
    selectType?: SelectType
    root?: string
    fontSize?: string
    tree: TreeInputItem[]
    fieldKeys?: TreeFieldKeys
    /** 输出模式：true=只传 ID，false=传完整 JSON */
    outputIdOnly?: boolean
    /** CHECKBOX 选中 ID 过滤模式 */
    checkedOutputMode?: CheckedOutputMode
    /** 自定义过滤回调：CHECKBOX 模式 + checkedOutputMode=Custom 时用于过滤输出；RADIO 模式用于判断节点是否可选 */
    filterFn?: FilterFn
    /** 节点图标：true 使用内置图标；回调可按节点决定显示的 CSS 图标类 */
    nodeIcon?: boolean | NodeIconResolver
    /** 显式启用分批 WASM 输入；只适用于不需要完整原始行输出的场景 */
    chunkedBuild?: boolean
    /** 每批写入 WASM 的节点数 */
    buildBatchSize?: number
    /** 将树算法放入 Web Worker；适合大树或频繁结构变更 */
    workerMode?: boolean
    /** 输入已按深度优先前序排列时，跳过通用父子分组构建 */
    preorderedInput?: boolean
  }>(),
  {
    width: '100%',
    height: '100%',
    lineHeight: 26,
    selectType: SelectType.CHECKBOX,
    root: '',
    fontSize: '14px',
    tree: () => [],
    fieldKeys: () => ({}),
    outputIdOnly: true,
    checkedOutputMode: CheckedOutputMode.All,
    nodeIcon: false,
    chunkedBuild: false,
    buildBatchSize: 2_000,
    workerMode: false,
    preorderedInput: false,
  }
)
const emit = defineEmits(['update:modelValue', 'update:tree'])
/** 组件引用: 滚动容器 DOM / Component ref: scroll container DOM / Ссылка на компонент: DOM контейнера прокрутки */
const container = ref<HTMLDivElement>()
/** 可见节点总数，由 WASM 侧 shownCount 驱动 / Total visible node count, driven by WASM shownCount / Общее количество видимых узлов */
const listHeight = ref<number>(0)
/** 当前树列表（可视区域内节点） / Current tree list (nodes within viewport) / Текущий список дерева (узлы в области просмотра) */
const currentTreeList = ref<TreeNodeData[]>([])
/**
 * A short-lived render plan used only while a branch opens or closes.  Keeping
 * this separate from the regular virtual list means that we never materialize
 * an entire subtree: `rows` contains only entries already in this viewport.
 */
type TreeAnimation = {
  direction: 'expand' | 'collapse'
  /** settled keeps stable sibling DOM in place after the transition. */
  phase: 'running' | 'settled'
  before: TreeNodeData[]
  rows: TreeNodeData[]
  after: TreeNodeData[]
  height: number
}
const treeAnimation = ref<TreeAnimation>()
const animationOpen = ref(false)
const animationDuration = 220
let animationTimer: ReturnType<typeof setTimeout> | undefined
let frozenScrollTop = 0
let pendingResizeHeight: number | undefined
let pendingWorkerCollapse:
  | { revision: number; id: string; collapsed: boolean; before: TreeNodeData[] }
  | undefined
const isTreeAnimating = () => treeAnimation.value?.phase === 'running'
const releaseSettledRenderPlan = () => {
  if (treeAnimation.value?.phase === 'settled') treeAnimation.value = undefined
}
let allNodesCache: TreeNodeData[] = []
let isTreeReady = false
let isBuilding = false
let activeSearchKeyword = ''
let worker: Worker | undefined
let workerRevision = 0
let workerCheckedIds: string[] = []
let workerTreeSize = 0
type WorkerMetrics = {
  enabled: boolean
  pendingCommands: number
  commandsSent: number
  snapshotsReceived: number
  lastRoundTripMs: number
  lastWorkerResponseMs: number
  lastWorkerSerializeMs: number
  structuralBatches: number
  structuralOperations: number
  lastBatchSize: number
  visibleRows: number
}
let workerMetrics: WorkerMetrics = {
  enabled: false, pendingCommands: 0, commandsSent: 0, snapshotsReceived: 0,
  lastRoundTripMs: 0, lastWorkerResponseMs: 0, lastWorkerSerializeMs: 0,
  structuralBatches: 0, structuralOperations: 0, lastBatchSize: 0, visibleRows: 0,
}
const workerCommandStartedAt = new Map<number, number>()
// Worker replies can arrive before Vue has propagated the preceding v-model
// echo back through props. Keep the acknowledged controlled value locally so
// rapid replies compose instead of overwriting one another.
let workerInput: TreeMutationItem[] = props.tree as TreeMutationItem[]
let awaitingWorkerTreeEchoes = 0
let skipNextPresentationOnlyReconcile = false
const isUsingWorker = () => worker !== undefined
let buildStartedAt = 0
type BuildMetrics = {
  inputBridgeMs: number
  inputYieldMs: number
  finalizeMs: number
  layoutBridgeMs: number
  cacheAssemblyMs: number
  cacheYieldMs: number
  layoutReleaseMs: number
  cacheIndexMs: number
  cacheRefreshMs: number
  shownIndicesMs: number
  selectionStatesMs: number
  totalMs: number
}
let buildMetrics: BuildMetrics = {
  inputBridgeMs: 0,
  inputYieldMs: 0,
  finalizeMs: 0,
  layoutBridgeMs: 0,
  cacheAssemblyMs: 0,
  cacheYieldMs: 0,
  layoutReleaseMs: 0,
  cacheIndexMs: 0,
  cacheRefreshMs: 0,
  shownIndicesMs: 0,
  selectionStatesMs: 0,
  totalMs: 0,
}
const now = () => performance.now()
const resetBuildMetrics = () => {
  buildMetrics = {
    inputBridgeMs: 0,
    inputYieldMs: 0,
    finalizeMs: 0,
    layoutBridgeMs: 0,
    cacheAssemblyMs: 0,
    cacheYieldMs: 0,
    layoutReleaseMs: 0,
    cacheIndexMs: 0,
    cacheRefreshMs: 0,
    shownIndicesMs: 0,
    selectionStatesMs: 0,
    totalMs: 0,
  }
}
let scrollTop = 0,
  scrollHeight = 0
let resizeRefreshTimer: ReturnType<typeof setTimeout> | undefined
const startOffset = ref<number>(0)
/** ResizeObserver: 监听容器高度变化，同步 WASM 边界 + 刷新视图 / ResizeObserver: watches container height changes, syncs WASM boundary + refreshes view / ResizeObserver: отслеживает изменение высоты контейнера, синхронизирует границы WASM + обновляет вид */
const ro = new ResizeObserver((entries: ResizeObserverEntry[]) => {
  const { blockSize: height } = entries[0].contentBoxSize[0]
  if (isTreeAnimating()) {
    // The animation owns layout until its final frame. Applying a new boundary
    // here would replace its temporary rows midway through the transition.
    pendingResizeHeight = height
    return
  }
  releaseSettledRenderPlan()
  scrollHeight = height
  if (resizeRefreshTimer !== undefined) return
  // Keep DOM updates out of the observer callback to avoid Chromium resize loops.
  resizeRefreshTimer = setTimeout(() => {
    resizeRefreshTimer = undefined
    if (isTreeAnimating()) {
      pendingResizeHeight = height
      return
    }
    if (isUsingWorker()) {
      scrollHeight = height
      postWorker('boundary', { scrollTop, scrollHeight })
      return
    }
    setBoundary(tree, scrollTop, scrollHeight)
    listHeight.value = getShownHeight(tree)
    refreshTree()
  }, 0)
})
const refreshTree = () => {
  if (isBuilding) return
  const shownStarted = now()
  const indices = getShownIndices(tree) as number[]
  buildMetrics.shownIndicesMs += now() - shownStarted
  const selectionStarted = now()
  const selectionStates = getNodeSelectionStates(tree, indices) as number[]
  const collapsedStates = getNodeCollapsedStates(tree, indices) as number[]
  buildMetrics.selectionStatesMs += now() - selectionStarted
  currentTreeList.value = indices
    .map((index, position) => {
      const node = allNodesCache[index]
      if (node) {
        const state = selectionStates[position]
        const collapsed = collapsedStates[position] !== 0
        const checked = state >> 8
        const selected = state & 0xff
        if (
          node.checked !== checked ||
          node.selected !== selected ||
          node.collapsed !== collapsed
        ) {
          // Cache entries may already be Vue proxies in a reused virtual row.
          // Replace the changed entry so the child receives a new prop value.
          allNodesCache[index] = {
            ...node,
            checked,
            selected,
            collapsed,
          }
        }
      }
      return allNodesCache[index]
    })
    .filter((node): node is TreeNodeData => node !== undefined)
}
const refreshAllNodesCache = () => {
  // ID-only trees do not need the full JSON serializer just to render rows.
  // Read the compact MPTT layout directly and rebuild the presentation cache
  // from the original input data. This avoids a large synchronous
  // serialize/parse round-trip when switching to a large tree.
  {
    const ids = getAllNodeIds(tree) as string[]
    const layouts = getAllNodeLayouts(tree) as number[]
    const idField = props.fieldKeys.idField ?? 'id'
    const nameField = props.fieldKeys.nameField ?? 'name'
    const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
    const inputById = new Map<string, TreeInputItem & Record<string, unknown>>()
    for (const item of props.tree as Array<
      TreeInputItem & Record<string, unknown>
    >) {
      inputById.set(String(item[idField] ?? ''), item)
    }
    allNodesCache = ids.map((id, index) => {
      const item = inputById.get(id)
      const offset = index * 4
      return {
        id,
        name: String(item?.[nameField] ?? id),
        parentId: String(item?.[parentIdField] ?? ''),
        leftNode: layouts[offset],
        rightNode: layouts[offset + 1],
        deep: layouts[offset + 2],
        checked: CheckType.UNCHECKED,
        selected: CheckType.UNCHECKED,
        collapsed: true,
        disabled: layouts[offset + 3] !== 0,
        extendData: item,
      }
    })
    refreshTree()
    return
  }
  allNodesCache = JSON.parse(getAllNodes(tree)) as TreeNodeData[]
  refreshTree()
}
// A macrotask yields the main thread for rendering without relying on rAF.
// Browser test iframes can throttle rAF to seconds while backgrounded.
const nextBuildTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const canUseChunkedBuild = () =>
  props.chunkedBuild && props.outputIdOnly && !props.filterFn
const utf8Encoder = new TextEncoder()
const encodeNeighborBatch = (
  batch: Array<TreeInputItem & Record<string, unknown>>,
  idField: string,
  nameField: string,
  parentIdField: string
) => {
  const values = new Array<string>(batch.length * 3)
  const encoded = new Array<Uint8Array>(batch.length * 3)
  let payloadLength = batch.length * 16
  for (let index = 0; index < batch.length; index++) {
    const node = batch[index]
    const valueIndex = index * 3
    values[valueIndex] = String(node[idField] ?? '')
    values[valueIndex + 1] = String(node[nameField] ?? '')
    values[valueIndex + 2] = String(node[parentIdField] ?? '')
    encoded[valueIndex] = utf8Encoder.encode(values[valueIndex])
    encoded[valueIndex + 1] = utf8Encoder.encode(values[valueIndex + 1])
    encoded[valueIndex + 2] = utf8Encoder.encode(values[valueIndex + 2])
    payloadLength += encoded[valueIndex].length
    payloadLength += encoded[valueIndex + 1].length
    payloadLength += encoded[valueIndex + 2].length
  }
  const payload = new Uint8Array(payloadLength)
  const view = new DataView(payload.buffer)
  let cursor = 0
  for (let index = 0; index < batch.length; index++) {
    const valueIndex = index * 3
    const lengths = [
      encoded[valueIndex].length,
      encoded[valueIndex + 1].length,
      encoded[valueIndex + 2].length,
      batch[index].disabled === true ? 1 : 0,
    ]
    view.setInt32(cursor, lengths[0], true)
    view.setInt32(cursor + 4, lengths[1], true)
    view.setInt32(cursor + 8, lengths[2], true)
    view.setInt32(cursor + 12, lengths[3], true)
    cursor += 16
    payload.set(encoded[valueIndex], cursor)
    cursor += lengths[0]
    payload.set(encoded[valueIndex + 1], cursor)
    cursor += lengths[1]
    payload.set(encoded[valueIndex + 2], cursor)
    cursor += lengths[2]
  }
  return payload
}
const loadTree = async () => {
  if (!canUseChunkedBuild()) {
    setNeighborTree(tree, JSON.stringify(props.tree))
    return
  }

  const size = Math.max(1, Math.floor(props.buildBatchSize))
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  for (let start = 0; start < props.tree.length; start += size) {
    const batch = props.tree.slice(start, start + size) as Array<
      TreeInputItem & Record<string, unknown>
    >
    const bridgeStarted = now()
    const payload = encodeNeighborBatch(
      batch,
      idField,
      nameField,
      parentIdField
    )
    pushNeighborNodesUtf8(tree, payload)
    buildMetrics.inputBridgeMs += now() - bridgeStarted
    if (start + size < props.tree.length) {
      const yieldStarted = now()
      await nextBuildTurn()
      buildMetrics.inputYieldMs += now() - yieldStarted
    }
  }
  const finalizeStarted = now()
  popNeighbor(tree)
  buildMetrics.finalizeMs += now() - finalizeStarted
}
const refreshChunkedNodesCache = async () => {
  const size = Math.max(1, Math.floor(props.buildBatchSize))
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const input = props.tree as Array<TreeInputItem & Record<string, unknown>>
  const layoutBridgeStarted = now()
  const layouts = getInputNodeLayouts(tree) as number[]
  buildMetrics.layoutBridgeMs += now() - layoutBridgeStarted
  const cache = new Array<TreeNodeData>(getSize(tree))
  for (let start = 0; start < input.length; start += size) {
    const end = Math.min(start + size, input.length)
    const assemblyStarted = now()
    for (let index = start; index < end; index++) {
      const node = input[index]
      const offset = index * 5
      const fullIndex = layouts[offset]
      if (fullIndex < 0) continue
      cache[fullIndex] = {
        id: String(node[idField] ?? ''),
        name: String(node[nameField] ?? ''),
        parentId: String(node[parentIdField] ?? ''),
        leftNode: layouts[offset + 1],
        rightNode: layouts[offset + 2],
        deep: layouts[offset + 3],
        checked: CheckType.UNCHECKED,
        selected: CheckType.UNCHECKED,
        collapsed: true,
        disabled: layouts[offset + 4] !== 0,
        extendData: node,
      }
    }
    buildMetrics.cacheAssemblyMs += now() - assemblyStarted
    if (start + size < input.length) {
      const yieldStarted = now()
      await nextBuildTurn()
      buildMetrics.cacheYieldMs += now() - yieldStarted
    }
  }
  const layoutReleaseStarted = now()
  clearInputNodeLayouts(tree)
  buildMetrics.layoutReleaseMs += now() - layoutReleaseStarted
  allNodesCache = cache
  const refreshStarted = now()
  refreshTree()
  buildMetrics.cacheRefreshMs += now() - refreshStarted
  // The tree and its JS presentation cache are now coherent. Mark readiness
  // here instead of depending on a later mounted-hook continuation.
  buildMetrics.totalMs = now() - buildStartedAt
  isTreeReady = true
}
const refreshNodesCache = async () => {
  if (canUseChunkedBuild()) await refreshChunkedNodesCache()
  else refreshAllNodesCache()
}
/** 滚动 rAF 标记：合并同一帧内的多次滚动事件 */
let scrollRafId = 0
const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  if (isTreeAnimating()) {
    if (target.scrollTop !== frozenScrollTop) target.scrollTop = frozenScrollTop
    return
  }
  scrollTop = target.scrollTop
  startOffset.value = scrollTop - (scrollTop % props.lineHeight)
  if (isUsingWorker()) {
    postWorker('boundary', { scrollTop, scrollHeight })
    return
  }
  setBoundary(tree, scrollTop, scrollHeight)
  refreshTree()
}
/**
 * 根据 outputIdOnly 配置发射选中结果
 * Emit checked result according to outputIdOnly config
 */
/** 按防抖输出选中结果 / Emit checked result with debounce / Выдать результат выбора с антидребезгом */
const emitCheckedResult = () => {
  const ids = isUsingWorker()
    ? workerCheckedIds
    : (getCheckedIdList(tree) as string[])
  const records = ids
    .map(id => inputNodeById.get(id))
    .filter((item): item is Record<string, unknown> => item !== undefined)
  if (props.checkedOutputMode === CheckedOutputMode.Custom && props.filterFn) {
    // Custom 模式：获取完整节点数据，用 filterFn 过滤后再决定输出 ID 还是 JSON
    // Custom mode: get full node data, filter with filterFn, then decide ID or JSON output
    // Пользовательский режим: получить полные данные узлов, отфильтровать filterFn, затем решить, выводить ID или JSON
    // getCheckedNodes 返回的是 extendData 原始 JSON（非 TreeNodeData 结构），直接传给 filterFn
    const filtered = records.filter(item => props.filterFn!(item))
    const result = props.outputIdOnly ? filtered.map(item => item.id) : filtered
    emit('update:modelValue', result)
  } else if (!props.outputIdOnly) {
    emit(
      'update:modelValue',
      props.selectType === SelectType.CHECKBOX ? records : (records[0] ?? null)
    )
  } else {
    const result =
      props.outputIdOnly && props.selectType === SelectType.CHECKBOX
        ? ids
        : props.outputIdOnly
          ? isUsingWorker()
            ? (ids[0] ?? '')
            : JSON.parse(getCheckedIds(tree))
          : records
    emit('update:modelValue', result)
  }
}

/** rAF 包裹的滚动处理：跟随浏览器渲染帧，减少无效回调 */
const scrollEvent = (event: Event) => {
  if (isTreeAnimating()) {
    const target = event.target as HTMLElement
    if (target.scrollTop !== frozenScrollTop) target.scrollTop = frozenScrollTop
    return
  }
  releaseSettledRenderPlan()
  if (scrollRafId) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = 0
    handleScroll(event)
  })
}
/** CSS transform 偏移量：虚拟滚动定位 / CSS transform offset: virtual scroll positioning / Смещение CSS transform: позиционирование виртуальной прокрутки */
const transformOffset = computed(
  () => `translate3d(0,${startOffset.value}px,0)`
)

/** Prevent native scrolling only for the brief period where virtual geometry is
 * represented by the transition layer. */
const preventScrollWhileAnimating = (event: Event) => {
  if (isTreeAnimating()) event.preventDefault()
}

const rowsInside = (items: TreeNodeData[], parent: TreeNodeData) =>
  items.filter(
    item =>
      item.leftNode > parent.leftNode && item.leftNode < parent.rightNode
  )

const finishTreeAnimation = () => {
  const animation = treeAnimation.value
  if (!animation || animation.phase !== 'running') return
  if (animationTimer !== undefined) {
    clearTimeout(animationTimer)
    animationTimer = undefined
  }
  // Do not switch back to the normal v-for here: that would remount every
  // stable row around the branch and produces a visible flash. For collapse,
  // the transition div simply disappears. For expansion, only its own rows
  // are promoted to ordinary rows; before/after rows retain their DOM.
  treeAnimation.value = { ...animation, phase: 'settled' }
  animationOpen.value = false

  const resizeHeight = pendingResizeHeight
  if (resizeHeight !== undefined) {
    scrollHeight = resizeHeight
    pendingResizeHeight = undefined
  }
  if (isUsingWorker()) {
    // The worker has already supplied the final viewport rows. Returning to
    // normal rendering must not consult the dormant main-thread WASM tree.
    // Keep the settled render plan, just like main-thread mode: replacing it
    // immediately remounts all surrounding virtual rows and causes a flash.
    if (resizeHeight !== undefined)
      postWorker('boundary', { scrollTop, scrollHeight })
    return
  }
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

/** Selection can still be changed during an animation. Rebind the temporary
 * rows to the refreshed cache so their controls do not show stale state. */
const syncAnimationRows = () => {
  const animation = treeAnimation.value
  if (!animation) return
  const latestById = new Map(allNodesCache.map(item => [item.id, item]))
  const sync = (rows: TreeNodeData[]) =>
    rows.map(item => latestById.get(item.id) ?? item)
  treeAnimation.value = {
    ...animation,
    before: sync(animation.before),
    rows: sync(animation.rows),
    after: sync(animation.after),
  }
}

/** Worker snapshots update the ordinary virtual list first. If a completed
 * branch animation is still holding stable DOM, rebind those same DOM rows to
 * the fresh snapshot rather than dropping the plan (which would flash). */
const syncWorkerAnimationRows = () => {
  const animation = treeAnimation.value
  if (!animation) return
  const latestById = new Map(currentTreeList.value.map(item => [item.id, item]))
  const sync = (rows: TreeNodeData[]) =>
    rows.map(item => latestById.get(item.id) ?? item)
  treeAnimation.value = {
    ...animation,
    before: sync(animation.before),
    rows: sync(animation.rows),
    after: sync(animation.after),
  }
}

const startTreeAnimation = async (
  direction: TreeAnimation['direction'],
  parent: TreeNodeData,
  beforeChange: TreeNodeData[],
  afterChange: TreeNodeData[]
) => {
  const parentIndex = afterChange.findIndex(item => item.id === parent.id)
  if (parentIndex < 0) return

  const rows =
    direction === 'expand'
      ? rowsInside(afterChange, parent)
      : rowsInside(beforeChange, parent)
  if (rows.length === 0) return

  const after =
    direction === 'expand'
      ? afterChange.slice(parentIndex + rows.length + 1)
      : afterChange.slice(parentIndex + 1)
  treeAnimation.value = {
    direction,
    phase: 'running',
    before: afterChange.slice(0, parentIndex + 1),
    rows,
    after,
    height: rows.length * props.lineHeight,
  }
  frozenScrollTop = scrollTop
  // Collapse begins open and closes; expansion follows the inverse sequence.
  animationOpen.value = direction === 'collapse'
  await nextTick()
  requestAnimationFrame(() => {
    if (!isTreeAnimating()) return
    animationOpen.value = direction === 'expand'
  })
  // transitionend is not guaranteed (e.g. a tab is backgrounded), so the
  // timeout always returns the component to normal virtual rendering.
  animationTimer = setTimeout(finishTreeAnimation, animationDuration + 80)
}

const fk = props.fieldKeys
const hasCustomKeys =
  fk.idField ||
  fk.nameField ||
  fk.parentIdField ||
  fk.leftNodeField ||
  fk.rightNodeField
const tree = hasCustomKeys
  ? newTreeWithKeys(
      props.root,
      props.lineHeight,
      props.selectType,
      fk.idField ?? 'id',
      fk.nameField ?? 'name',
      fk.parentIdField ?? 'parentId',
      fk.leftNodeField ?? 'leftNode',
      fk.rightNodeField ?? 'rightNode',
      false
    )
  : newTree(props.root, props.lineHeight, props.selectType, false)

// 初始化 CHECKBOX 输出模式
const inputNodeById = new Map<string, Record<string, unknown>>()
const inputIdField = props.fieldKeys.idField ?? 'id'
for (const item of props.tree as Array<
  TreeInputItem & Record<string, unknown>
>) {
  inputNodeById.set(String(item[inputIdField] ?? ''), item)
}

const refreshInputNodeById = (items: TreeMutationItem[]) => {
  const idField = props.fieldKeys.idField ?? 'id'
  inputNodeById.clear()
  for (const item of items) inputNodeById.set(String(item[idField] ?? ''), item)
}

// Vue props may be reactive proxies, which the structured-clone algorithm used
// by Worker.postMessage rejects. Tree input is JSON-shaped by contract.
const cloneForWorker = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const postWorker = (type: string, payload: Record<string, unknown> = {}) => {
  if (!worker) return undefined
  try {
    const revision = ++workerRevision
    workerCommandStartedAt.set(revision, now())
    workerMetrics.commandsSent++
    workerMetrics.pendingCommands = workerCommandStartedAt.size
    worker.postMessage(
      cloneForWorker({ type, revision, ...payload })
    )
    return revision
  } catch {
    worker.terminate()
    worker = undefined
    workerCommandStartedAt.clear()
    workerMetrics.pendingCommands = 0
    workerMetrics.enabled = false
    void initializeMainTree()
    return undefined
  }
}

const postWorkerTransfer = (
  type: string,
  payload: Record<string, unknown>,
  transfer: Transferable[]
) => {
  if (!worker) return undefined
  try {
    const revision = ++workerRevision
    workerCommandStartedAt.set(revision, now())
    workerMetrics.commandsSent++
    workerMetrics.pendingCommands = workerCommandStartedAt.size
    worker.postMessage({ type, revision, ...payload }, transfer)
    return revision
  } catch {
    worker.terminate()
    worker = undefined
    workerCommandStartedAt.clear()
    workerMetrics.pendingCommands = 0
    workerMetrics.enabled = false
    void initializeMainTree()
    return undefined
  }
}

const workerConfig = () => ({
  root: props.root,
  lineHeight: props.lineHeight,
  selectType: props.selectType,
  checkedOutputMode: props.checkedOutputMode,
  fieldKeys: props.fieldKeys,
  preorderedInput: props.preorderedInput,
})

const streamWorkerTree = async () => {
  if (!worker) return
  postWorker('stream-start', {
    config: workerConfig(),
    scrollTop,
    scrollHeight,
  })
  const size = Math.max(1, Math.floor(props.buildBatchSize))
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  for (let start = 0; start < props.tree.length; start += size) {
    if (!worker) return
    const payload = encodeNeighborBatch(
      props.tree.slice(start, start + size) as Array<
        TreeInputItem & Record<string, unknown>
      >,
      idField,
      nameField,
      parentIdField
    )
    postWorkerTransfer('stream-batch', { payload: payload.buffer }, [payload.buffer])
    if (start + size < props.tree.length) await nextBuildTurn()
  }
  postWorker('stream-finish')
}

const applyWorkerMutation = (mutation: any) => {
  if (!mutation) return
  const idField = props.fieldKeys.idField ?? 'id'
  let next = workerInput
  const mutations = mutation.type === 'batch' ? mutation.mutations ?? [] : [mutation]
  let changed = false
  for (const item of mutations) {
    if (item.type === 'update') {
      next = next.map(node =>
        String(node[idField] ?? '') === item.id ? { ...node, ...item.patch } : node
      )
      changed = true
    } else if (item.type === 'add') {
      next = [...next, item.node]
      changed = true
    } else if (item.type === 'remove') {
      const removed = new Set<string>(item.ids)
      next = next.filter(node => !removed.has(String(node[idField] ?? '')))
      changed = true
    }
  }
  if (!changed) return
  workerInput = next
  awaitingWorkerTreeEchoes++
  refreshInputNodeById(next)
  emit('update:tree', next)
}

const startWorker = () => {
  if (!props.workerMode || typeof Worker === 'undefined') return false
  worker = new Worker(new URL('./tree.worker.ts', import.meta.url), {
    type: 'module',
  })
  workerMetrics.enabled = true
  worker.onmessage = event => {
    const snapshot = event.data as {
      type: string
      revision: number
      size: number
      listHeight: number
      rows: TreeNodeData[]
      checkedIds?: string[]
      mutation?: unknown
      metrics?: {
        structuralBatches: number
        structuralOperations: number
        lastBatchSize: number
        lastResponseMs: number
        lastSerializeMs: number
      }
    }
    if (snapshot.type === 'boot' || snapshot.type === 'ready') return
    if (snapshot.type === 'checked') {
      if (snapshot.checkedIds !== undefined) {
        workerCheckedIds = snapshot.checkedIds
        emitCheckedResult()
      }
      return
    }
    if (snapshot.type === 'fatal') {
      console.error('VueGiantTree worker failed', (snapshot as any).error)
      worker?.terminate()
      worker = undefined
      workerMetrics.enabled = false
      void initializeMainTree()
      return
    }
    if (snapshot.type !== 'snapshot') return
    const commandStartedAt = workerCommandStartedAt.get(snapshot.revision)
    if (commandStartedAt !== undefined)
      workerMetrics.lastRoundTripMs = now() - commandStartedAt
    for (const revision of workerCommandStartedAt.keys()) {
      if (revision <= snapshot.revision) workerCommandStartedAt.delete(revision)
    }
    workerMetrics.pendingCommands = workerCommandStartedAt.size
    workerMetrics.snapshotsReceived++
    workerMetrics.visibleRows = snapshot.rows.length
    if (snapshot.metrics) {
      workerMetrics.lastWorkerResponseMs = snapshot.metrics.lastResponseMs
      workerMetrics.lastWorkerSerializeMs = snapshot.metrics.lastSerializeMs
      workerMetrics.structuralBatches = snapshot.metrics.structuralBatches
      workerMetrics.structuralOperations = snapshot.metrics.structuralOperations
      workerMetrics.lastBatchSize = snapshot.metrics.lastBatchSize
    }
    // A structural reply also carries the controlled `update:tree` echo.
    // Do not drop that echo merely because a later boundary command has
    // already incremented the local revision; the later snapshot has no
    // mutation payload to replay it. Ordinary stale viewport snapshots remain
    // safely discardable.
    if (snapshot.revision < workerRevision && !snapshot.mutation) return
    const hasCheckedResult = snapshot.checkedIds !== undefined
    if (snapshot.checkedIds !== undefined) workerCheckedIds = snapshot.checkedIds
    workerTreeSize = snapshot.size
    isTreeReady = true
    listHeight.value = snapshot.listHeight
    currentTreeList.value = snapshot.rows.map(row => ({
      ...row,
      extendData: inputNodeById.get(row.id),
    }))
    // A settled expand/collapse plan deliberately keeps its old row set mounted
    // to avoid a visual flash. It is only valid while the tree structure is
    // unchanged: otherwise an added or removed row can never enter/leave that
    // retained plan. Content edits still rebind safely below, but structural
    // mutations must immediately return to the live virtual-list rows.
    if (snapshot.mutation) releaseSettledRenderPlan()
    syncWorkerAnimationRows()
    if (
      pendingWorkerCollapse &&
      snapshot.revision >= pendingWorkerCollapse.revision
    ) {
      const pending = pendingWorkerCollapse
      pendingWorkerCollapse = undefined
      const parent = pending.before.find(item => item.id === pending.id)
      if (parent) {
        void startTreeAnimation(
          pending.collapsed ? 'collapse' : 'expand',
          parent,
          pending.before,
          currentTreeList.value.slice()
        )
      }
    }
    applyWorkerMutation(snapshot.mutation)
    if (hasCheckedResult) emitCheckedResult()
  }
  worker.onerror = event => {
    console.error('VueGiantTree worker failed', event.message)
    worker?.terminate()
    worker = undefined
    workerMetrics.enabled = false
    void initializeMainTree()
  }
  void streamWorkerTree()
  return true
}

const initializeMainTree = async () => {
  clear(tree)
  // Input-order layouts are only consumed by refreshChunkedNodesCache().
  // Avoid allocating/filling an O(N) bridge in the normal build path.
  setTrackInputLayouts(tree, canUseChunkedBuild())
  setUsePreorderedNeighborInput(tree, props.preorderedInput)
  isBuilding = true
  resetBuildMetrics()
  buildStartedAt = now()
  if (props.tree.length > 0) await loadTree()
  isBuilding = false
  await refreshNodesCache()
  buildMetrics.totalMs = now() - buildStartedAt
  isTreeReady = true
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

setCheckedOutputMode(tree, props.checkedOutputMode)

// 输出格式变化（ID ↔ JSON）→ 用新格式重发选中结果
watch(
  () => props.outputIdOnly,
  () => {
    // Output representation is derived from existing WASM selection state.
    // Changing it must not rebuild the tree or serialize the full dataset.
    emitCheckedResult()
  }
)

// CHECKBOX 过滤模式变化 → 更新 WASM 树 + 重发
watch(
  () => props.checkedOutputMode,
  newMode => {
    if (isUsingWorker()) {
      postWorker('set-output', { mode: newMode })
      return
    }
    setCheckedOutputMode(tree, newMode)
    emitCheckedResult()
  }
)

/** 挂载时初始化: 观察容器大小、加载树数据、立即渲染首屏 / On mount: observe container, load tree data, render initial viewport immediately / При монтировании: наблюдать за контейнером, загрузить данные дерева, сразу отрендерить начальный viewport */
onMounted(async () => {
  ro.observe(container.value!)
  if (startWorker()) return
  await initializeMainTree()
})
onUnmounted(() => {
  worker?.terminate()
  worker = undefined
  ro.disconnect()
  if (resizeRefreshTimer !== undefined) {
    clearTimeout(resizeRefreshTimer)
    resizeRefreshTimer = undefined
  }
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId)
    scrollRafId = 0
  }
  if (animationTimer !== undefined) clearTimeout(animationTimer)
})
/** 行点击（SELECT 模式选中节点） / Row click (selects node in SELECT mode) / Клик по строке (выбирает узел в режиме SELECT) */
const itemClick = (id: string) => {
  if (props.selectType === SelectType.SELECT) {
    if (isUsingWorker()) {
      postWorker('check', { id, checked: CheckType.CHECKED })
      return
    }
    checkNode(tree, id, CheckType.CHECKED)
    emitCheckedResult()
    refreshTree()
    syncAnimationRows()
  }
}
/** 展开/折叠节点 / Expand/collapse node / Развернуть/свернуть узел */
const setAllCollapsed = (collapsed: boolean) => {
  // A completed branch animation intentionally keeps stable rows mounted.
  // Global visibility changes replace the entire viewport, so that stale plan
  // must be released before applying the Worker/main-tree result.
  if (isTreeAnimating()) return
  releaseSettledRenderPlan()
  if (isUsingWorker()) {
    postWorker('collapse-all', { collapsed })
    return
  }
  collapseAll(tree, collapsed)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

const collapseClick = (id: string, isCollapse: boolean) => {
  if (isUsingWorker()) {
    if (isTreeAnimating() || pendingWorkerCollapse) return
    const revision = postWorker('collapse', { id, collapsed: isCollapse })
    if (revision !== undefined) {
      pendingWorkerCollapse = {
        revision,
        id,
        collapsed: isCollapse,
        before: currentTreeList.value.slice(),
      }
    }
    return
  }
  if (isTreeAnimating()) return
  releaseSettledRenderPlan()
  const beforeChange = currentTreeList.value.slice()
  const parent = beforeChange.find(item => item.id === id)
  collapseTree(tree, id, isCollapse)
  listHeight.value = getShownHeight(tree)
  // Do not mutate the cached node here. refreshTree deliberately replaces a
  // changed cache entry so virtual rows receive a new prop reference; mutating
  // first would make it miss the collapsed-state transition.
  refreshTree()
  if (parent) {
    void startTreeAnimation(
      isCollapse ? 'collapse' : 'expand',
      parent,
      beforeChange,
      currentTreeList.value.slice()
    )
  }
}
/** 复选框/单选框点击 / Checkbox/radio click / Клик по чекбоксу/радио */
const checkClick = (id: string, checkType: CheckType) => {
  if (isUsingWorker()) {
    postWorker('check', { id, checked: checkType })
    return
  }
  checkNode(tree, id, checkType)
  emitCheckedResult()
  refreshTree()
  syncAnimationRows()
}

/** 模糊搜索（无防抖，立即执行）/ Fuzzy search (no debounce, immediate) / Нечёткий поиск (без антидребезга, немедленно) */
const rawFuzzySearch = (keyword: string) => {
  activeSearchKeyword = keyword
  if (isUsingWorker()) {
    postWorker('search', { keyword })
    return
  }
  fuzzyTree(tree, keyword)
  listHeight.value = getShownHeight(tree)
  // Viewport state is read from CompactNodeStore on every refresh, including
  // nodes that reappear after search. Avoid serializing the full tree solely
  // to rebuild the JS cache when clearing a search.
  refreshTree()
}
/** 带 300ms 防抖的模糊搜索（适合 input 实时输入）/ Fuzzy search with 300ms debounce (suitable for real-time input) / Нечёткий поиск с антидребезгом 300мс (подходит для ввода в реальном времени) */
const fuzzySearch = debounce(300, rawFuzzySearch)

/** 获取树节点总数 / Get total tree node count / Получить общее количество узлов дерева */
const getTreeSize = (): number => {
  return isUsingWorker() ? workerTreeSize : getSize(tree)
}

const getBuildReady = (): boolean => isTreeReady
const getBuildMetrics = (): BuildMetrics => ({ ...buildMetrics })
/** Worker queue, transfer and serialization timings for diagnostics. */
const getWorkerMetrics = (): WorkerMetrics => ({
  ...workerMetrics,
  pendingCommands: workerCommandStartedAt.size,
})

/** 单选设置选中节点 / Set checked node (single-select) / Установить выбранный узел (одиночный выбор) */
const setChecked = (id: string) => {
  if (isUsingWorker()) {
    postWorker('set-check', { id })
    return
  }
  setCheckedNode(tree, id)
  emitCheckedResult()
  listHeight.value = getShownHeight(tree)
  refreshTree()
  syncAnimationRows()
}

/** 批量设置选中节点 / Batch set checked nodes / Пакетная установка выбранных узлов */
const setCheckedByIds = (ids: string[]) => {
  if (isUsingWorker()) {
    postWorker('set-checks', { ids })
    return
  }
  setCheckedNodes(tree, ids)
  emitCheckedResult()
  listHeight.value = getShownHeight(tree)
  refreshTree()
  syncAnimationRows()
}

/** 清除所有选中状态 / Clear all check states / Очистить все состояния выбора */
const clearAllChecked = () => {
  if (isUsingWorker()) {
    postWorker('clear-check')
    return
  }
  clearCheckedNodes(tree)
  emitCheckedResult()
  refreshTree()
  syncAnimationRows()
}

/** 切换显示模式（完整树↔搜索树） / Switch display mode (full tree ↔ search tree) / Переключение режима отображения (полное дерево ↔ дерево поиска) */
const switchDisplay = (displayType: DisplayType) => {
  if (isUsingWorker()) {
    // Search commands already select the worker's search view. Clearing search
    // returns to TREE; explicit view switching is otherwise a no-op here.
    if (displayType === DisplayType.TREE && activeSearchKeyword) {
      activeSearchKeyword = ''
      postWorker('search', { keyword: '' })
    }
    return
  }
  switchDisplayTree(tree, displayType)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

/** 重新发射当前选中结果（模式切换后刷新格式用）/ Re-emit current checked result (for format refresh after mode switch) / Повторно выдать текущий результат выбора (для обновления формата после переключения режима) */
const refreshCheckedResult = () => {
  emitCheckedResult()
}

/**
 * Rebuild the structural MPTT index in-place after the input data changes.
 * Vue keeps the same component instance, while ID-based interaction state is
 * restored onto the new index. Structural edits necessarily get new MPTT
 * boundaries; presentation-only edits still use this path for consistency
 * with the controlled `tree` prop.
 */
const reconcileTreeData = async () => {
  if (!isTreeReady || isBuilding) return

  const expandedIds = allNodesCache
    .filter(node => !node.collapsed && node.rightNode - node.leftNode > 1)
    .map(node => node.id)
  const checkedIds = (getCheckedIdList(tree) as string[]).slice()

  releaseSettledRenderPlan()
  clear(tree)
  setTrackInputLayouts(tree, canUseChunkedBuild())
  setUsePreorderedNeighborInput(tree, props.preorderedInput)
  isBuilding = true
  try {
    if (props.tree.length > 0) await loadTree()
    await refreshNodesCache()

    for (const id of expandedIds) collapseTree(tree, id, false)
    if (checkedIds.length > 0) setCheckedNodes(tree, checkedIds)
    if (activeSearchKeyword) fuzzyTree(tree, activeSearchKeyword)
  } finally {
    isBuilding = false
  }

  await nextTick()
  scrollTop = container.value?.scrollTop ?? scrollTop
  startOffset.value = scrollTop - (scrollTop % props.lineHeight)
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  refreshTree()
  emitCheckedResult()
}

/** Update raw input data through v-model:tree. Node IDs are immutable. */
const updateNode = (id: string, patch: TreeNodePatch): boolean => {
  const idField = props.fieldKeys.idField ?? 'id'
  const input = props.tree as TreeMutationItem[]
  if (idField in patch && String(patch[idField]) !== id) return false
  const index = input.findIndex(item => String(item[idField] ?? '') === id)
  if (index < 0) return false
  if (isUsingWorker()) {
    postWorker('update', { id, patch })
    return true
  }

  const next = input.slice()
  next[index] = { ...next[index], ...patch }
  const nameField = props.fieldKeys.nameField ?? 'name'
  const updatePresentation = (node: TreeNodeData) =>
    node.id === id
      ? {
          ...node,
          name:
            nameField in patch ? String(patch[nameField] ?? node.name) : node.name,
          extendData: next[index],
        }
      : node
  allNodesCache = allNodesCache.map(updatePresentation)
  currentTreeList.value = currentTreeList.value.map(updatePresentation)
  if (treeAnimation.value) {
    treeAnimation.value = {
      ...treeAnimation.value,
      before: treeAnimation.value.before.map(updatePresentation),
      rows: treeAnimation.value.rows.map(updatePresentation),
      after: treeAnimation.value.after.map(updatePresentation),
    }
  }
  refreshInputNodeById(next)
  // Content-only patches do not change parentage, order, or MPTT boundaries.
  // The v-model echo is intentionally ignored by the structural reconciler.
  skipNextPresentationOnlyReconcile = true
  emit('update:tree', next)
  return true
}

/** Insert a node under root or an existing parent through v-model:tree. */
const addNode = (node: TreeMutationItem): boolean => {
  const idField = props.fieldKeys.idField ?? 'id'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const input = props.tree as TreeMutationItem[]
  const id = String(node[idField] ?? '')
  const parentId = String(node[parentIdField] ?? '')
  if (!id || input.some(item => String(item[idField] ?? '') === id)) {
    return false
  }
  if (
    parentId !== props.root &&
    !input.some(item => String(item[idField] ?? '') === parentId)
  ) {
    return false
  }
  // A settled branch animation owns a fixed row set. Structural commands must
  // give the regular virtual list ownership again before their async Worker
  // snapshot arrives, otherwise that snapshot can only rebind stale rows.
  releaseSettledRenderPlan()
  if (isUsingWorker()) {
    postWorker('add', { node })
    return true
  }

  emit('update:tree', [...input, { ...node }])
  return true
}

/** Remove a node and every descendant through v-model:tree. */
const removeNode = (id: string): boolean => {
  const idField = props.fieldKeys.idField ?? 'id'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const input = props.tree as TreeMutationItem[]
  if (!input.some(item => String(item[idField] ?? '') === id)) return false
  // See addNode: retained animation rows are not valid after a topology edit.
  releaseSettledRenderPlan()
  if (isUsingWorker()) {
    postWorker('remove', { id })
    return true
  }

  const childrenByParent = new Map<string, string[]>()
  for (const item of input) {
    const parentId = String(item[parentIdField] ?? '')
    const children = childrenByParent.get(parentId) ?? []
    children.push(String(item[idField] ?? ''))
    childrenByParent.set(parentId, children)
  }
  const idsToRemove = new Set<string>()
  const pendingIds = [id]
  while (pendingIds.length > 0) {
    const currentId = pendingIds.pop()!
    if (idsToRemove.has(currentId)) continue
    idsToRemove.add(currentId)
    pendingIds.push(...(childrenByParent.get(currentId) ?? []))
  }

  emit(
    'update:tree',
    input.filter(item => !idsToRemove.has(String(item[idField] ?? '')))
  )
  return true
}

watch(
  () => props.tree,
  tree => {
    if (isUsingWorker()) {
      if (awaitingWorkerTreeEchoes > 0) {
        awaitingWorkerTreeEchoes--
        workerInput = tree as TreeMutationItem[]
        return
      }
      workerInput = tree as TreeMutationItem[]
      refreshInputNodeById(tree as TreeMutationItem[])
      postWorker('replace', {
        config: {
          root: props.root,
          lineHeight: props.lineHeight,
          selectType: props.selectType,
          checkedOutputMode: props.checkedOutputMode,
          fieldKeys: props.fieldKeys,
        },
        tree,
        scrollTop,
        scrollHeight,
      })
      return
    }
    if (skipNextPresentationOnlyReconcile) {
      skipNextPresentationOnlyReconcile = false
      return
    }
    void reconcileTreeData()
  }
)

/** 暴露给父组件的方法 / Methods exposed to parent component / Методы, доступные родительскому компоненту */
defineExpose({
  fuzzySearch,
  fuzzySearchRaw: rawFuzzySearch,
  getTreeSize,
  getBuildReady,
  getBuildMetrics,
  getWorkerMetrics,
  setChecked,
  setCheckedByIds,
  clearAllChecked,
  expandAll: () => setAllCollapsed(false),
  collapseAll: () => setAllCollapsed(true),
  switchDisplay,
  refreshCheckedResult,
  updateNode,
  addNode,
  removeNode,
})
</script>

<!-- 虚拟滚动模板：phantom div 撑开总高度 → translate3d 定位可视节点 / Virtual scroll template: phantom div for total height + translate3d positions visible nodes / Шаблон виртуальной прокрутки: phantom div для общей высоты + translate3d позиционирует видимые узлы -->
<template>
  <div
    ref="container"
    class="giant-tree tree-container"
    :class="{ 'tree-container--animating': isTreeAnimating() }"
    :style="{ width: width, height: height }"
    tabindex="0"
    @scroll="scrollEvent"
    @wheel="preventScrollWhileAnimating"
    @touchmove="preventScrollWhileAnimating"
    @keydown="preventScrollWhileAnimating"
  >
    <div
      class="infinite-list-phantom"
      :style="{ height: listHeight + 'px' }"
    ></div>
    <div class="infinite-list" :style="{ transform: transformOffset }">
      <template v-if="treeAnimation">
        <tree-item
          v-for="item in treeAnimation.before"
          :key="item.id"
          :style="{ height: lineHeight + 'px' }"
          :item="item"
          :fontSize="fontSize"
          @collapse-click="collapseClick"
          :select-type="selectType"
          :filter-fn="filterFn"
          :node-icon="nodeIcon"
          @check-click="checkClick"
          @item-click="itemClick"
        >
          <template v-if="$slots.node" #node="slotProps">
            <slot name="node" v-bind="slotProps" />
          </template>
          <template v-if="$slots.actions" #actions="slotProps">
            <slot name="actions" v-bind="slotProps" />
          </template>
        </tree-item>
        <div
          v-if="treeAnimation.phase === 'running'"
          class="giant-tree__branch-transition"
          :class="`giant-tree__branch-transition--${treeAnimation.direction}`"
          :style="{
            height: (animationOpen ? treeAnimation.height : 0) + 'px',
          }"
          @transitionend.self="finishTreeAnimation"
        >
          <tree-item
            v-for="item in treeAnimation.rows"
            :key="item.id"
            :style="{ height: lineHeight + 'px' }"
            :item="item"
            :fontSize="fontSize"
            @collapse-click="collapseClick"
            :select-type="selectType"
            :filter-fn="filterFn"
            :node-icon="nodeIcon"
            @check-click="checkClick"
            @item-click="itemClick"
          >
            <template v-if="$slots.node" #node="slotProps">
              <slot name="node" v-bind="slotProps" />
            </template>
            <template v-if="$slots.actions" #actions="slotProps">
              <slot name="actions" v-bind="slotProps" />
            </template>
          </tree-item>
        </div>
        <!-- On expansion, replace only the completed wrapper with its normal
             rows. A completed collapse intentionally renders nothing here. -->
        <template
          v-else-if="treeAnimation.direction === 'expand'"
          v-for="item in treeAnimation.rows"
          :key="item.id"
        >
          <tree-item
            :style="{ height: lineHeight + 'px' }"
            :item="item"
            :fontSize="fontSize"
            @collapse-click="collapseClick"
            :select-type="selectType"
            :filter-fn="filterFn"
            :node-icon="nodeIcon"
            @check-click="checkClick"
            @item-click="itemClick"
          >
            <template v-if="$slots.node" #node="slotProps">
              <slot name="node" v-bind="slotProps" />
            </template>
            <template v-if="$slots.actions" #actions="slotProps">
              <slot name="actions" v-bind="slotProps" />
            </template>
          </tree-item>
        </template>
        <tree-item
          v-for="item in treeAnimation.after"
          :key="item.id"
          :style="{ height: lineHeight + 'px' }"
          :item="item"
          :fontSize="fontSize"
          @collapse-click="collapseClick"
          :select-type="selectType"
          :filter-fn="filterFn"
          :node-icon="nodeIcon"
          @check-click="checkClick"
          @item-click="itemClick"
        >
          <template v-if="$slots.node" #node="slotProps">
            <slot name="node" v-bind="slotProps" />
          </template>
          <template v-if="$slots.actions" #actions="slotProps">
            <slot name="actions" v-bind="slotProps" />
          </template>
        </tree-item>
      </template>
      <template v-for="item in currentTreeList" :key="item.id">
        <tree-item
          v-if="!treeAnimation"
          :style="{ height: lineHeight + 'px' }"
          :item="item"
          :fontSize="fontSize"
          @collapse-click="collapseClick"
          :select-type="selectType"
          :filter-fn="filterFn"
          :node-icon="nodeIcon"
          @check-click="checkClick"
          @item-click="itemClick"
        >
          <template v-if="$slots.node" #node="slotProps">
            <slot name="node" v-bind="slotProps" />
          </template>
          <template v-if="$slots.actions" #actions="slotProps">
            <slot name="actions" v-bind="slotProps" />
          </template>
        </tree-item>
      </template>
    </div>
  </div>
</template>

<style scoped></style>
