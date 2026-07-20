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
  getShownNodes,
  getShownHeight,
  collapseTree,
  checkNode,
  getCheckedNodes,
  getCheckedIds,
  CheckType,
  DisplayType,
  fuzzyTree,
  getSize,
  switchDisplayTree,
  clearCheckedNodes,
  setCheckedNode,
  setCheckedNodes,
  setCheckedOutputMode,
} from '../build/release'

import { debounce } from 'throttle-debounce'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import TreeItem from '@lib/TreeItem.vue'
import type { TreeNodeData, TreeInputItem, TreeFieldKeys, FilterFn } from './types'
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
  }
)
const emit = defineEmits(['update:modelValue'])
/** 组件引用: 滚动容器 DOM / Component ref: scroll container DOM / Ссылка на компонент: DOM контейнера прокрутки */
const container = ref<HTMLDivElement>()
/** 可见节点总数，由 WASM 侧 shownCount 驱动 / Total visible node count, driven by WASM shownCount / Общее количество видимых узлов */
const listHeight = ref<number>(0)
/** 当前树列表（可视区域内节点） / Current tree list (nodes within viewport) / Текущий список дерева (узлы в области просмотра) */
const currentTreeList = ref<TreeNodeData[]>([])
let scrollTop = 0,
  scrollHeight = 0
const startOffset = ref<number>(0)
/** ResizeObserver: 监听容器高度变化，同步 WASM 边界 + 刷新视图 / ResizeObserver: watches container height changes, syncs WASM boundary + refreshes view / ResizeObserver: отслеживает изменение высоты контейнера, синхронизирует границы WASM + обновляет вид */
const ro = new ResizeObserver((entries: ResizeObserverEntry[]) => {
  const { blockSize: height } = entries[0].contentBoxSize[0]
  scrollHeight = height
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  refreshTree()
})
/** 记录上次 WASM 返回的 JSON 字符串，相同则跳过 parse+Vue 响应式更新 */
let lastNodesStr = ''
const refreshTree = () => {
  const nodesStr = getShownNodes(tree)
  if (nodesStr === lastNodesStr) return
  lastNodesStr = nodesStr
  currentTreeList.value = JSON.parse(nodesStr) as TreeNodeData[]
}
/** 滚动 rAF 标记：合并同一帧内的多次滚动事件 */
let scrollRafId = 0
const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  scrollTop = target.scrollTop
  startOffset.value = scrollTop - (scrollTop % props.lineHeight)
  setBoundary(tree, scrollTop, scrollHeight)
  refreshTree()
}
/**
 * 根据 outputIdOnly 配置发射选中结果
 * Emit checked result according to outputIdOnly config
 */
/** 按防抖输出选中结果 / Emit checked result with debounce / Выдать результат выбора с антидребезгом */
const emitCheckedResult = () => {
  if (props.checkedOutputMode === CheckedOutputMode.Custom && props.filterFn) {
    // Custom 模式：获取完整节点数据，用 filterFn 过滤后再决定输出 ID 还是 JSON
    // Custom mode: get full node data, filter with filterFn, then decide ID or JSON output
    // Пользовательский режим: получить полные данные узлов, отфильтровать filterFn, затем решить, выводить ID или JSON
    // getCheckedNodes 返回的是 extendData 原始 JSON（非 TreeNodeData 结构），直接传给 filterFn
    const nodes = JSON.parse(getCheckedNodes(tree)) as Record<string, unknown>[]
    const filtered = nodes.filter((item) => props.filterFn!(item))
    const result = props.outputIdOnly
      ? filtered.map((item) => item.id)
      : filtered
    emit('update:modelValue', result)
  } else {
    const result = props.outputIdOnly
      ? JSON.parse(getCheckedIds(tree))
      : JSON.parse(getCheckedNodes(tree))
    emit('update:modelValue', result)
  }
}

/** rAF 包裹的滚动处理：跟随浏览器渲染帧，减少无效回调 */
const scrollEvent = (event: Event) => {
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
      fk.rightNodeField ?? 'rightNode'
    )
  : newTree(props.root, props.lineHeight, props.selectType)

// 初始化 CHECKBOX 输出模式
setCheckedOutputMode(tree, props.checkedOutputMode)

// 输出格式变化（ID ↔ JSON）→ 用新格式重发选中结果
watch(() => props.outputIdOnly, () => {
  emitCheckedResult()
})

// CHECKBOX 过滤模式变化 → 更新 WASM 树 + 重发
watch(() => props.checkedOutputMode, (newMode) => {
  setCheckedOutputMode(tree, newMode)
  emitCheckedResult()
})

// tree prop 变化 → 重新加载 WASM 树数据
watch(() => props.tree, (newTree) => {
  clear(tree)
  if (newTree.length > 0) {
    setNeighborTree(tree, JSON.stringify(newTree))
  }
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}, { deep: true })

