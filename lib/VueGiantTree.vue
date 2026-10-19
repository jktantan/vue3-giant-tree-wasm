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
  getAllNodeIds,
  getAllNodeLayouts,
  getShownIndices,
  getNodeSelectionStates,
  getNodeCollapsedStates,
  getInputNodeLayouts,
  clearInputNodeLayouts,
  setTrackInputLayouts,
  setUsePreorderedNeighborInput,
  updateNodeName,
  updateNodeDisabled,
} from '../build/release'

import { debounce } from 'throttle-debounce'
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRaw,
  watch,
} from 'vue'
import TreeItem from '@lib/TreeItem.vue'
import {
  computeGuideLines,
  resolveShowLineOptions,
  type GuideLineInfo,
} from './guide'
import type {
  TreeNodeData,
  TreeInputItem,
  TreeFieldKeys,
  FilterFn,
  NodeIconResolver,
  ShowLineOptions,
  TreeMutationItem,
  TreeNodePatch,
} from './types'
const props = withDefaults(
  defineProps<{
    modelValue: TreeNodeData | TreeNodeData[] | string | string[]
    width?: string
    height?: string
    lineHeight?: number
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
    /**
     * 连接线展示模式：
     * - `false` 关闭（默认）；
     * - `true` 开启，使用默认样式（实线 / `#d0d4dc` / 1px）；
     * - `ShowLineOptions` 进一步切换 `style: 'solid' | 'dashed' | 'dotted'`、`color`、`width`。
     *
     * Guide-line mode: `false` disables (default); `true` enables with defaults
     * (solid / `#d0d4dc` / 1px); `ShowLineOptions` further customizes shape, color, width.
     */
    showLine?: boolean | ShowLineOptions
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
    showLine: false,
  }
)
const emit = defineEmits([
  'update:modelValue',
  'update:tree',
  'item-contextmenu',
])
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
  /** 正在展开/折叠的父节点：过渡容器插在这一行之后。 */
  parentId: string
  /** 参与高度过渡的行：展开时是新出现的子行，折叠时是即将消失的子行。 */
  rows: TreeNodeData[]
  /**
   * 展开后虚拟窗口会把父节点之后的兄弟行挤出列表。动画期间仍要渲染它们，
   * 否则父节点下方会先塌成空白，容器再从空白里长出来。
   */
  extraRows: TreeNodeData[]
  height: number
  /** 本次过渡的时长，按高度换算（见 branchAnimationDuration）。 */
  duration: number
}
const treeAnimation = ref<TreeAnimation>()
const animationOpen = ref(false)
/**
 * 分支展开/折叠按「每毫秒移动多少像素」计时，而不是固定总时长：同样速度下，
 * 分支越高动画越久。上下限避免单行分支一闪而过、超高分支拖沓。
 */
const ANIMATION_PX_PER_MS = 1.2
const ANIMATION_MIN_DURATION = 120
const ANIMATION_MAX_DURATION = 400
const branchAnimationDuration = (height: number) =>
  Math.min(
    ANIMATION_MAX_DURATION,
    Math.max(ANIMATION_MIN_DURATION, Math.round(height / ANIMATION_PX_PER_MS))
  )
let animationTimer: ReturnType<typeof setTimeout> | undefined
let frozenScrollTop = 0
let pendingResizeHeight: number | undefined
let pendingWorkerCollapse:
  | { revision: number; id: string; collapsed: boolean; before: TreeNodeData[] }
  | undefined
const isTreeAnimating = () => treeAnimation.value !== undefined
/** 立即结束并释放当前过渡：容器消失，rows 交回普通列表。 */
const releaseTreeAnimation = () => {
  if (animationTimer !== undefined) {
    clearTimeout(animationTimer)
    animationTimer = undefined
  }
  animationOpen.value = false
  treeAnimation.value = undefined
}
let allNodesCache: TreeNodeData[] = []
/** Previous input array, used to recognize content-only tree replacements. */
let previousTreeInput: TreeInputItem[] | null = null
/** id → allNodesCache index, so single-node updates stay O(1). */
let allNodesIndexById = new Map<string, number>()
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
  enabled: false,
  pendingCommands: 0,
  commandsSent: 0,
  snapshotsReceived: 0,
  lastRoundTripMs: 0,
  lastWorkerResponseMs: 0,
  lastWorkerSerializeMs: 0,
  structuralBatches: 0,
  structuralOperations: 0,
  lastBatchSize: 0,
  visibleRows: 0,
}
const workerCommandStartedAt = new Map<number, number>()
/**
 * 宿主可能把树数据放在 Vue 的深度响应式数组里（`ref([...])`）：全量遍历时每次属性
 * 读取都会走 Proxy 的 get trap，并为嵌套对象惰性创建代理 —— 10 万节点实测比裸数组
 * 慢一个数量级（`JSON.stringify(ref.value)` 277ms vs 原始数组 17ms）。
 * 凡是全量遍历 / 序列化输入的地方都先过它；对普通数组 toRaw 是恒等操作。
 */
