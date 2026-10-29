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
  setLineHeight,
  SelectType,
  CheckedOutputMode,
  clear,
  setNeighborTree,
  pushNeighborNodesUtf8,
  popNeighbor,
  getShownHeight,
  collapseTree,
  collapseAll,
  expandByIds,
  checkNode,
  getCheckedIdList,
  getCheckedIndices,
  appendChild,
  removeSubtree,
  getSubtreeIds,
  beginStructureBatch,
  endStructureBatch,
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
} from '../../build/release'

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
import TreeItem from '@lib/components/TreeItem.vue'
import {
  computePackedGuideLines,
  decodeGuideLine,
  resolveShowLineOptions,
} from '../core/guide'
import {
  resolveGiantTreeSizePreset,
  type GiantTreeSize,
  type GiantTreeTheme,
} from '../core/theme'
import type {
  TreeNodeData,
  TreeInputItem,
  TreeFieldKeys,
  FilterFn,
  NodeIconResolver,
  ShowLineOptions,
  TreeMutationItem,
  TreeNodePatch,
} from '../core/types'
const props = withDefaults(
  defineProps<{
    modelValue: TreeNodeData | TreeNodeData[] | string | string[]
    width?: string
    height?: string
    /** 行高（像素）。未传时由 `size` 预设决定。 / Row height in px; falls back to the `size` preset. */
    lineHeight?: number
    selectType?: SelectType
    root?: string
    /** 行内字号。未传时由 `size` 预设决定，也允许宿主用 `--giant-tree-font-size` 覆盖。 */
    fontSize?: string
    /**
     * 主题模式，参考 Element Plus 的暗色模式：
     * - `inherit`（默认）跟随全局约定——`html.dark` 下自动使用暗色；
     * - `light` 强制浅色（在暗色页面里放浅色面板）；
     * - `dark` 只让当前实例使用暗色。
     *
     * Theme mode: `inherit` follows the global `html.dark` switch (default),
     * `light` forces light colours, and `dark` darkens only this instance.
     */
    theme?: GiantTreeTheme
    /**
     * 尺寸预设：`small` / `default` / `large`，对应
     * 12px·24px / 14px·26px / 16px·32px（字号·行高）。
     * 显式传入的 `fontSize` / `lineHeight` 优先于预设。
     *
     * Size preset (small / default / large). Explicit `fontSize` / `lineHeight`
     * win over the preset.
     */
    size?: GiantTreeSize
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
    /**
     * 是否高亮模糊搜索命中的关键词片段。默认 `false`，保持既有视觉不变；
     * 开启后只高亮输入的关键词本身，未命中关键词的祖先行不受影响。
     * 样式见 `lib/assets/style/style.scss` 的 `.giant-tree__search-hit`。
     *
     * Whether to highlight the matched keyword inside fuzzy search results.
     * Defaults to `false`; only the typed keyword is highlighted, while ancestor
     * rows that merely complete the path stay unstyled.
     */
    searchHighlight?: boolean
  }>(),
  {
    width: '100%',
    height: '100%',
    selectType: SelectType.CHECKBOX,
    root: '',
    theme: 'inherit',
    size: 'default',
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
    searchHighlight: false,
  }
)
const emit = defineEmits([
  'update:modelValue',
  'update:tree',
  'item-contextmenu',
])

/**
 * 尺寸解析：`size` 提供字号/行高预设，显式 prop 优先。
 * 行高必须落到 JS 里（虚拟滚动要按像素切窗口），字号则同时作为 CSS 变量下发。
 *
 * Size resolution: the preset supplies font-size and row height, and explicit
 * props win. Row height has to live in JS for virtual scrolling, while font
 * size is also exposed as a CSS variable for host overrides.
 */
const sizePreset = computed(() => resolveGiantTreeSizePreset(props.size))
const resolvedLineHeight = computed(() => {
  const explicit = props.lineHeight
  return explicit !== undefined && explicit > 0
    ? explicit
    : sizePreset.value.lineHeight
})
const resolvedFontSize = computed(
  () => props.fontSize ?? `${sizePreset.value.fontSize}px`
)

/**
 * Theme/size classes live on the component root so a whole instance can be
 * themed locally without touching global styles.
 */
const themeClass = computed(() =>
  props.theme === 'inherit' ? undefined : `giant-tree--${props.theme}`
)
const sizeClass = computed(() =>
  props.size === 'default' || !props.size
    ? undefined
    : `giant-tree--${props.size}`
)

/**
 * 只有显式传入 `fontSize` 时才在根节点写内联变量，保证默认情况下宿主
 * 可以在自己的样式表里覆盖 `--giant-tree-font-size` 等变量。
 *
 * Only an explicit `fontSize` writes inline variables, so by default hosts can
 * still override `--giant-tree-*` size variables from their own stylesheet.
 */
const rootStyle = computed(() => {
  const style: Record<string, string> = {
    width: props.width,
    height: props.height,
  }
  if (props.fontSize) {
    style['--giant-tree-font-size'] = resolvedFontSize.value
    style['--giant-tree-row-size'] = resolvedFontSize.value
    style['--giant-tree-indent-size'] = resolvedFontSize.value
    style['--giant-tree-icon-size'] = resolvedFontSize.value
  }
  return style
})
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
  endScrollBlock()
}
let allNodesCache: TreeNodeData[] = []
/** Previous input array, used to recognize content-only tree replacements. */
let previousTreeInput: TreeInputItem[] | null = null
/** id → allNodesCache index, so single-node updates stay O(1). */
let allNodesIndexById = new Map<string, number>()
let isTreeReady = false
let isBuilding = false
/**
 * 当前生效的搜索关键词。必须是响应式的：模板用它为可见行计算关键词高亮，
 * 且只在搜索真正执行时更新（而不是输入框每次按键），避免防抖窗口内
 * 旧结果按新关键词高亮。
 *
 * The keyword currently applied to the tree. Reactive because the template uses
 * it to highlight visible rows; updated when the search actually runs, not on
 * every input keystroke, so debounced results never render mismatched highlights.
 */
