<script setup lang="ts">
/**
 * 完整演示场：覆盖组件的全部 prop、实例方法、插槽与事件。
 * 只在客户端加载（`playground.md` 用 `defineClientComponent`），避免 SSR 期执行浏览器 API。
 */
import { useData } from 'vitepress'
import {
  computed,
  nextTick,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
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
} from '@lib/core/types'
import { buildPreorderedTreeData, buildTreeData } from './treeData'
import type { TreePreset } from './treeData'
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
import { createGiantTreeThemeVars } from '@lib/core/theme'
// Worker 脚本的产物 URL：用来在页面空闲时提前预取（见 warmUpWorker）。
import workerUrl from '@lib/core/tree.worker.ts?worker&url'

const settings = reactive<PlaygroundSettings>({ ...DEFAULT_SETTINGS })
const t = useMessages()
const { isDark } = useData()
const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const logs = ref<LogEntry[]>([])
// 同样用 shallowRef：选中结果在「仅输出 ID」关闭、且选了上万节点时是对象数组，
// 而它会被 formatCheckedResult() 完整 JSON.stringify 出来 —— 深度响应式代理会让
// 这次遍历慢一个数量级。这里始终整体替换数组，浅层引用足够。
const checked = shallowRef<TreeNodeData | TreeNodeData[] | string | string[]>(
  []
)
const nodeCount = ref(0)
const metrics = ref({ build: '—', worker: '—' })
let addedCount = 0

const log = (text: string) => {
  logs.value = [
    { at: Math.round(performance.now()), text },
    ...logs.value,
  ].slice(0, 50)
}

const idField = () => (settings.fieldKeysMode === 'custom' ? 'key' : 'id')

/** 自定义字段模式下把默认字段映射成 key/label/parent。 */
const createData = (): TreeInputItem[] => {
  // `preorderedInput` 只有数据真的是前序排列时才有意义（否则组件会静默回退到通用构建），
  // 所以开关打开时换成前序生成器。
  const build = settings.preorderedInput
    ? buildPreorderedTreeData
    : buildTreeData
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

// 用 shallowRef：树数据是上万到上百万个节点对象，`ref` 会把它们逐个包成响应式代理，
// 每次「重建数据」都要重新走一遍，主线程会阻塞几百毫秒（10 万节点实测 422ms）。
// 这里只整体替换数组、从不原地修改，所以浅层引用就够。
const tree = shallowRef<TreeInputItem[]>(createData())

/**
 * 这几个档位自动改用 Worker 模式。阈值卡在 10 万，实测依据（本机 Chromium）：
 *
 * | 档位   | Worker 开                      | 主线程                    |
 * | 1 万   | roundTrip 42.7ms / 0ms 阻塞     | total **22.8ms** / 0ms    |
 * | 10 万  | roundTrip **53.4ms** / 0ms 阻塞 | total 242.1ms / **249ms** |
 * | 100 万 | roundTrip 584ms / 445ms 阻塞    | total 2697ms / 2749ms     |
 *
 * 1 万走主线程更快（22.8ms），开 Worker 只是平白多一次往返；10 万起主线程要
 * JSON.stringify + wasm 端 JSON 解析，建树涨到 242ms 并阻塞主线程 249ms，
 * 而 Worker 走二进制 + 子线程建树只要 53ms 且不阻塞。
 *
 * 小档位不动这个开关，保留使用者自己的选择。
 */
const AUTO_WORKER_PRESETS: ReadonlySet<TreePreset> = new Set(['100k', '1m'])

/**
 * 主色覆盖：`theme` 决定派生 hover/active 的混合方向；`inherit` 时跟随
 * VitePress 的暗色开关。变量写在组件根节点内联样式上，优先级高于主题类。
 */
const treeThemeVars = computed(() =>
  settings.primaryColor
    ? createGiantTreeThemeVars(
        settings.primaryColor,
        settings.theme === 'dark' ||
          (settings.theme === 'inherit' && isDark.value)
      )
    : {}
)

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
          : {
              collapsed: 'playground-icon-folder',
              expanded: 'playground-icon-folder-open',
            }
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
    // selectType 是 newTree() 的构建期参数，换数据规模 / 字段映射 / 禁用数据同理：
    // 这些都必须重建树实例，否则选中、滚动、展开状态会跨数据集残留。
    // app.vue 的 rebuildTree() 在这几种情况都会 treeKey++。
    `z${settings.size}-s${settings.selectType}-w${settings.workerMode ? 1 : 0}-c${
      settings.chunkedBuild ? 1 : 0
    }-p${settings.preorderedInput ? 1 : 0}-f${settings.fieldKeysMode}-d${
      settings.enableDisabled ? 1 : 0
    }`
)