const rawTree = () => toRaw(props.tree)

// Worker replies can arrive before Vue has propagated the preceding v-model
// echo back through props. Keep the acknowledged controlled value locally so
// rapid replies compose instead of overwriting one another.
let workerInput: TreeMutationItem[] = rawTree() as TreeMutationItem[]
/** Previous content values for Worker mode, in input order. */
let workerSnapshotNames: string[] = []
let workerSnapshotParents: string[] = []
let workerSnapshotDisabled: Uint8Array = new Uint8Array(0)
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
  contentDiffMs: number
  contentDiffHits: number
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
  contentDiffMs: 0,
  contentDiffHits: 0,
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
    contentDiffMs: 0,
    contentDiffHits: 0,
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
/**
 * 连接线字段：showLine 开启时，按输入结构为每个节点预计算一次 isLastChild /
 * guideMask。几何只由结构决定、与折叠无关，所以一次算好即可覆盖主线程、worker
 * 可见切片与搜索视图等所有渲染路径，无需随可见集合重算。
 *
 * Guide-line map: computed once from the input structure when showLine is on.
 * Because the geometry never depends on the collapsed state, one pass covers
 * every render path (main thread, worker viewport slice, search view).
 */
const guideByNode = ref<Map<string, GuideLineInfo>>(new Map())
/**
 * `props.showLine` 的归一化结果：`enabled=false` 时模板走轻量占位分支，避免无谓渲染；
 * `enabled=true` 时把 `style` / `color` / `width` 透传给 `TreeItem`，由 CSS 变量生效。
 *
 * Normalized view of `props.showLine`: when disabled, the template takes the lightweight
 * placeholder path; when enabled, the resolved shape / color / width are forwarded to
 * `TreeItem` and applied via CSS variables.
 */
const showLineConfig = computed(() => resolveShowLineOptions(props.showLine))
/**
 * 把 guide 字段写到行对象上，但仅在值真正变化时替换对象——虚拟行靠引用比较决定
 * 是否重挂载，引用稳定才能保住「未变化行不重渲染」的优化。
 *
 * Attach guide fields, replacing the node only when a value actually changed, so
 * virtual rows keep their identity and are not remounted needlessly.
 */
const applyGuide = (node: TreeNodeData): TreeNodeData => {
  if (!showLineConfig.value.enabled) return node
  const guide = guideByNode.value.get(node.id)
  if (guide === undefined) return node
  if (
    node.isLastChild === guide.isLastChild &&
    node.guideMask === guide.guideMask &&
    node.markerLine === guide.markerLine
  ) {
    return node
  }
  return {
    ...node,
    isLastChild: guide.isLastChild,
    guideMask: guide.guideMask,
    markerLine: guide.markerLine,
  }
}
/** 重算连接线字段；运行时切换 showLine 或替换 tree/root/fieldKeys 时调用。 */
const rebuildGuideLines = () => {
  guideByNode.value = showLineConfig.value.enabled
    ? computeGuideLines(
        props.tree as TreeInputItem[],
        props.root,
        props.fieldKeys
      )
    : new Map()
}
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
      const cached = allNodesCache[index]
      if (cached === undefined) return undefined
      const guided = applyGuide(cached)
      if (guided !== cached) allNodesCache[index] = guided
      return guided
    })
    .filter((node): node is TreeNodeData => node !== undefined)
}
/** Rebuild the id → cache index used by content-only updates. */
const rebuildAllNodesIndex = () => {
  const index = new Map<string, number>()
  for (let i = 0; i < allNodesCache.length; i++)
    index.set(allNodesCache[i].id, i)
  allNodesIndexById = index
}

/** True when only `nameField` and the disabled flag changed. */
const shallowEqualExceptContent = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  nameField: string
): boolean => {
  const beforeKeys = Object.keys(before).filter(
    key => key !== nameField && key !== 'disabled'
  )
  const afterKeys = Object.keys(after).filter(
    key => key !== nameField && key !== 'disabled'
  )
  if (beforeKeys.length !== afterKeys.length) return false
  for (let i = 0; i < beforeKeys.length; i++) {
    const key = beforeKeys[i]
    if (!Object.prototype.hasOwnProperty.call(after, key)) return false
    if (before[key] !== after[key]) return false
  }
  return true
}

/**
 * Content-only reconciliation. Returns true when the new input keeps the same
 * id/parent order and only changes `name` / `disabled`, so the MPTT index,
 * visibility and selection state can all be reused. Structural edits,
 * custom-field edits, search mode and JSON output fall back to the full path.
 */