const activeSearchKeyword = ref('')
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
/** 过渡期间挂上的滚动拦截器状态，避免重复挂载/卸载。 */
let scrollBlocked = false
/** 过渡一旦开始就按住原生滚动，过渡容器独占这段高度。 */
const beginScrollBlock = () => {
  if (scrollBlocked) return
  scrollBlocked = true
  setScrollBlocked(true)
}
const endScrollBlock = () => {
  if (!scrollBlocked) return
  scrollBlocked = false
  setScrollBlocked(false)
}
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
let pendingWorkerTreeEcho: TreeMutationItem[] | null = null
let pendingPresentationEcho: TreeMutationItem[] | null = null
let workerConfigRestreamPending = false
let pendingConfigRebuild: { restoreSelection: boolean } | null = null
let isConfigRebuilding = false
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
/**
 * 视口上下各多渲染的行数。
 *
 * 虚拟窗口由「发送出去的滚动位置」推出、由「回传的行」落地，两者之间隔着一次
 * Worker 往返。快速甩动或主线程繁忙时，回传会晚一帧，窗口因而落后于真实滚动
 * 位置；多渲染几行能让这点落差落在视口之外，而不是在边缘露出空白。
 *
 * Rows rendered beyond each edge of the viewport. The window is requested from a
 * scroll position but materialised one Worker round trip later, so a fast fling
 * (or a busy main thread) can outrun it. The extra rows keep that gap outside
 * the viewport instead of exposing a blank strip.
 */
const OVERSCAN_ROWS = 4
/** 行高兜底：0 或负数会让索引与偏移的取整全部失效。 */
const rowHeight = () =>
  resolvedLineHeight.value > 0 ? resolvedLineHeight.value : 1
/** 送给虚拟滚动算法的滚动位置：向上多让出 OVERSCAN_ROWS 行。 */
const boundaryScrollTop = () =>
  Math.max(0, scrollTop - OVERSCAN_ROWS * rowHeight())
/** 同上，视口高度上下各放宽 OVERSCAN_ROWS 行。 */
const boundaryScrollHeight = () =>
  scrollHeight + 2 * OVERSCAN_ROWS * rowHeight()
/**
 * 首行在内容坐标系里的位置。必须从「已经落地的那一帧窗口」推出，而不是从最新
 * 的 scrollTop 推出：位置一旦先于行更新，整块行会先被推下去、等行到达再弹回来，
 * 滚动中看起来就是每个行边界都在抖。视口高度变化时同理。
 *
 * Document offset of the first rendered row, derived from the window that is
 * actually rendered rather than from the newest scrollTop. Advancing the offset
 * before the rows arrive pushes the whole block down and snaps it back once they
 * do — on every row boundary, which reads as shaking.
 */
const windowOffset = () =>
  Math.floor(boundaryScrollTop() / rowHeight()) * rowHeight()
/** 主线程模式最近一次生效的窗口，用于跳过窗口未变的重复刷新。 */
let lastMainWindowKey = ''
/** Worker 模式最近一次请求的窗口，用途同上。 */
let lastWorkerWindowKey = ''
/**
 * 主线程模式的视口同步：偏移与行由同一次同步调用产生，天然一致。返回窗口是否
 * 真的变化，调用方据此决定要不要重算行。
 */
const syncMainViewport = (force = false): boolean => {
  const key = `${Math.floor(boundaryScrollTop() / rowHeight())}:${boundaryScrollHeight()}`
  if (!force && key === lastMainWindowKey) return false
  lastMainWindowKey = key
  startOffset.value = windowOffset()
  setBoundary(wasmTree, boundaryScrollTop(), boundaryScrollHeight())
  return true
}
/**
 * 请求 Worker 重算虚拟窗口。行窗口只按整行移动，同一窗口内的重复请求只会让
 * Worker 反复序列化同一段行、主线程反复重建同一批行对象，所以只在窗口（或视口
 * 高度）确实变化时才发。
 *
 * Ask the Worker for a new virtual window. The window only moves in whole rows,
 * so a request inside the same window would make the Worker re-serialise the same
 * slice and the main thread rebuild the same rows.
 */
const syncWorkerBoundary = (force = false) => {
  const key = `${Math.floor(boundaryScrollTop() / rowHeight())}:${boundaryScrollHeight()}`
  if (!force && key === lastWorkerWindowKey) return
  const revision = postWorker('boundary', {
    scrollTop: boundaryScrollTop(),
    scrollHeight: boundaryScrollHeight(),
  })
  // Only remember the request once it was actually posted: a failed post falls
  // back to the main-thread tree, and the next scroll must be able to retry.
  if (revision === undefined) return
  lastWorkerWindowKey = key
}
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
      syncWorkerBoundary(true)
      return
    }
    syncMainViewport(true)
    listHeight.value = getShownHeight(wasmTree)
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
const guideByNode = ref<Map<string, number>>(new Map())
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
  const packed = guideByNode.value.get(node.id)
  if (packed === undefined) return node
  const guide = decodeGuideLine(packed)
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
/**
 * 同一个对象吗？行对象本身放在响应式数组里，读出来的 `extendData` 可能是同一个
 * 原始对象的响应式代理；`toRaw` 用来剥掉这层包装再比较，否则每一行都会被判成
 * 「变了」，复用永远不会命中。
 *
 * Same object? Rows live in a reactive array, so `extendData` reads back as the
 * reactive proxy of the original record; `toRaw` strips that wrapper before
 * comparing, otherwise every row would look changed and reuse would never hit.
 */
const isSameRecord = (a: unknown, b: unknown): boolean =>
  a === b ||
  (typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null &&
    toRaw(a) === toRaw(b))

/**
 * 新快照里的行与已渲染的行是否完全等价。
 *
 * 滚动时相邻两帧的重叠部分是逐字段相同的；只有复用同一个对象，`TreeItem` 的
 * props 引用才不变，Vue 才会跳过这些行的重渲染。否则每次快照都会重建整个视口
 * 的行对象，滚动时每帧都要把几十行重新渲染一遍 —— 手机上这是每帧数毫秒的
 * 开销，也是慢速滚动仍然掉帧的主因。
 *
 * Whether a row from a fresh snapshot is equivalent to the row already rendered.
 * Overlapping rows are field-identical from one frame to the next while
 * scrolling; reusing the same object keeps `TreeItem`'s props referentially
 * stable so Vue can skip re-rendering those rows. Without it every snapshot
 * rebuilds the whole viewport and every visible row is re-rendered on each
 * scroll frame — several milliseconds per frame on a phone.
 *
 * Guide fields are not compared: they are derived from the same id + structure,
 * and a `showLine` change re-applies them to the list explicitly.
 */
const isSameRenderedRow = (
  previous: TreeNodeData,
  next: TreeNodeData,
  extendData: Record<string, unknown> | undefined
): boolean =>
  previous.name === next.name &&
  previous.parentId === next.parentId &&
  previous.leftNode === next.leftNode &&
  previous.rightNode === next.rightNode &&
  previous.deep === next.deep &&
  previous.checked === next.checked &&
  previous.selected === next.selected &&
  previous.collapsed === next.collapsed &&
  previous.disabled === next.disabled &&
  isSameRecord(previous.extendData, extendData)