/** 右栏树的高度：`fill` 交给容器撑满（组件用 100%），其余是显式 CSS 长度。 */
const treeHeight = computed(() =>
  settings.height === 'fill' ? '100%' : settings.height
)

/** 固定档位时高度同时交给容器，避免组件比容器高而被裁掉。 */
const treeStyle = computed(() =>
  settings.height === 'fill' ? undefined : { height: settings.height }
)

const checkedSummary = computed(() => {
  const value = checked.value
  if (Array.isArray(value)) return `${value.length}`
  if (!value) return '0'
  return '1'
})

const checkedResultText = computed(() =>
  formatCheckedResult(checked.value, settings.outputIdOnly, t.noneChecked)
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
      // clearAllChecked mutates the WASM/Worker selection state; assigning
      // checked.value alone only clears the v-model output.
      instance?.clearAllChecked()
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
          ? {
              key: `新增${addedCount}`,
              label: `${t.nodeLabel} 新增${addedCount}`,
              parent: parentId,
            }
          : {
              id: `新增${addedCount}`,
              name: `${t.nodeLabel} 新增${addedCount}`,
              parentId,
            }
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
  log(
    `item-contextmenu(${node.id}) @ ${event.clientX},${event.clientY}（未调用 preventDefault）`
  )
}

/** 行内操作：直接作用在点击的那一行上。 */
const renameNode = (node: TreeNodeData) => {
  const nameField = settings.fieldKeysMode === 'custom' ? 'label' : 'name'
  const ok = treeRef.value?.updateNode(node.id, {
    [nameField]: `改名 ${node.id}`,
  })
  log(`updateNode(${node.id}) → ${ok}`)
  void refreshCount()
}

