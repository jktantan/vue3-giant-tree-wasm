<script setup lang="ts">
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

import { throttle, debounce } from 'throttle-debounce'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import TreeItem from '@lib/TreeItem.vue'
import type { TreeNodeData, TreeInputItem, TreeFieldKeys } from './types'
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
const container = ref<HTMLDivElement>()
const listHeight = ref<number>(0)
const currentTreeList = ref<TreeNodeData[]>([])
let scrollTop = 0,
  scrollHeight = 0
const startOffset = ref<number>(0)
const ro = new ResizeObserver((entries: ResizeObserverEntry[]) => {
  const { blockSize: height } = entries[0].contentBoxSize[0]
  scrollHeight = height
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  refreshTree()
})
const refreshTree = () => {
  const nodesStr = getShownNodes(tree)
  currentTreeList.value = JSON.parse(nodesStr) as TreeNodeData[]
}
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
const emitCheckedResult = () => {
  const result = props.outputIdOnly
    ? JSON.parse(getCheckedIds(tree))
    : JSON.parse(getCheckedNodes(tree))
  emit('update:modelValue', result)
}

const scrollEvent = throttle(16, handleScroll)
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

onMounted(() => {
  ro.observe(container.value!)
  clear(tree)
  // JSON 串传入保留原始行数据到 extendData
  setNeighborTree(tree, JSON.stringify(props.tree))
  // 立即刷新视图（不依赖 ResizeObserver）
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  refreshTree()
})
onUnmounted(() => {
  ro.disconnect()
})
const itemClick = (id: string) => {
  if (props.selectType === SelectType.SELECT) {
    checkNode(tree, id, CheckType.CHECKED)
    emitCheckedResult()
    refreshTree()
  }
}
const collapseClick = (id: string, isCollapse: boolean) => {
  collapseTree(tree, id, isCollapse)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}
const checkClick = (id: string, checkType: CheckType) => {
  checkNode(tree, id, checkType)
  emitCheckedResult()
  refreshTree()
}

const rawFuzzySearch = (keyword: string) => {
  fuzzyTree(tree, keyword)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}
/** 带 300ms 防抖的模糊搜索（适合 input 实时输入） */
const fuzzySearch = debounce(300, rawFuzzySearch)

const getTreeSize = (): number => {
  return getSize(tree)
}

const setChecked = (id: string) => {
  setCheckedNode(tree, id)
  emitCheckedResult()
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

const setCheckedByIds = (ids: string[]) => {
  setCheckedNodes(tree, ids)
  emitCheckedResult()
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

const clearAllChecked = () => {
  clearCheckedNodes(tree)
  emitCheckedResult()
  refreshTree()
}

const switchDisplay = (displayType: DisplayType) => {
  switchDisplayTree(tree, displayType)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

/** 重新发射当前选中结果（模式切换后刷新格式用） */
const refreshCheckedResult = () => {
  emitCheckedResult()
}

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