/** 把快照行落到列表里，未变化的行沿用原对象（见 `isSameRenderedRow`）。 */
const reuseRenderedRows = (rows: TreeNodeData[]): TreeNodeData[] => {
  const previousById = new Map<string, TreeNodeData>()
  for (const row of currentTreeList.value) previousById.set(row.id, row)
  return rows.map(row => {
    const extendData = inputNodeById.get(row.id)
    const previous = previousById.get(row.id)
    if (previous !== undefined && isSameRenderedRow(previous, row, extendData))
      return previous
    return applyGuide({ ...row, extendData })
  })
}
/**
 * 重算连接线字段；运行时切换 showLine 或替换 tree/root/fieldKeys 时调用。
 * `items` 允许调用方传入尚未回传的最新输入（增量增删时使用）。
 */
const rebuildGuideLines = (
  items: TreeInputItem[] = rawTree() as TreeInputItem[]
) => {
  guideByNode.value = showLineConfig.value.enabled
    ? computePackedGuideLines(items, props.root, props.fieldKeys)
    : new Map()
}
const refreshTree = () => {
  if (isBuilding) return
  const shownStarted = now()
  const indices = getShownIndices(wasmTree) as number[]
  buildMetrics.shownIndicesMs += now() - shownStarted
  const selectionStarted = now()
  const selectionStates = getNodeSelectionStates(wasmTree, indices) as number[]
  const collapsedStates = getNodeCollapsedStates(wasmTree, indices) as number[]
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
/**
 * True when only `nameField` and the disabled flag changed. Allocation-free:
 * this runs once per row on large trees (1M rows), where two `Object.keys`
 * arrays per pair dominated the content-diff pass.
 */
const shallowEqualExceptContent = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  nameField: string
): boolean => {
  let compared = 0
  for (const key in before) {
    if (!Object.prototype.hasOwnProperty.call(before, key)) continue
    if (key === nameField || key === 'disabled') continue
    compared++
    if (!Object.prototype.hasOwnProperty.call(after, key)) return false
    if (before[key] !== after[key]) return false
  }
  let afterCount = 0
  for (const key in after) {
    if (!Object.prototype.hasOwnProperty.call(after, key)) continue
    if (key === nameField || key === 'disabled') continue
    afterCount++
  }
  return compared === afterCount
}

/** Baseline values a content diff compares each row against. */
type ContentChange = {
  id: string
  name: string
  disabled: boolean
  nameChanged: boolean
  disabledChanged: boolean
  inputIndex: number
}
type ContentBaseline = {
  parentId: string
  name: string
  disabled: boolean
}

/**
 * Shared content-only diff for the main-thread cache and the worker snapshot.
 * Returns null when the inputs are not a pure name/disabled update, so callers
 * can fall back to a structural rebuild.
 */
const diffContentChanges = (
  previous: TreeInputItem[],
  next: TreeInputItem[],
  idField: string,
  nameField: string,
  parentIdField: string,
  baselineFor: (inputIndex: number, id: string) => ContentBaseline | undefined
): ContentChange[] | null => {
  const changes: ContentChange[] = []
  for (let i = 0; i < next.length; i++) {
    const before = previous[i] as unknown as Record<string, unknown>
    const after = next[i] as unknown as Record<string, unknown>
    const id = String(after[idField] ?? '')
    if (String(before[idField] ?? '') !== id) return null
    const baseline = baselineFor(i, id)
    if (baseline === undefined) return null
    if (String(after[parentIdField] ?? '') !== baseline.parentId) return null
    if (
      before !== after &&
      !shallowEqualExceptContent(before, after, nameField)
    )
      return null
    const name = String(after[nameField] ?? '')
    const disabled = after.disabled === true
    const nameChanged = baseline.name !== name
    const disabledChanged = baseline.disabled !== disabled
    if (!nameChanged && !disabledChanged) continue
    changes.push({
      id,
      name,
      disabled,
      nameChanged,
      disabledChanged,
      inputIndex: i,
    })
  }
  return changes
}

/**
 * Content-only reconciliation. Returns true when the new input keeps the same
 * id/parent order and only changes `name` / `disabled`, so the MPTT index,
 * visibility and selection state can all be reused. Structural edits,
 * custom-field edits, search mode and JSON output fall back to the full path.
 */