/** 挂载时初始化: 观察容器大小、加载树数据、立即渲染首屏 / On mount: observe container, load tree data, render initial viewport immediately / При монтировании: наблюдать за контейнером, загрузить данные дерева, сразу отрендерить начальный viewport */
onMounted(() => {
  ro.observe(container.value!)
  clear(tree)
  if (props.tree.length > 0) {
    setNeighborTree(tree, JSON.stringify(props.tree))
  }
  // 立即刷新视图（不依赖 ResizeObserver）/ Refresh view immediately (not dependent on ResizeObserver) / Немедленное обновление вида (не зависит от ResizeObserver)
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  refreshTree()
})
onUnmounted(() => {
  ro.disconnect()
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId)
    scrollRafId = 0
  }
  clear(tree)
  lastNodesStr = ''
})
/** 行点击（SELECT 模式选中节点） / Row click (selects node in SELECT mode) / Клик по строке (выбирает узел в режиме SELECT) */
const itemClick = (id: string) => {
  if (props.selectType === SelectType.SELECT) {
    checkNode(tree, id, CheckType.CHECKED)
    emitCheckedResult()
    refreshTree()
  }
}
/** 展开/折叠节点 / Expand/collapse node / Развернуть/свернуть узел */
const collapseClick = (id: string, isCollapse: boolean) => {
  collapseTree(tree, id, isCollapse)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}
/** 复选框/单选框点击 / Checkbox/radio click / Клик по чекбоксу/радио */
const checkClick = (id: string, checkType: CheckType) => {
  checkNode(tree, id, checkType)
  emitCheckedResult()
  refreshTree()
}

/** 模糊搜索（无防抖，立即执行）/ Fuzzy search (no debounce, immediate) / Нечёткий поиск (без антидребезга, немедленно) */
const rawFuzzySearch = (keyword: string) => {
  fuzzyTree(tree, keyword)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}
/** 带 300ms 防抖的模糊搜索（适合 input 实时输入）/ Fuzzy search with 300ms debounce (suitable for real-time input) / Нечёткий поиск с антидребезгом 300мс (подходит для ввода в реальном времени) */
const fuzzySearch = debounce(300, rawFuzzySearch)

/** 获取树节点总数 / Get total tree node count / Получить общее количество узлов дерева */
const getTreeSize = (): number => {
  return getSize(tree)
}

/** 单选设置选中节点 / Set checked node (single-select) / Установить выбранный узел (одиночный выбор) */
const setChecked = (id: string) => {
  setCheckedNode(tree, id)
  emitCheckedResult()
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

/** 批量设置选中节点 / Batch set checked nodes / Пакетная установка выбранных узлов */
const setCheckedByIds = (ids: string[]) => {
  setCheckedNodes(tree, ids)
  emitCheckedResult()
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

/** 清除所有选中状态 / Clear all check states / Очистить все состояния выбора */
const clearAllChecked = () => {
  clearCheckedNodes(tree)
  emitCheckedResult()
  refreshTree()
}

/** 切换显示模式（完整树↔搜索树） / Switch display mode (full tree ↔ search tree) / Переключение режима отображения (полное дерево ↔ дерево поиска) */
const switchDisplay = (displayType: DisplayType) => {
  switchDisplayTree(tree, displayType)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

/** 重新发射当前选中结果（模式切换后刷新格式用）/ Re-emit current checked result (for format refresh after mode switch) / Повторно выдать текущий результат выбора (для обновления формата после переключения режима) */
const refreshCheckedResult = () => {
  emitCheckedResult()
}

/** 暴露给父组件的方法 / Methods exposed to parent component / Методы, доступные родительскому компоненту */
defineExpose({
  fuzzySearch,
  fuzzySearchRaw: rawFuzzySearch,
  getTreeSize,
  setChecked,
  setCheckedByIds,
  clearAllChecked,
  switchDisplay,
  refreshCheckedResult,
})
</script>

<!-- 虚拟滚动模板：phantom div 撑开总高度 → translate3d 定位可视节点 / Virtual scroll template: phantom div for total height + translate3d positions visible nodes / Шаблон виртуальной прокрутки: phantom div для общей высоты + translate3d позиционирует видимые узлы -->
<template>
  <div
    ref="container"
    class="giant-tree tree-container"
    :style="{ width: width, height: height }"
    @scroll="scrollEvent"
  >
    <div
      class="infinite-list-phantom"
      :style="{ height: listHeight + 'px' }"
    ></div>
    <div class="infinite-list" :style="{ transform: transformOffset }">
      <template v-for="item in currentTreeList" :key="item.id">
        <tree-item
          :style="{ height: lineHeight + 'px' }"
          :item="item"
          :fontSize="fontSize"
          @collapse-click="collapseClick"
          :select-type="selectType"
          :filter-fn="filterFn"
          @check-click="checkClick"
          @item-click="itemClick"
        >
          <template v-if="$slots.node" #node="slotProps">
            <slot name="node" v-bind="slotProps" />
          </template>
        </tree-item>
      </template>
    </div>
  </div>
</template>

<style scoped></style>