const addChildNode = (node: TreeNodeData) => {
  addedCount += 1
  const row =
    settings.fieldKeysMode === 'custom'
      ? {
          key: `新增${addedCount}`,
          label: `${t.nodeLabel} 新增${addedCount}`,
          parent: node.id,
        }
      : {
          id: `新增${addedCount}`,
          name: `${t.nodeLabel} 新增${addedCount}`,
          parentId: node.id,
        }
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
    log(
      `${t.dataChanged}: ${size}${mode === 'custom' ? ` / ${t.customFields}` : ''}${preordered ? ` / ${t.preorder}` : ''}`
    )
    // 按数据量自动切换 Worker（见 AUTO_WORKER_PRESETS 的说明）：大档位开、小档位关。
    // 这里双向设置是有意的 —— 只开不关的话，从大档位切回小档位会残留着 Worker，
    // 小数据反而白付一次往返。
    settings.workerMode = AUTO_WORKER_PRESETS.has(size)
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

/**
 * 预热 worker 脚本：Worker 模式用的 `tree.worker` 是「只有勾选 Worker 模式才会用到」
 * 的独立 chunk，用户首次开启时才发起下载 —— 慢网络下这一次请求就要 1~2 秒，直接体现为
 * worker 首次建树的 roundTrip 很长（实测冷缓存 2590ms / 热缓存 400ms）。
 * 这里在页面挂载后用低优先级的 prefetch 先把它放进 HTTP 缓存，worker 首次启动就只剩
 * 本地读取。
 *
 * 不需要预热 wasm 与 release chunk：主线程建树时已经加载过它们，worker 请求会命中缓存。
 */
const warmUpWorker = () => {
  if (typeof document === 'undefined') return
  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.as = 'script'
  link.href = workerUrl
  document.head.appendChild(link)
}

onMounted(async () => {
  log(t.mounted)
  warmUpWorker()
  await refreshCount()
  // 首次构建完成后校正一次计数（首帧时组件可能还没就绪）。
  setTimeout(() => void refreshCount(), 300)
})
</script>

<template>
  <div class="playground">
    <!-- 左栏：全部选项与操作，自己滚动，不牵动页面滚动条 -->
    <aside class="playground__panel">
      <ControlPanel :settings="settings" @action="runAction" />
    </aside>

    <!-- 右栏：树占满剩余高度并在内部滚动；结果与日志固定在下方 -->
    <div class="playground__main">
      <div class="playground__stage">
        <div
          class="playground__tree"
          :class="{
            'playground__tree--dark': settings.darkIconBg,
            'playground__tree--fixed': settings.height !== 'fill',
          }"
          :style="treeStyle"
        >
          <VueGiantTree
            ref="treeRef"
            :key="treeKey"
            v-model="checked"
            v-model:tree="tree"
            root="root"
            :height="treeHeight"
            :line-height="settings.lineHeight"
            :font-size="settings.fontSize"
            :theme="settings.theme"
            :size="settings.componentSize"
            :style="treeThemeVars"
            :select-type="selectType"
            :show-line="showLine"
            :node-icon="nodeIcon"
            :search-highlight="settings.searchHighlight"
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
            <template
              v-if="settings.useNodeSlot || settings.mptt"
              #node="{ node, highlights }"
            >
              <span v-if="!highlights">{{ node.name }}</span>
              <span v-else>
                <template v-for="(part, index) in highlights" :key="index">
                  <mark v-if="part.hit" class="giant-tree__search-hit">{{
                    part.text
                  }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
              <code v-if="settings.mptt" class="playground__mptt">
                L{{ node.leftNode }} R{{ node.rightNode }}
              </code>
            </template>
            <template v-if="settings.useActionsSlot" #actions="{ node }">
              <button
                type="button"
                class="playground__row-action"
                @click="renameNode(node)"
              >
                {{ t.editNode }}
              </button>
              <button
                type="button"
                class="playground__row-action"
                @click="addChildNode(node)"
              >
                {{ t.addChildNode }}
              </button>
              <button
                type="button"
                class="playground__row-action danger"
                @click="deleteNode(node)"
              >
                {{ t.deleteNode }}
              </button>
            </template>
          </VueGiantTree>
        </div>

        <p v-if="settings.useActionsSlot" class="playground__note">
          {{ t.rowActions }}：{{ t.editNode }} / {{ t.addChildNode }} /
          {{ t.deleteNode }}
        </p>
      </div>

      <div class="playground__foot">
        <aside class="playground__result">
          <div class="result-col">
            <div class="result-row">
              <span class="result-key">{{ t.checkedResult }}</span>
              <span class="result-count">{{ checkedSummary }}</span>
            </div>
            <div class="result-row">
              <span class="result-key">{{ t.totalNodes }}</span>
              <span class="result-count">{{ nodeCount }}</span>
            </div>
            <pre class="result-value">{{ checkedResultText }}</pre>
          </div>

          <div class="result-col result-col--meta">
            <dl class="result-meta">
              <div>
                <dt>{{ t.rows }}</dt>
                <dd>{{ tree.length }}</dd>
              </div>
              <div>
                <dt>{{ t.fieldMode }}</dt>
                <dd>
                  {{
                    settings.fieldKeysMode === 'custom'
                      ? t.fieldKeysCustom
                      : t.fieldKeysDefault
                  }}
                </dd>
              </div>
              <div>
                <dt>{{ t.sizeLabel }}</dt>
                <dd>{{ t.sizeLabels[settings.size] }}</dd>
              </div>
            </dl>
            <dl class="result-meta">
              <div>
                <dt title="getBuildMetrics()">{{ t.metricsBuild }}</dt>
                <dd>{{ metrics.build }}</dd>
              </div>
              <div>
                <dt title="getWorkerMetrics()">{{ t.metricsWorker }}</dt>
                <dd>{{ metrics.worker }}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <ApiLog :entries="logs" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 整页固定视口：左栏选项自己滚，右栏树填满剩余高度，页面不出现外部滚动条。 */
.playground {
  display: grid;
  grid-template-columns: minmax(0, 336px) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  gap: 14px;
}

.playground__panel {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}

.playground__main {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  gap: 12px;
}

.playground__stage {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 8px;
}

.playground__tree {
  flex: 1;
  min-height: 240px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

/* 选了显式高度档位时，容器不再吃剩余空间，正好等于组件高度。 */
.playground__tree--fixed {
  flex: none;
}

/* 结果与日志：树下方的一条固定高度，两块各自内部滚动，高度不随内容跳动。 */
.playground__foot {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  height: 190px;
  min-height: 0;
  gap: 12px;
}

.playground__tree--dark {
  background: #1e2936;
  border-color: #35465d;
}

/* 深色预览必须同时把文字与交互态调亮，否则深字压深底根本看不见。 */
.playground__tree--dark :deep(.giant-tree),
.playground__tree--dark :deep(.giant-tree .giant-tree__row) {
  color: #e7edf5;
}

/* hover / 选中背景跟随主题主色，不再写死深蓝。 */
.playground__tree--dark :deep(.giant-tree .giant-tree__row:hover),
.playground__tree--dark :deep(.giant-tree .giant-tree__row--selected) {
  background: var(--giant-tree-bg-color-hover, #2a4058);
}

/*
 * 只把未选中图标提亮，保证它在深色预览背景上可见；选中态继续用主题主色，
 * 这样主色选择器在预览模式下也生效。
 */
.playground__tree--dark :deep(.giant-tree__mask-button:not(.checked)) {
  background-color: #b9c6d8;
}

.playground__note {
  margin: 0;
  padding: 5px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  font-size: 12px;
  color: var(--vp-c-text-3);
}

/*
 * MPTT 边界徽标：刻意用固定色，而不是跟随主题的 CSS 变量。
 * 它要同时出现在浅色页、暗色主题和「深色背景预览」三种底色上，而
 * `--vp-c-default-soft` / `--vp-c-text-3` 在深色底上会变成暗底暗字，整个徽标糊掉。
 * 样式对齐 src/App.vue 的 `.mptt-boundary-badge`。
 */
.playground__mptt {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid #ffd591;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  line-height: 16px;
  white-space: nowrap;
  color: #5c3b00;
  background: #fff7e6;
}

/* 结果卡分两栏：数值与选中结果在左，构建 / Worker 指标在右，190px 内一屏看完。 */
.playground__result {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-content: start;
  gap: 0 16px;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 10px 14px;
  background: var(--vp-c-bg-soft);
}

.result-col {
  min-width: 0;
}

.result-col--meta {
  padding-left: 16px;
  border-left: 1px solid var(--vp-c-divider);
}

/* 右栏第一条没有上邻内容，去掉分隔线，否则顶端会多出一道横线。 */
.result-col--meta .result-meta:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
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
  font-size: 20px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

.result-value {
  margin: 8px 0 10px;
  padding: 6px 8px;
  max-height: 104px;
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

/*
 * 窄屏：整页固定视口放不下左右两栏，回到上下堆叠。
 * 此时页面恢复滚动，右栏树改用固定高度（容器不再是它的高度来源）。
 * 这些规则放在通用规则之后，才能覆盖上面的 `overflow` / `flex`。
 */
@media (max-width: 960px) {
  .playground {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    flex: none;
  }

  .playground__panel {
    max-height: 44vh;
  }

  .playground__main {
    grid-template-rows: auto auto;
  }

  .playground__tree {
    flex: none;
    height: 420px;
    min-height: 0;
  }

  .playground__foot {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }

  .playground__result {
    overflow: visible;
  }
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