const tryContentOnlyReconcile = (next: TreeInputItem[]): boolean => {
  if (!isTreeReady || isBuilding) return false
  if (activeSearchKeyword.length > 0) return false
  if (!props.outputIdOnly || props.filterFn) return false
  const previous = previousTreeInput
  if (previous === null || previous.length !== next.length) return false
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const changes: Array<{
    id: string
    name: string
    disabled: boolean
    nameChanged: boolean
    disabledChanged: boolean
    inputIndex: number
  }> = []
  let disabledChanges = 0
  for (let i = 0; i < next.length; i++) {
    const before = previous[i] as unknown as Record<string, unknown>
    const after = next[i] as unknown as Record<string, unknown>
    const id = String(after[idField] ?? '')
    if (String(before[idField] ?? '') !== id) return false
    const cacheIndex = allNodesIndexById.get(id)
    if (cacheIndex === undefined) return false
    const cached = allNodesCache[cacheIndex]
    if (cached === undefined) return false
    const parentId = String(after[parentIdField] ?? '')
    // Compare against the rendered cache, not the previous input objects: a
    // caller may mutate rows in place and then replace the array, leaving
    // `previous` pointing at the already-mutated values.
    if (parentId !== cached.parentId) return false
    if (
      before !== after &&
      !shallowEqualExceptContent(before, after, nameField)
    )
      return false
    const name = String(after[nameField] ?? '')
    const nameChanged = cached.name !== name
    const disabled = after.disabled === true
    const disabledChanged = cached.disabled !== disabled
    if (!nameChanged && !disabledChanged) continue
    if (disabledChanged) disabledChanges++
    changes.push({
      id,
      name,
      disabled,
      nameChanged,
      disabledChanged,
      inputIndex: i,
    })
  }
  // Each disabled update rewrites the disabledPrefix suffix (O(N)); applying
  // thousands of them is far slower than one rebuild.
  if (disabledChanges > 64) return false
  previousTreeInput = next
  if (changes.length === 0) return true

  const startedAt = now()
  let selectionChanged = false
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (change.nameChanged) updateNodeName(tree, change.id, change.name)
    if (change.disabledChanged) {
      updateNodeDisabled(tree, change.id, change.disabled)
      selectionChanged = true
    }
    const cacheIndex = allNodesIndexById.get(change.id)
    if (cacheIndex === undefined) continue
    const cached = allNodesCache[cacheIndex]
    if (cached === undefined) continue
    allNodesCache[cacheIndex] = {
      ...cached,
      name: change.name,
      disabled: change.disabled,
      extendData: next[change.inputIndex] as unknown as Record<string, unknown>,
    }
  }
  refreshTree()
  if (selectionChanged) emitCheckedResult()
  buildMetrics.contentDiffMs += now() - startedAt
  buildMetrics.contentDiffHits++
  return true
}

const refreshAllNodesCache = () => {
  // ID-only trees do not need the full JSON serializer just to render rows.
  // Read the compact MPTT layout directly and rebuild the presentation cache
  // from the original input data. This avoids a large synchronous
  // serialize/parse round-trip when switching to a large tree.
  const ids = getAllNodeIds(tree) as string[]
  const layouts = getAllNodeLayouts(tree) as number[]
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const inputById = new Map<string, TreeInputItem & Record<string, unknown>>()
  for (const item of rawTree() as Array<
    TreeInputItem & Record<string, unknown>
  >) {
    inputById.set(String(item[idField] ?? ''), item)
  }
  allNodesCache = ids.map((id, index) => {
    const item = inputById.get(id)
    const offset = index * 4
    // Defensive fallback: if the input array is missing an id present in the
    // MPTT layout (e.g. a previous append/remove transient left stale state),
    // surface a warning and keep `extendData` defined so downstream consumers
    // such as `filterFn` or node-icon resolvers cannot crash on `undefined`.
    if (item === undefined) {
      if (typeof console !== 'undefined')
        console.warn(
          `VueGiantTree: missing input entry for rendered id "${id}"; ` +
            `extending it from an empty record.`
        )
    }
    const safeItem: TreeInputItem & Record<string, unknown> =
      item ??
      ({ id: '', name: '', parentId: '', disabled: false } as TreeInputItem &
        Record<string, unknown>)
    return {
      id,
      name: String(safeItem[nameField] ?? id),
      parentId: String(safeItem[parentIdField] ?? ''),
      leftNode: layouts[offset],
      rightNode: layouts[offset + 1],
      deep: layouts[offset + 2],
      checked: CheckType.UNCHECKED,
      selected: CheckType.UNCHECKED,
      collapsed: true,
      disabled: layouts[offset + 3] !== 0,
      extendData: safeItem,
    }
  })
  rebuildAllNodesIndex()
  previousTreeInput = props.tree as TreeInputItem[]
  refreshTree()
}
// A macrotask yields the main thread for rendering without relying on rAF.
// Browser test iframes can throttle rAF to seconds while backgrounded.
const nextBuildTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const canUseChunkedBuild = () =>
  props.chunkedBuild && props.outputIdOnly && !props.filterFn