const tryContentOnlyReconcile = (next: TreeInputItem[]): boolean => {
  if (!isTreeReady || isBuilding) return false
  if (activeSearchKeyword.value.length > 0) return false
  if (!props.outputIdOnly || props.filterFn) return false
  const previous = previousTreeInput
  if (previous === null || previous.length !== next.length) return false
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  // Compare against the rendered cache, not the previous input objects: a
  // caller may mutate rows in place and then replace the array, leaving
  // `previous` pointing at the already-mutated values.
  const changes = diffContentChanges(
    previous,
    next,
    idField,
    nameField,
    parentIdField,
    (_inputIndex, id) => {
      const cacheIndex = allNodesIndexById.get(id)
      if (cacheIndex === undefined) return undefined
      const cached = allNodesCache[cacheIndex]
      if (cached === undefined) return undefined
      return {
        parentId: cached.parentId,
        name: cached.name,
        disabled: cached.disabled,
      }
    }
  )
  if (changes === null) return false
  let disabledChanges = 0
  for (let i = 0; i < changes.length; i++)
    if (changes[i].disabledChanged) disabledChanges++
  // Each disabled update rewrites the disabledPrefix suffix (O(N)); applying
  // thousands of them is far slower than one rebuild.
  if (disabledChanges > 64) return false
  previousTreeInput = next
  if (changes.length === 0) return true

  const startedAt = now()
  let selectionChanged = false
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (change.nameChanged) updateNodeName(wasmTree, change.id, change.name)
    if (change.disabledChanged) {
      updateNodeDisabled(wasmTree, change.id, change.disabled)
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

const refreshAllNodesCache = (
  source?: Array<TreeInputItem & Record<string, unknown>>
) => {
  // Fallback path used only when input-order layouts are unavailable. ID-only
  // trees do not need the full JSON serializer just to render rows, so read the
  // compact MPTT layout and rebuild the presentation cache from the input.
  const input =
    source ?? (rawTree() as Array<TreeInputItem & Record<string, unknown>>)
  const ids = getAllNodeIds(wasmTree) as string[]
  const layouts = getAllNodeLayouts(wasmTree) as number[]
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const inputById = new Map<string, TreeInputItem & Record<string, unknown>>()
  for (const item of input) {
    inputById.set(String(item[idField] ?? ''), item)
  }
  const cache = new Array<TreeNodeData>(ids.length)
  const indexById = new Map<string, number>()
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index]
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
    cache[index] = {
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
    indexById.set(id, index)
  }
  allNodesCache = cache
  allNodesIndexById = indexById
  previousTreeInput = input as TreeInputItem[]
  refreshTree()
}

/**
 * Preferred cache build: one bridge call returns the input-order → fullTree
 * layout map, then rows are assembled in input order. This skips the 1M-string
 * `getAllNodeIds` copy and the duplicate inputById map used by the fallback.
 */
const refreshNodesCacheFromInputLayouts = () => {
  const input = rawTree() as Array<TreeInputItem & Record<string, unknown>>
  const layoutBridgeStarted = now()
  const layouts = getInputNodeLayouts(wasmTree) as number[]
  buildMetrics.layoutBridgeMs += now() - layoutBridgeStarted
  if (input.length === 0 || layouts.length !== input.length * 5) {
    clearInputNodeLayouts(wasmTree)
    refreshAllNodesCache()
    return
  }
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const assemblyStarted = now()
  const cache = new Array<TreeNodeData>(getSize(wasmTree))
  const indexById = new Map<string, number>()
  let filled = 0
  for (let index = 0; index < input.length; index++) {
    const offset = index * 5
    const fullIndex = layouts[offset]
    if (fullIndex < 0) continue
    const node = input[index]
    const id = String(node[idField] ?? '')
    cache[fullIndex] = {
      id,
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
    indexById.set(id, fullIndex)
    filled++
  }
  clearInputNodeLayouts(wasmTree)
  // A build that didn't track layouts (or rejected every row) falls back to
  // the id-based cache instead of rendering an empty list.
  if (filled === 0 && getSize(wasmTree) > 0) {
    refreshAllNodesCache()
    return
  }
  allNodesCache = cache
  allNodesIndexById = indexById
  previousTreeInput = props.tree as TreeInputItem[]
  buildMetrics.cacheAssemblyMs += now() - assemblyStarted
  const refreshStarted = now()
  refreshTree()
  buildMetrics.cacheRefreshMs += now() - refreshStarted
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
    setNeighborTree(wasmTree, JSON.stringify(rawTree()))
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
    pushNeighborNodesUtf8(wasmTree, payload)
    buildMetrics.inputBridgeMs += now() - bridgeStarted
    if (start + size < input.length) {
      const yieldStarted = now()
      await nextBuildTurn()
      buildMetrics.inputYieldMs += now() - yieldStarted
    }
  }
  const finalizeStarted = now()
  popNeighbor(wasmTree)
  buildMetrics.finalizeMs += now() - finalizeStarted
}
const refreshChunkedNodesCache = async () => {
  const size = Math.max(1, Math.floor(props.buildBatchSize))
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  const input = rawTree() as Array<TreeInputItem & Record<string, unknown>>
  const layoutBridgeStarted = now()
  const layouts = getInputNodeLayouts(wasmTree) as number[]
  buildMetrics.layoutBridgeMs += now() - layoutBridgeStarted
  const cache = new Array<TreeNodeData>(getSize(wasmTree))
  const indexById = new Map<string, number>()
  for (let start = 0; start < input.length; start += size) {
    const end = Math.min(start + size, input.length)
    const assemblyStarted = now()
    for (let index = start; index < end; index++) {
      const node = input[index]
      const offset = index * 5
      const fullIndex = layouts[offset]
      if (fullIndex < 0) continue
      const id = String(node[idField] ?? '')
      cache[fullIndex] = {
        id,
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
      indexById.set(id, fullIndex)
    }
    buildMetrics.cacheAssemblyMs += now() - assemblyStarted
    if (start + size < input.length) {
      const yieldStarted = now()
      await nextBuildTurn()
      buildMetrics.cacheYieldMs += now() - yieldStarted
    }
  }
  const layoutReleaseStarted = now()
  clearInputNodeLayouts(wasmTree)
  buildMetrics.layoutReleaseMs += now() - layoutReleaseStarted
  allNodesCache = cache
  allNodesIndexById = indexById
  previousTreeInput = input as TreeInputItem[]
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
  else refreshNodesCacheFromInputLayouts()
}

/**
 * Applies one structural edit to the live WASM tree and rebuilds only the JS
 * presentation cache. The previous main-thread path cleared the tree and
 * reparsed the whole input (plus a per-branch expand/check restore), which made
 * a single add/remove cost a full O(N) rebuild.
 */
const refreshAfterIncremental = (
  next: TreeMutationItem[],
  apply: () => boolean
): boolean => {
  if (!isTreeReady || isBuilding) return false
  beginStructureBatch(wasmTree)
  try {
    if (!apply()) return false
  } finally {
    endStructureBatch(wasmTree)
  }
  refreshAllNodesCache(next as Array<TreeInputItem & Record<string, unknown>>)
  if (showLineConfig.value.enabled) rebuildGuideLines(next as TreeInputItem[])
  listHeight.value = getShownHeight(wasmTree)
  refreshTree()
  emitCheckedResult()
  pendingPresentationEcho = next
  return true
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
  // Only the window moves the rendered rows; the offset is part of the same
  // update, never a separate early one. See `windowOffset`.
  if (isUsingWorker()) {
    syncWorkerBoundary()
    return
  }
  if (syncMainViewport()) refreshTree()
}
/**
 * 根据 outputIdOnly 配置发射选中结果
 * Emit checked result according to outputIdOnly config
 */
/** Resolve checked full-tree indices to IDs from the rendered cache. */
const checkedIdsFromIndices = (indices: number[]): string[] => {
  const ids = new Array<string>(indices.length)
  let count = 0
  for (let i = 0; i < indices.length; i++) {
    const row = allNodesCache[indices[i]]
    if (row !== undefined) ids[count++] = row.id
  }
  ids.length = count
  return ids
}

/** Original input row for an id, from whichever store the current mode owns. */
const recordForId = (id: string): Record<string, unknown> | undefined => {
  if (isUsingWorker()) return inputNodeById.get(id)
  const index = allNodesIndexById.get(id)
  if (index === undefined) return undefined
  return allNodesCache[index]?.extendData
}

/** 按防抖输出选中结果 / Emit checked result with debounce / Выдать результат выбора с антидребезгом */
const emitCheckedResult = () => {
  // Main-thread mode returns indices and resolves IDs from the JS cache; this
  // avoids copying every selected ID string through the WASM boundary (a full
  // 1M-node selection used to cost ~300ms per click).
  const ids = isUsingWorker()
    ? workerCheckedIds
    : allNodesCache.length > 0
      ? checkedIdsFromIndices(getCheckedIndices(wasmTree) as number[])
      : (getCheckedIdList(wasmTree) as string[])
  const customMode =
    props.checkedOutputMode === CheckedOutputMode.Custom && !!props.filterFn
  // Records are only needed for Custom filtering or full-JSON output. In the
  // default ID-only path the previous code still resolved every id through a
  // Map and then discarded the result.
  if (!customMode && props.outputIdOnly) {
    emit(
      'update:modelValue',
      props.selectType === SelectType.CHECKBOX ? ids : (ids[0] ?? null)
    )
    return
  }
  const records = ids
    .map(recordForId)
    .filter((item): item is Record<string, unknown> => item !== undefined)
  if (customMode) {
    // Custom 模式：用 filterFn 过滤原始行，再决定输出 ID 还是 JSON
    // Custom mode: filter raw rows with filterFn, then decide ID or JSON output
    // Пользовательский режим: отфильтровать исходные строки filterFn, затем решить ID или JSON
    const idField = props.fieldKeys.idField ?? 'id'
    const filtered = records.filter(item => props.filterFn!(item))
    emit(
      'update:modelValue',
      props.outputIdOnly ? filtered.map(item => item[idField]) : filtered
    )
    return
  }
  emit(
    'update:modelValue',
    props.selectType === SelectType.CHECKBOX ? records : (records[0] ?? null)
  )
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

/** 过渡容器接管布局时，原生滚动必须真正被拦住。 */
const blockScroll = (event: Event) => {
  event.preventDefault()
}
/**
 * 只在展开/折叠过渡期间挂非 passive 的 touchmove / wheel 监听。
 *
 * 常驻的非 passive touchmove 会迫使浏览器在每次触摸滚动开始前先问一次主线程，
 * 手机上表现为滚动发涩、起步迟滞；PC 上滚轮不受影响，所以这个差异只在移动端
 * 明显。过渡最长几百毫秒，其余时间应该让合成器完全接管滚动。
 *
 * Attach the non-passive touchmove / wheel listeners only while a branch
 * transition owns the layout. A permanent non-passive touchmove listener forces
 * the browser to consult the main thread before every touch scroll starts, which
 * feels sticky on touch devices while being invisible with a desktop wheel.
 */
const setScrollBlocked = (blocked: boolean) => {
  const element = container.value
  if (!element) return
  const method = blocked ? 'addEventListener' : 'removeEventListener'
  element[method]('touchmove', blockScroll, { passive: false })
  element[method]('wheel', blockScroll, { passive: false })
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
  return [...currentTreeList.value, ...extra.filter(item => !ids.has(item.id))]
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
    if (resizeHeight !== undefined) syncWorkerBoundary(true)
    return
  }
  syncMainViewport(true)
  listHeight.value = getShownHeight(wasmTree)
  refreshTree()
}

/** Selection can still be changed during an animation. Rebind the transition
 * rows to the refreshed cache so their controls do not show stale state. */
const syncAnimationRows = () => {
  const animation = treeAnimation.value
  if (!animation) return
  // Reuse the id→index map instead of rebuilding an O(N) Map of the whole
  // cache on every click while a branch transition is running.
  const latestFor = (id: string) => {
    const index = allNodesIndexById.get(id)
    return index === undefined ? undefined : allNodesCache[index]
  }
  treeAnimation.value = {
    ...animation,
    rows: animation.rows.map(item => latestFor(item.id) ?? item),
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

  const height = rows.length * resolvedLineHeight.value
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
  // The transition layer owns the gap between rows for the next few hundred
  // milliseconds, so native scrolling is blocked for exactly that window.
  beginScrollBlock()
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

type TreeInstance = ReturnType<typeof newTree>

/** Signature of the props that force a fresh WASM tree instance. */
const mainConfigSignature = (): string =>
  [
    props.root,
    props.selectType,
    props.preorderedInput ? 1 : 0,
    props.fieldKeys.idField ?? 'id',
    props.fieldKeys.nameField ?? 'name',
    props.fieldKeys.parentIdField ?? 'parentId',
    props.fieldKeys.leftNodeField ?? 'leftNode',
    props.fieldKeys.rightNodeField ?? 'rightNode',
  ].join('\u0000')
let currentMainConfigSignature = ''
const createMainTree = (): TreeInstance => {
  const fk = props.fieldKeys
  const hasCustomKeys =
    fk.idField ||
    fk.nameField ||
    fk.parentIdField ||
    fk.leftNodeField ||
    fk.rightNodeField
  const instance = hasCustomKeys
    ? newTreeWithKeys(
        props.root,
        resolvedLineHeight.value,
        props.selectType,
        fk.idField ?? 'id',
        fk.nameField ?? 'name',
        fk.parentIdField ?? 'parentId',
        fk.leftNodeField ?? 'leftNode',
        fk.rightNodeField ?? 'rightNode',
        false
      )
    : newTree(props.root, resolvedLineHeight.value, props.selectType, false)
  currentMainConfigSignature = mainConfigSignature()
  return instance
}
let wasmTree: TreeInstance = createMainTree()

// Worker-only reverse index: snapshots carry rows without their original input
// objects, and JSON output needs those objects. Main-thread mode resolves the
// same records from `allNodesCache`, so it never pays this second 1M-entry map.
const inputNodeById = new Map<string, Record<string, unknown>>()
const ensureInputNodeById = () => {
  if (inputNodeById.size > 0) return
  const idField = props.fieldKeys.idField ?? 'id'
  for (const item of rawTree() as Array<
    TreeInputItem & Record<string, unknown>
  >) {
    inputNodeById.set(String(item[idField] ?? ''), item)
  }
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

/** Commands whose payload is already primitive/plain and needs no JSON scrub. */
const primitiveWorkerCommands = new Set([
  'boundary',
  'check',
  'collapse',
  'collapse-all',
  'search',
  'clear-check',
  'set-output',
  'set-check',
  'stream-finish',
])

const postWorker = (type: string, payload: Record<string, unknown> = {}) => {
  if (!worker) return undefined
  try {
    const revision = ++workerRevision
    workerCommandStartedAt.set(revision, now())
    workerMetrics.commandsSent++
    workerMetrics.pendingCommands = workerCommandStartedAt.size
    const message = { type, revision, ...payload }
    worker.postMessage(
      primitiveWorkerCommands.has(type) ? message : cloneForWorker(message)
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
  if (activeSearchKeyword.value.length > 0) return false
  if (!props.outputIdOnly || props.filterFn) return false
  const previous = previousTreeInput
  if (previous === null || previous.length !== next.length) return false
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
  if (workerSnapshotNames.length !== next.length) return false
  const changes = diffContentChanges(
    previous,
    next,
    idField,
    nameField,
    parentIdField,
    inputIndex => ({
      parentId: workerSnapshotParents[inputIndex],
      name: workerSnapshotNames[inputIndex],
      disabled: workerSnapshotDisabled[inputIndex] !== 0,
    })
  )
  if (changes === null) return false
  let disabledChanges = 0
  for (let i = 0; i < changes.length; i++)
    if (changes[i].disabledChanged) disabledChanges++
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
  lineHeight: resolvedLineHeight.value,
  selectType: props.selectType,
  checkedOutputMode: props.checkedOutputMode,
  fieldKeys: props.fieldKeys,
  preorderedInput: props.preorderedInput,
})

let workerStreaming = false
let workerStreamQueued = false
const streamWorkerTree = async () => {
  if (!worker) return
  if (workerStreaming) {
    workerStreamQueued = true
    return
  }
  workerStreaming = true
  try {
    postWorker('stream-start', {
      config: workerConfig(),
      // Same padded window the incremental boundary requests use, so the first
      // snapshot already carries the overscan rows and the matching index.
      scrollTop: boundaryScrollTop(),
      scrollHeight: boundaryScrollHeight(),
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
  } finally {
    workerStreaming = false
    if (workerStreamQueued) {
      workerStreamQueued = false
      void streamWorkerTree()
    }
  }
}

let workerRestreamQueued = false

/**
 * Coalesces prop changes that require the worker to receive a new config or a
 * new input stream (root / selectType / fieldKeys / preorderedInput / tree).
 */
const scheduleWorkerRestream = () => {
  workerConfigRestreamPending = true
  if (workerRestreamQueued) return
  workerRestreamQueued = true
  queueMicrotask(() => {
    workerRestreamQueued = false
    if (!worker) {
      workerConfigRestreamPending = false
      return
    }
    workerConfigRestreamPending = false
    workerInput = rawTree() as TreeMutationItem[]
    pendingWorkerTreeEcho = null
    workerCheckedIds = []
    invalidateWorkerContentSnapshot()
    // fieldKeys may have changed, so the reverse index must be rebuilt with
    // the new mapping before resolving records or snapshot rows.
    inputNodeById.clear()
    ensureInputNodeById()
    rebuildGuideLines()
    void streamWorkerTree()
  })
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
  pendingWorkerTreeEcho = next
  refreshInputNodeById(next)
  emit('update:tree', next)
}

const startWorker = () => {
  if (!props.workerMode || typeof Worker === 'undefined') return false
  // Worker snapshot rows carry only the four tree fields; JSON/records output
  // still needs the original input objects. Build that reverse index here, once.
  ensureInputNodeById()
  worker = new Worker(new URL('../core/tree.worker.ts', import.meta.url), {
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
      /** Index of `rows[0]` inside the visible list; drives the block offset. */
      startIndex?: number
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
    // The block moves only with the rows it carries. A snapshot that arrives a
    // frame late then renders at the position it was computed for, instead of
    // being pushed down by a newer scroll position and snapping back.
    if (typeof snapshot.startIndex === 'number')
      startOffset.value = snapshot.startIndex * rowHeight()
    currentTreeList.value = reuseRenderedRows(snapshot.rows)
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
  clear(wasmTree)
  // Input-order layouts feed every cache build path now: they replace the
  // getAllNodeIds string copy plus the duplicate inputById map.
  setTrackInputLayouts(wasmTree, true)
  setUsePreorderedNeighborInput(wasmTree, props.preorderedInput)
  isBuilding = true
  resetBuildMetrics()
  buildStartedAt = now()
  if (props.tree.length > 0) await loadTree()
  isBuilding = false
  await refreshNodesCache()
  buildMetrics.totalMs = now() - buildStartedAt
  isTreeReady = true
  syncMainViewport(true)
  listHeight.value = getShownHeight(wasmTree)
  refreshTree()
  if (pendingConfigRebuild !== null && !isConfigRebuilding) {
    const pending = pendingConfigRebuild
    pendingConfigRebuild = null
    void rebuildMainTreeForConfig(pending.restoreSelection)
  }
}

/**
 * Recreates the main-thread WASM instance when a prop that is baked into the
 * constructor changes (root / selectType / fieldKeys / preorderedInput).
 * Expansion is preserved; selection is preserved only when selectType did not
 * change, because RADIO/SELECT and CHECKBOX store different single-node state.
 */
const rebuildMainTreeForConfig = async (restoreSelection: boolean) => {
  if (isUsingWorker()) return
  if (isBuilding || isConfigRebuilding) {
    pendingConfigRebuild = { restoreSelection }
    return
  }
  isConfigRebuilding = true
  const expandedIds = allNodesCache
    .filter(node => !node.collapsed && node.rightNode - node.leftNode > 1)
    .map(node => node.id)
  const checkedIds = restoreSelection
    ? (getCheckedIdList(wasmTree) as string[]).slice()
    : []

  try {
    releaseTreeAnimation()
    wasmTree = createMainTree()
    setCheckedOutputMode(wasmTree, props.checkedOutputMode)
    await initializeMainTree()
    if (expandedIds.length > 0) expandByIds(wasmTree, expandedIds)
    if (checkedIds.length > 0) {
      if (props.selectType === SelectType.CHECKBOX)
        setCheckedNodes(wasmTree, checkedIds)
      else setCheckedNode(wasmTree, checkedIds[0])
    }
    if (activeSearchKeyword.value)
      fuzzyTree(wasmTree, activeSearchKeyword.value)
    rebuildGuideLines()

    scrollTop = container.value?.scrollTop ?? scrollTop
    syncMainViewport(true)
    listHeight.value = getShownHeight(wasmTree)
    refreshTree()
    emitCheckedResult()
  } finally {
    isConfigRebuilding = false
    const pending = pendingConfigRebuild
    pendingConfigRebuild = null
    if (pending !== null)
      void rebuildMainTreeForConfig(pending.restoreSelection)
  }
}

setCheckedOutputMode(wasmTree, props.checkedOutputMode)

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
    setCheckedOutputMode(wasmTree, newMode)
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
    checkNode(wasmTree, id, CheckType.CHECKED)
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
  collapseAll(wasmTree, collapsed)
  listHeight.value = getShownHeight(wasmTree)
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
  collapseTree(wasmTree, id, isCollapse)
  listHeight.value = getShownHeight(wasmTree)
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
  checkNode(wasmTree, id, checkType)
  emitCheckedResult()
  refreshTree()
  syncAnimationRows()
}

/** 模糊搜索（无防抖，立即执行）/ Fuzzy search (no debounce, immediate) / Нечёткий поиск (без антидребезга, немедленно) */
const rawFuzzySearch = (keyword: string) => {
  activeSearchKeyword.value = keyword
  if (isUsingWorker()) {
    postWorker('search', { keyword })
    return
  }
  fuzzyTree(wasmTree, keyword)
  listHeight.value = getShownHeight(wasmTree)
  // Viewport state is read from CompactNodeStore on every refresh, including
  // nodes that reappear after search. Avoid serializing the full tree solely
  // to rebuild the JS cache when clearing a search.
  refreshTree()
}
/** 带 300ms 防抖的模糊搜索（适合 input 实时输入）/ Fuzzy search with 300ms debounce (suitable for real-time input) / Нечёткий поиск с антидребезгом 300мс (подходит для ввода в реальном времени) */
const fuzzySearch = debounce(300, rawFuzzySearch)

/** 获取树节点总数 / Get total tree node count / Получить общее количество узлов дерева */
const getTreeSize = (): number => {
  return isUsingWorker() ? workerTreeSize : getSize(wasmTree)
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
  setCheckedNode(wasmTree, id)
  emitCheckedResult()
  listHeight.value = getShownHeight(wasmTree)
  refreshTree()
  syncAnimationRows()
}

/** 批量设置选中节点 / Batch set checked nodes / Пакетная установка выбранных узлов */
const setCheckedByIds = (ids: string[]) => {
  if (isUsingWorker()) {
    postWorker('set-checks', { ids })
    return
  }
  setCheckedNodes(wasmTree, ids)
  emitCheckedResult()
  listHeight.value = getShownHeight(wasmTree)
  refreshTree()
  syncAnimationRows()
}

/** 清除所有选中状态 / Clear all check states / Очистить все состояния выбора */
const clearAllChecked = () => {
  if (isUsingWorker()) {
    postWorker('clear-check')
    return
  }
  clearCheckedNodes(wasmTree)
  emitCheckedResult()
  refreshTree()
  syncAnimationRows()
}

/** 切换显示模式（完整树↔搜索树） / Switch display mode (full tree ↔ search tree) / Переключение режима отображения (полное дерево ↔ дерево поиска) */
const switchDisplay = (displayType: DisplayType) => {
  if (isUsingWorker()) {
    // Search commands already select the worker's search view. Clearing search
    // returns to TREE; explicit view switching is otherwise a no-op here.
    if (displayType === DisplayType.TREE && activeSearchKeyword.value) {
      activeSearchKeyword.value = ''
      postWorker('search', { keyword: '' })
    }
    return
  }
  switchDisplayTree(wasmTree, displayType)
  listHeight.value = getShownHeight(wasmTree)
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
  const checkedIds = (getCheckedIdList(wasmTree) as string[]).slice()

  releaseTreeAnimation()
  clear(wasmTree)
  setTrackInputLayouts(wasmTree, true)
  setUsePreorderedNeighborInput(wasmTree, props.preorderedInput)
  isBuilding = true
  try {
    if (props.tree.length > 0) await loadTree()
    await refreshNodesCache()

    if (expandedIds.length > 0) expandByIds(wasmTree, expandedIds)
    if (checkedIds.length > 0) setCheckedNodes(wasmTree, checkedIds)
    if (activeSearchKeyword.value)
      fuzzyTree(wasmTree, activeSearchKeyword.value)
  } finally {
    isBuilding = false
  }

  await nextTick()
  scrollTop = container.value?.scrollTop ?? scrollTop
  syncMainViewport(true)
  listHeight.value = getShownHeight(wasmTree)
  refreshTree()
  emitCheckedResult()
}

/** Update raw input data through v-model:tree. Node IDs are immutable. */
const updateNode = (id: string, patch: TreeNodePatch): boolean => {
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
  const parentIdField = props.fieldKeys.parentIdField ?? 'parentId'
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
  const oldParent = String(input[index][parentIdField] ?? '')
  const newParent = String(next[index][parentIdField] ?? '')
  const parentChanged = parentIdField in patch && newParent !== oldParent
  const disabledChanged =
    'disabled' in patch &&
    (input[index].disabled === true) !== (next[index].disabled === true)
  const nameChanged =
    nameField in patch &&
    String(input[index][nameField] ?? '') !==
      String(next[index][nameField] ?? '')

  if (parentChanged) {
    if (
      newParent !== props.root &&
      !input.some(item => String(item[idField] ?? '') === newParent)
    )
      return false
    const moved = isTreeReady ? (getSubtreeIds(wasmTree, id) as string[]) : []
    if (moved.length === 0) {
      // Waiting for the initial build, or the WASM tree does not know this id
      // yet: let the controlled prop echo take the full reconcile path.
      emit('update:tree', next)
      return true
    }
    const movedSet = new Set(moved)
    if (movedSet.has(newParent)) return false
    const rowById = new Map<string, TreeMutationItem>()
    for (const item of input) {
      const rowId = String(item[idField] ?? '')
      if (movedSet.has(rowId)) rowById.set(rowId, item)
    }
    // Capture expand/collapse state before detaching: appendChild creates new
    // nodes collapsed by default, and a moved expanded branch must stay open.
    const collapsedById = new Map<string, boolean>()
    for (const movedId of moved) {
      const cacheIndex = allNodesIndexById.get(movedId)
      const row =
        cacheIndex === undefined ? undefined : allNodesCache[cacheIndex]
      collapsedById.set(movedId, row?.collapsed ?? true)
    }
    if (rowById.size !== movedSet.size) {
      emit('update:tree', next)
      return true
    }
    refreshAfterIncremental(next, () => {
      if (!removeSubtree(wasmTree, id)) return false
      // Re-append in preorder so children find their parent and sibling order
      // is preserved. The moved root is attached to the new parent last.
      for (const movedId of moved) {
        const row = rowById.get(movedId)!
        const parent =
          movedId === id ? newParent : String(row[parentIdField] ?? '')
        const name =
          movedId === id
            ? String(next[index][nameField] ?? movedId)
            : String(row[nameField] ?? movedId)
        if (
          !appendChild(
            wasmTree,
            movedId,
            name,
            parent,
            row.disabled === true,
            collapsedById.get(movedId) ?? true
          )
        )
          return false
      }
      return true
    })
    emit('update:tree', next)
    return true
  }

  // Content-only patch: update WASM state plus the presentation cache without
  // rebuilding MPTT boundaries or the tree.
  if (nameChanged)
    updateNodeName(wasmTree, id, String(next[index][nameField] ?? ''))
  if (disabledChanged)
    updateNodeDisabled(wasmTree, id, next[index].disabled === true)

  const updatePresentation = (node: TreeNodeData) =>
    node.id === id
      ? {
          ...node,
          name:
            nameField in patch
              ? String(next[index][nameField] ?? node.name)
              : node.name,
          disabled:
            'disabled' in patch ? next[index].disabled === true : node.disabled,
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
  if (disabledChanged) {
    refreshTree()
    emitCheckedResult()
  }
  // The v-model echo is intentionally ignored by the structural reconciler.
  pendingPresentationEcho = next
  emit('update:tree', next)
  return true
}

/** Insert a node under root or an existing parent through v-model:tree. */
const addNode = (node: TreeMutationItem): boolean => {
  const idField = props.fieldKeys.idField ?? 'id'
  const nameField = props.fieldKeys.nameField ?? 'name'
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

  const next: TreeMutationItem[] = [...input, { ...node }]
  refreshAfterIncremental(next, () =>
    appendChild(
      wasmTree,
      id,
      String(next[next.length - 1][nameField] ?? id),
      parentId,
      node.disabled === true
    )
  )
  emit('update:tree', next)
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

  const next = input.filter(
    item => !idsToRemove.has(String(item[idField] ?? ''))
  )
  refreshAfterIncremental(next, () => removeSubtree(wasmTree, id))
  emit('update:tree', next)
  return true
}

watch(resolvedLineHeight, value => {
  if (isUsingWorker()) {
    postWorker('set-line-height', { lineHeight: value })
    return
  }
  if (!isTreeReady) return
  setLineHeight(wasmTree, value)
  syncMainViewport(true)
  listHeight.value = getShownHeight(wasmTree)
  refreshTree()
})

// root / selectType / fieldKeys / preorderedInput are baked into the WASM
// instance constructor, so changing them requires a fresh instance (main) or a
// fresh stream with a new config (worker).
watch(
  () => [
    props.root,
    props.selectType,
    props.preorderedInput,
    props.fieldKeys.idField,
    props.fieldKeys.nameField,
    props.fieldKeys.parentIdField,
    props.fieldKeys.leftNodeField,
    props.fieldKeys.rightNodeField,
  ],
  (next, previous) => {
    const restoreSelection = next[1] === previous?.[1]
    if (isUsingWorker()) {
      scheduleWorkerRestream()
      return
    }
    if (!isTreeReady || isBuilding) {
      pendingConfigRebuild = { restoreSelection }
      return
    }
    void rebuildMainTreeForConfig(restoreSelection)
  }
)

watch(
  () => props.tree,
  tree => {
    if (isUsingWorker()) {
      if (workerConfigRestreamPending) return
      if (workerStreaming) {
        workerStreamQueued = true
        return
      }
      if (pendingWorkerTreeEcho !== null) {
        const expected = pendingWorkerTreeEcho
        pendingWorkerTreeEcho = null
        // Only skip when the parent returned the array we emitted; otherwise
        // this is an external replacement and must be streamed. Vue refs wrap
        // assigned arrays in a reactive proxy, so compare raw targets too.
        if (
          tree === expected ||
          toRaw(tree) === expected ||
          toRaw(tree) === toRaw(expected)
        ) {
          workerInput = tree as TreeMutationItem[]
          return
        }
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
    if (pendingPresentationEcho !== null) {
      const expected = pendingPresentationEcho
      pendingPresentationEcho = null
      // Only skip the echo when the parent returned the array we emitted.
      // A different array may carry extra external edits and must reconcile.
      if (
        tree === expected ||
        toRaw(tree) === expected ||
        toRaw(tree) === toRaw(expected)
      ) {
        previousTreeInput = tree as TreeInputItem[]
        return
      }
    }
    // A config change owns the rebuild; reconciling against the stale instance
    // would parse with the old root/field keys.
    if (isConfigRebuilding) return
    if (currentMainConfigSignature !== mainConfigSignature()) return
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
    class="giant-tree giant-tree__container"
    :class="[
      themeClass,
      sizeClass,
      { 'giant-tree__container--animating': isTreeAnimating() },
    ]"
    :style="rootStyle"
    tabindex="0"
    @scroll="scrollEvent"
  >
    <div
      class="giant-tree__phantom"
      :style="{ height: listHeight + 'px' }"
    ></div>
    <div class="giant-tree__list" :style="{ transform: transformOffset }">
      <!--
        普通行由 currentTreeList 常驻渲染，只有参与过渡的子行被抽进下面这个容器，
        容器按顺序插在父节点行之后。所以未变化的行——以及它们的箭头、焦点、子组件
        状态——不会因为展开/折叠动画被重新挂载。
      -->
      <template v-for="item in renderRows" :key="item.id">
        <!--
          宿主插槽以**函数 prop** 传给行，而不是用 `<template #node>` 转发：
          转发会让每个行 vnode 带上 DYNAMIC_SLOTS 标记，Vue 就无法跳过未变化的行，
          每次视口快照都会把整屏行重渲染一遍。函数 prop 的引用同时是「宿主插槽内容
          变了」的信号。改这里时也要同步下面 transition 容器里的那一份。
        -->
        <tree-item
          v-if="!animationRowIds.has(item.id)"
          :style="{ height: resolvedLineHeight + 'px' }"
          :item="item"
          @collapse-click="collapseClick"
          :select-type="selectType"
          :filter-fn="filterFn"
          :node-icon="nodeIcon"
          :render-node="$slots.node"
          :render-actions="$slots.actions"
          :show-line-enabled="showLineConfig.enabled"
          :show-line-style="showLineConfig.options.style"
          :show-line-color="showLineConfig.options.color"
          :show-line-width="showLineConfig.options.width"
          :highlight-keyword="searchHighlight ? activeSearchKeyword : ''"
          @check-click="checkClick"
          @item-click="itemClick"
          @item-contextmenu="contextMenuClick"
        />
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
            :style="{ height: resolvedLineHeight + 'px' }"
            :item="row"
            @collapse-click="collapseClick"
            :select-type="selectType"
            :filter-fn="filterFn"
            :node-icon="nodeIcon"
            :render-node="$slots.node"
            :render-actions="$slots.actions"
            :show-line-enabled="showLineConfig.enabled"
            :show-line-style="showLineConfig.options.style"
            :show-line-color="showLineConfig.options.color"
            :show-line-width="showLineConfig.options.width"
            :highlight-keyword="searchHighlight ? activeSearchKeyword : ''"
            @check-click="checkClick"
            @item-click="itemClick"
            @item-contextmenu="contextMenuClick"
          />
        </div>
      </template>
    </div>
  </div>
</template>