const utf8Encoder = new TextEncoder()
// 编码暂存区与长度表：复用它们，避免为每个字段分配 Uint8Array、为每个节点分配
// 长度数组 —— 100 万节点意味着 300 万次分配，实测编码耗时 2.5 秒。
let fieldScratch = new Uint8Array(1 << 16)
let fieldLengths = new Int32Array(4096)
const encodeNeighborBatch = (
  batch: Array<TreeInputItem & Record<string, unknown>>,
  idField: string,
  nameField: string,
  parentIdField: string
) => {
  const count = batch.length
  if (fieldLengths.length < count * 3) fieldLengths = new Int32Array(count * 3)

  // 第一遍：把三个字段依次编码进连续的暂存区，只记长度。
  let scratchUsed = 0
  const encodeField = (value: string): number => {
    // 一个 UTF-16 码元最多编成 3 字节；按最坏情况确保空间，否则 encodeInto 会只写一半。
    const worst = value.length * 3
    if (scratchUsed + worst > fieldScratch.length) {
      const grown = new Uint8Array(
        Math.max(fieldScratch.length * 2, scratchUsed + worst)
      )
      grown.set(fieldScratch.subarray(0, scratchUsed))
      fieldScratch = grown
    }
    const { written } = utf8Encoder.encodeInto(
      value,
      fieldScratch.subarray(scratchUsed)
    )
    scratchUsed += written
    return written
  }

  let payloadLength = count * 16
  for (let index = 0; index < count; index++) {
    const node = batch[index]
    const base = index * 3
    const idLength = encodeField(String(node[idField] ?? ''))
    const nameLength = encodeField(String(node[nameField] ?? ''))
    const parentLength = encodeField(String(node[parentIdField] ?? ''))
    fieldLengths[base] = idLength
    fieldLengths[base + 1] = nameLength
    fieldLengths[base + 2] = parentLength
    payloadLength += idLength + nameLength + parentLength
  }

  // 第二遍：组装成「16 字节长度头 + 数据块」，每个节点只做一次拷贝。
  const payload = new Uint8Array(payloadLength)
  const view = new DataView(payload.buffer)
  let cursor = 0
  let from = 0
  for (let index = 0; index < count; index++) {
    const base = index * 3
    const idLength = fieldLengths[base]
    const nameLength = fieldLengths[base + 1]
    const parentLength = fieldLengths[base + 2]
    view.setInt32(cursor, idLength, true)
    view.setInt32(cursor + 4, nameLength, true)
    view.setInt32(cursor + 8, parentLength, true)
    view.setInt32(cursor + 12, batch[index].disabled === true ? 1 : 0, true)
    cursor += 16
    const block = idLength + nameLength + parentLength
    payload.set(fieldScratch.subarray(from, from + block), cursor)
    cursor += block
    from += block
  }
  return payload
}
const loadTree = async () => {
  // 主线程路径保持 JSON：实测 100 万节点 `JSON.stringify` + wasm 解析约 2466ms，
  // 而用 JS 逐字段编码成 UTF-8 二进制要 4175ms —— 原生 stringify 在这条路上更快。
  // 二进制通道只在 Worker 场景有价值（那边省掉的是 postMessage 结构化克隆）。
  if (!canUseChunkedBuild()) {
    setNeighborTree(tree, JSON.stringify(rawTree()))
    return
  }

  const size = Math.max(1, Math.floor(props.buildBatchSize))
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const input = rawTree()
  for (let start = 0; start < input.length; start += size) {
    const batch = input.slice(start, start + size) as Array<
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
    if (start + size < input.length) {
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
  rebuildAllNodesIndex()
  previousTreeInput = props.tree as TreeInputItem[]
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
    const idField = props.fieldKeys.idField ?? 'id'
    const filtered = records.filter(item => props.filterFn!(item))
    const result = props.outputIdOnly
      ? filtered.map(item => item[idField])
      : filtered
    emit('update:modelValue', result)
  } else if (!props.outputIdOnly) {
    emit(
      'update:modelValue',
      props.selectType === SelectType.CHECKBOX ? records : (records[0] ?? null)
    )
  } else {
    // 走到这里 outputIdOnly 恒为 true：CHECKBOX 输出 ID 数组，RADIO/SELECT 输出单个 ID（无选中为 null）
    // Reaching this branch means outputIdOnly is always true: CHECKBOX emits
    // the ID array, RADIO/SELECT emits a single ID (null when nothing is selected).
    const result =
      props.selectType === SelectType.CHECKBOX ? ids : (ids[0] ?? null)
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
    item => item.leftNode > parent.leftNode && item.leftNode < parent.rightNode
  )

/** 过渡容器正在承载的行：普通列表要跳过这些 id，避免同一 key 渲染两次。 */
const animationRowIds = computed(
  () => new Set(treeAnimation.value?.rows.map(row => row.id) ?? [])
)
/** 过渡容器插在哪一行之后（正在展开/折叠的父节点）。 */
const animationParentId = computed(() => treeAnimation.value?.parentId)
/** 容器里渲染的行。 */
const transitionRows = computed(() => treeAnimation.value?.rows ?? [])
/**
 * 普通列表要渲染的行：当前视口行 + 展开动画期间被新窗口挤出的兄弟行。
 * 后者追加在末尾，正好排在过渡容器之后，让它们跟随容器高度一起下移。
 */
const renderRows = computed(() => {
  const extra = treeAnimation.value?.extraRows
  if (!extra?.length) return currentTreeList.value
  const ids = new Set(currentTreeList.value.map(item => item.id))
  return [
    ...currentTreeList.value,
    ...extra.filter(item => !ids.has(item.id)),
  ]
})
/** 容器方向，仅用于挂 CSS 类。 */
const transitionDirection = computed(
  () => treeAnimation.value?.direction ?? 'expand'
)
/** 过渡容器的高度：展开到 rows 总高、折叠到 0。 */
const branchTransitionHeight = computed(() =>
  animationOpen.value ? (treeAnimation.value?.height ?? 0) : 0
)
/** 过渡容器的时长（ms），作为 CSS 变量交给样式表。 */
const branchTransitionDuration = computed(
  () => treeAnimation.value?.duration ?? ANIMATION_MAX_DURATION
)

const finishTreeAnimation = () => {
  if (!treeAnimation.value) return
  // 过渡一结束就释放：容器随之消失。展开时 rows 交回普通列表（它们本来就该常驻），
  // 折叠时 rows 不在 currentTreeList 里，于是随容器一起离开 DOM —— 否则一个
  // height:0 的容器会把已经收起的行留在可聚焦、可读的 DOM 里。
  // 普通行全程由 currentTreeList 渲染，不参与这次交接。
  releaseTreeAnimation()

  const resizeHeight = pendingResizeHeight
  if (resizeHeight !== undefined) {
    scrollHeight = resizeHeight
    pendingResizeHeight = undefined
  }
  if (isUsingWorker()) {
    // The worker has already supplied the final viewport rows. Returning to
    // normal rendering must not consult the dormant main-thread WASM tree.
    if (resizeHeight !== undefined)
      postWorker('boundary', { scrollTop, scrollHeight })
    return
  }
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

/** Selection can still be changed during an animation. Rebind the transition
 * rows to the refreshed cache so their controls do not show stale state. */
const syncAnimationRows = () => {
  const animation = treeAnimation.value
  if (!animation) return
  const latestById = new Map(allNodesCache.map(item => [item.id, item]))
  treeAnimation.value = {
    ...animation,
    rows: animation.rows.map(item => latestById.get(item.id) ?? item),
  }
}

/** Worker snapshots update the ordinary virtual list first. The transition rows
 * must be rebound to that same snapshot, otherwise they keep stale state. */
const syncWorkerAnimationRows = () => {
  const animation = treeAnimation.value
  if (!animation) return
  const latestById = new Map(currentTreeList.value.map(item => [item.id, item]))
  treeAnimation.value = {
    ...animation,
    rows: animation.rows.map(item => latestById.get(item.id) ?? item),
  }
}

/**
 * 分支展开/折叠的过渡计划。
 *
 * 只有「参与过渡的子行」被抽进过渡容器，容器按顺序插在父节点行之后；其余行继续
 * 由 currentTreeList 常驻渲染。未变化的行（以及它们的箭头、焦点、子组件状态）因此
 * 不会被重新挂载，靠 CSS transition 驱动的视觉（比如箭头旋转）也就能正常播放。
 * - 展开：容器从 0 长到 rows 总高，后面的行顺次下移；
 * - 折叠：容器从 rows 总高收到 0，后面的行顺次上移；
 * - 过渡结束后 finishTreeAnimation 立即释放：rows 交回普通列表（展开），或随容器
 *   一起离开 DOM（折叠）。容器之所以不能常驻，是折叠后 height:0 会把已收起的行
 *   留在可聚焦、可读的 DOM 里。
 */
const startTreeAnimation = async (
  direction: TreeAnimation['direction'],
  parent: TreeNodeData,
  beforeChange: TreeNodeData[],
  afterChange: TreeNodeData[]
) => {
  // 父节点必须在当前视口内，否则过渡容器无处可插。
  if (!afterChange.some(item => item.id === parent.id)) return

  const rows =
    direction === 'expand'
      ? rowsInside(afterChange, parent)
      : rowsInside(beforeChange, parent)
  if (rows.length === 0) return

  // 展开会让虚拟窗口立即切换成「父节点 + 填满视口的子行」，原来的兄弟行被
  // 挤出窗口。若直接丢掉它们，父节点下方会在动画开始的第一帧塌成空白，
  // 容器只能从空白里长出来；保留下来追加在容器之后，才能看到平滑的下移。
  const afterIds = new Set(afterChange.map(item => item.id))
  const parentIndex = beforeChange.findIndex(item => item.id === parent.id)
  const extraRows =
    direction === 'expand' && parentIndex >= 0
      ? beforeChange
          .slice(parentIndex + 1)
          .filter(item => !afterIds.has(item.id))
      : []

  const height = rows.length * props.lineHeight
  const duration = branchAnimationDuration(height)
  treeAnimation.value = {
    direction,
    parentId: parent.id,
    rows,
    extraRows,
    height,
    duration,
  }
  frozenScrollTop = scrollTop
  // Collapse begins open and closes; expansion follows the inverse sequence.
  animationOpen.value = direction === 'collapse'
  await nextTick()
  // A single rAF still runs before the browser paints the freshly mounted
  // `height: 0` expansion layer, so Chromium can coalesce it with the target
  // height and make expansion appear instant. Let that initial state reach a
  // frame first, then make the transition change on the following frame.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isTreeAnimating()) return
      animationOpen.value = direction === 'expand'
    })
  })
  // transitionend is not guaranteed (e.g. a tab is backgrounded), so the
  // timeout always returns the component to normal virtual rendering.
  animationTimer = setTimeout(finishTreeAnimation, duration + 80)
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
for (const item of rawTree() as Array<
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
const cloneForWorker = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

const postWorker = (type: string, payload: Record<string, unknown> = {}) => {
  if (!worker) return undefined
  try {
    const revision = ++workerRevision
    workerCommandStartedAt.set(revision, now())
    workerMetrics.commandsSent++
    workerMetrics.pendingCommands = workerCommandStartedAt.size
    worker.postMessage(cloneForWorker({ type, revision, ...payload }))
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
  transfer: ArrayBuffer[]
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

/**
 * Worker-side content-only updates. Sends one batched command and lets the
 * worker update its WASM instance; the full UTF-8 stream is only used when the
 * change is structural or too large to be worth a message.
 */
const tryWorkerContentUpdates = (next: TreeInputItem[]): boolean => {
  if (!worker || !isTreeReady || isBuilding) return false
  if (activeSearchKeyword.length > 0) return false
  if (!props.outputIdOnly || props.filterFn) return false
  const previous = previousTreeInput
  if (previous === null || previous.length !== next.length) return false
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const changes: Array<{
    id: string
    name: string
    disabled: boolean
    nameChanged: boolean
    disabledChanged: boolean
    inputIndex: number
  }> = []
  if (workerSnapshotNames.length !== next.length) return false
  let disabledChanges = 0
  for (let i = 0; i < next.length; i++) {
    const before = previous[i] as unknown as Record<string, unknown>
    const after = next[i] as unknown as Record<string, unknown>
    const id = String(after[idField] ?? '')
    if (String(before[idField] ?? '') !== id) return false
    if (String(after[parentIdField] ?? '') !== workerSnapshotParents[i])
      return false
    if (
      before !== after &&
      !shallowEqualExceptContent(before, after, nameField)
    )
      return false
    const name = String(after[nameField] ?? '')
    const nameChanged = workerSnapshotNames[i] !== name
    const disabled = after.disabled === true
    const disabledChanged = (workerSnapshotDisabled[i] !== 0) !== disabled
    if (!nameChanged && !disabledChanged) continue
    if (disabledChanged) disabledChanges++
    changes.push({
      id,
      name,
      disabled,
      nameChanged,
      disabledChanged,
      inputIndex: i,
    })
  }
  // Applying thousands of disabled updates would repeatedly rewrite the
  // worker's disabledPrefix suffix; the full stream is cheaper.
  if (disabledChanges > 64) return false
  if (changes.length === 0) {
    previousTreeInput = next
    workerInput = next as TreeMutationItem[]
    return true
  }
  // A huge batch is no cheaper than the binary stream and risks a large
  // structured clone, so fall back to the full path. Small trees still use the
  // batched path; the floor keeps the threshold meaningful for a handful of
  // nodes.
  const maxUpdates = Math.max(64, Math.floor(next.length / 4))
  if (changes.length > maxUpdates) return false
  previousTreeInput = next
  workerInput = next as TreeMutationItem[]
  const updates: Array<{ id: string; name?: string; disabled?: boolean }> = []
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    inputNodeById.set(
      change.id,
      next[change.inputIndex] as unknown as Record<string, unknown>
    )
    workerSnapshotNames[change.inputIndex] = change.name
    workerSnapshotDisabled[change.inputIndex] = change.disabled ? 1 : 0
    const update: { id: string; name?: string; disabled?: boolean } = {
      id: change.id,
    }
    if (change.nameChanged) update.name = change.name
    if (change.disabledChanged) update.disabled = change.disabled
    updates.push(update)
  }
  const revision = postWorker('update-content', { updates })
  if (revision === undefined) return false
  buildMetrics.contentDiffHits++
  return true
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
  const input = rawTree()
  for (let start = 0; start < input.length; start += size) {
    if (!worker) return
    const payload = encodeNeighborBatch(
      input.slice(start, start + size) as Array<
        TreeInputItem & Record<string, unknown>
      >,
      idField,
      nameField,
      parentIdField
    )
    postWorkerTransfer('stream-batch', { payload: payload.buffer }, [
      payload.buffer,
    ])
    if (start + size < input.length) await nextBuildTurn()
  }
  postWorker('stream-finish')
  // Subsequent content-only updates diff against the input that was just
  // streamed. `stream-finish` is posted first, so worker command ordering
  // guarantees the content update runs on a complete tree.
  rebuildWorkerContentSnapshot(input as TreeInputItem[])
  previousTreeInput = input as TreeInputItem[]
}

/** Snapshot input-order content so in-place row mutations are still detected. */
const rebuildWorkerContentSnapshot = (items: TreeInputItem[]) => {
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const names = new Array<string>(items.length)
  const parents = new Array<string>(items.length)
  const disabled = new Uint8Array(items.length)
  for (let i = 0; i < items.length; i++) {
    const node = items[i] as unknown as Record<string, unknown>
    names[i] = String(node[nameField] ?? '')
    parents[i] = String(node[parentIdField] ?? '')
    disabled[i] = node.disabled === true ? 1 : 0
  }
  workerSnapshotNames = names
  workerSnapshotParents = parents
  workerSnapshotDisabled = disabled
}

const invalidateWorkerContentSnapshot = () => {
  workerSnapshotNames = []
  workerSnapshotParents = []
  workerSnapshotDisabled = new Uint8Array(0)
}

/** Worker 侧回传的结构变更：单条操作或一批操作。 */
type WorkerMutationOp =
  | { type: 'update'; id: string; patch: TreeNodePatch }
  | { type: 'add'; node: TreeMutationItem }
  | { type: 'remove'; ids: string[] }
type WorkerMutation =
  { type: 'batch'; mutations?: WorkerMutationOp[] } | WorkerMutationOp

const applyWorkerMutation = (mutation: WorkerMutation | undefined) => {
  if (!mutation) return
  const idField = props.fieldKeys.idField ?? 'id'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  let next = workerInput
  const mutations =
    mutation.type === 'batch' ? (mutation.mutations ?? []) : [mutation]
  let changed = false
  for (const item of mutations) {
    if (item.type === 'update') {
      next = next.map(node =>
        String(node[idField] ?? '') === item.id
          ? { ...node, ...item.patch }
          : node
      )
      changed = true
      if (parentIdField in item.patch || 'disabled' in item.patch)
        invalidateWorkerContentSnapshot()
    } else if (item.type === 'add') {
      next = [...next, item.node]
      changed = true
      invalidateWorkerContentSnapshot()
    } else if (item.type === 'remove') {
      const removed = new Set<string>(item.ids)
      next = next.filter(node => !removed.has(String(node[idField] ?? '')))
      changed = true
      invalidateWorkerContentSnapshot()
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
      mutation?: WorkerMutation
      error?: unknown
      metrics?: {
        structuralBatches: number
        structuralOperations: number
        lastBatchSize: number
        lastResponseMs: number
        lastSerializeMs: number
      }
    }
    // worker 里的 release loader 是静态导入，模块求值阶段（含 wasm 实例化）尚未注册
    // onmessage，此时发过去的命令会被直接丢弃 —— 所以首屏数据必须等 'ready' 再发。
    if (snapshot.type === 'ready') {
      void streamWorkerTree()
      return
    }
    if (snapshot.type === 'boot') return
    if (snapshot.type === 'checked') {
      if (snapshot.checkedIds !== undefined) {
        workerCheckedIds = snapshot.checkedIds
        emitCheckedResult()
      }
      return
    }
    if (snapshot.type === 'fatal') {
      console.error('VueGiantTree worker failed', snapshot.error)
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
    if (snapshot.checkedIds !== undefined)
      workerCheckedIds = snapshot.checkedIds
    workerTreeSize = snapshot.size
    isTreeReady = true
    listHeight.value = snapshot.listHeight
    currentTreeList.value = snapshot.rows.map(row =>
      applyGuide({
        ...row,
        extendData: inputNodeById.get(row.id),
      })
    )
    // A structural mutation invalidates the transition rows: a row that was added
    // or removed can never enter or leave that fixed set. Content edits still
    // rebind safely below.
    if (snapshot.mutation) releaseTreeAnimation()
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
  // 首屏数据不在这里发送：等 worker 的 'ready' 消息（见上面的 onmessage）。
  // worker 就绪前的消息会被丢弃，因为静态导入的 loader 在模块求值期间还没注册 onmessage。
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
  rebuildGuideLines()
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
/**
 * 行右键：把节点与原生事件透传给业务方，便于自行渲染右键菜单。
 * 折叠动画中的临时行同样适用，因此这里不查 currentTreeList。
 * Row context menu: forwards the node and the native event so the consumer can render its own
 * menu. Applies to transient animation rows too, so currentTreeList is deliberately not consulted.
 * Контекстное меню строки: передаёт узел и исходное событие потребителю для собственного меню.
 * Работает и для временных строк анимации, поэтому currentTreeList здесь не используется.
 */
const contextMenuClick = (node: TreeNodeData, event: MouseEvent) => {
  emit('item-contextmenu', node, event)
}
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
  // A running branch animation owns the viewport rows; a global visibility
  // change replaces them all, so wait for it to finish first.
  if (isTreeAnimating()) return
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

  releaseTreeAnimation()
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
  if (nameField in patch)
    updateNodeName(tree, id, String(next[index][nameField] ?? ''))
  const updatePresentation = (node: TreeNodeData) =>
    node.id === id
      ? {
          ...node,
          name:
            nameField in patch
              ? String(patch[nameField] ?? node.name)
              : node.name,
          extendData: next[index],
        }
      : node
  const cacheIndex = allNodesIndexById.get(id)
  if (cacheIndex !== undefined && allNodesCache[cacheIndex] !== undefined) {
    allNodesCache[cacheIndex] = updatePresentation(allNodesCache[cacheIndex])
  } else {
    allNodesCache = allNodesCache.map(updatePresentation)
  }
  currentTreeList.value = currentTreeList.value.map(updatePresentation)
  if (treeAnimation.value) {
    treeAnimation.value = {
      ...treeAnimation.value,
      rows: treeAnimation.value.rows.map(updatePresentation),
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
      if (tryWorkerContentUpdates(tree as TreeInputItem[])) return
      rebuildGuideLines()
      workerInput = tree as TreeMutationItem[]
      refreshInputNodeById(tree as TreeMutationItem[])
      // 走二进制流式发送，而不是 postWorker('replace', { tree, ... })：
      // replace 会把整棵树交给 postMessage 的结构化克隆（100 万节点实测
      // 2000~3000ms），worker 侧收到后还要再 JSON.stringify 一遍；
      // stream 路径是 UTF-8 二进制 + transfer（同一份数据 ~600ms）。
      // streamWorkerTree 自带 config / scrollTop / scrollHeight，可独立调用。
      void streamWorkerTree()
      return
    }
    if (skipNextPresentationOnlyReconcile) {
      skipNextPresentationOnlyReconcile = false
      previousTreeInput = tree as TreeInputItem[]
      return
    }
    // Name-only replacements reuse the entire structural index. Geometry does
    // not change, so guide lines do not need to be rebuilt either.
    if (tryContentOnlyReconcile(tree as TreeInputItem[])) return
    rebuildGuideLines()
    void reconcileTreeData()
  }
)

// 运行时切换 showLine：重算引导字段并即时重绘。主线程走 refreshTree；worker
// 模式下主线程 WASM 树处于休眠，直接对当前切片就地套用即可，无需打扰 worker。
watch(
  () => props.showLine,
  () => {
    rebuildGuideLines()
    if (isUsingWorker()) {
      currentTreeList.value = currentTreeList.value.map(applyGuide)
      return
    }
    refreshTree()
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
      <!--
        普通行由 currentTreeList 常驻渲染，只有参与过渡的子行被抽进下面这个容器，
        容器按顺序插在父节点行之后。所以未变化的行——以及它们的箭头、焦点、子组件
        状态——不会因为展开/折叠动画被重新挂载。
      -->
      <template v-for="item in renderRows" :key="item.id">
        <tree-item
          v-if="!animationRowIds.has(item.id)"
          :style="{ height: lineHeight + 'px' }"
          :item="item"
          :fontSize="fontSize"
          @collapse-click="collapseClick"
          :select-type="selectType"
          :filter-fn="filterFn"
          :node-icon="nodeIcon"
          :show-line-enabled="showLineConfig.enabled"
          :show-line-style="showLineConfig.options.style"
          :show-line-color="showLineConfig.options.color"
          :show-line-width="showLineConfig.options.width"
          @check-click="checkClick"
          @item-click="itemClick"
          @item-contextmenu="contextMenuClick"
        >
          <template v-if="$slots.node" #node="slotProps">
            <slot name="node" v-bind="slotProps" />
          </template>
          <template v-if="$slots.actions" #actions="slotProps">
            <slot name="actions" v-bind="slotProps" />
          </template>
        </tree-item>
        <div
          v-if="animationParentId === item.id"
          class="giant-tree__branch-transition"
          :class="`giant-tree__branch-transition--${transitionDirection}`"
          :style="{
            height: branchTransitionHeight + 'px',
            '--giant-tree-branch-duration': branchTransitionDuration + 'ms',
          }"
          @transitionend.self="finishTreeAnimation"
        >
          <tree-item
            v-for="row in transitionRows"
            :key="row.id"
            :style="{ height: lineHeight + 'px' }"
            :item="row"
            :fontSize="fontSize"
            @collapse-click="collapseClick"
            :select-type="selectType"
            :filter-fn="filterFn"
            :node-icon="nodeIcon"
            :show-line-enabled="showLineConfig.enabled"
            :show-line-style="showLineConfig.options.style"
            :show-line-color="showLineConfig.options.color"
            :show-line-width="showLineConfig.options.width"
            @check-click="checkClick"
            @item-click="itemClick"
            @item-contextmenu="contextMenuClick"
          >
            <template v-if="$slots.node" #node="slotProps">
              <slot name="node" v-bind="slotProps" />
            </template>
            <template v-if="$slots.actions" #actions="slotProps">
              <slot name="actions" v-bind="slotProps" />
            </template>
          </tree-item>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped></style>
