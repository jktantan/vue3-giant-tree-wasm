<script setup lang="ts">
import {
  newTree,
  setBoundary,
  SelectType,
  clear,
  pushNeighborNode,
  popNeighbor,
  getShownNodes,
  getShownHeight,
  collapseTree,
  checkNode,
  getCheckedNodes,
  CheckType,
  DisplayType,
  fuzzyTree,
  getSize,
  switchDisplayTree,
  clearCheckedNodes,
  setCheckedNode,
  setCheckedNodes,
} from '../build/release'

import { throttle } from 'throttle-debounce'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import TreeItem from '@lib/TreeItem.vue'
import type { TreeNodeData, TreeInputItem } from './types'
const props = withDefaults(
  defineProps<{
    modelValue: TreeNodeData | TreeNodeData[]
    width?: string
    height?: string
    lineHeight?: number
    size?: number
    selectType?: SelectType
    root?: string
    fontSize?: string
    tree: TreeInputItem[]
  }>(),
  {
    width: '100%',
    height: '100%',
    lineHeight: 26,
    selectType: SelectType.CHECKBOX,
    root: '',
    fontSize: '14px',
    tree: () => [],
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
const scrollEvent = throttle(16, handleScroll)
const transformOffset = computed(
  () => `translate3d(0,${startOffset.value}px,0)`
)

const tree = newTree(props.root, props.lineHeight, props.selectType)

onMounted(async () => {
  ro.observe(container.value!)
  setBoundary(tree, scrollTop, scrollHeight)
  clear(tree)
  for (let i = 0; i < props.tree.length; i++) {
    const { id, name, parentId } = props.tree[i]
    pushNeighborNode(tree, id, name, parentId)
  }
  popNeighbor(tree)
})
onUnmounted(() => {
  ro.disconnect()
})
const itemClick = (id: string) => {
  if (props.selectType === SelectType.SELECT) {
    checkNode(tree, id, CheckType.CHECKED)
    const checkResult = getCheckedNodes(tree)
    emit('update:modelValue', JSON.parse(checkResult))
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
  const checkResult = getCheckedNodes(tree)
  emit('update:modelValue', JSON.parse(checkResult))
  refreshTree()
}

const fuzzySearch = (keyword: string) => {
  fuzzyTree(tree, keyword)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

const getTreeSize = (): number => {
  return getSize(tree)
}

const setChecked = (id: string) => {
  setCheckedNode(tree, id)
  const checkResult = getCheckedNodes(tree)
  emit('update:modelValue', JSON.parse(checkResult))
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

const setCheckedByIds = (ids: string[]) => {
  setCheckedNodes(tree, ids)
  const checkResult = getCheckedNodes(tree)
  emit('update:modelValue', JSON.parse(checkResult))
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

const clearAllChecked = () => {
  clearCheckedNodes(tree)
  emit('update:modelValue', [])
  refreshTree()
}

const switchDisplay = (displayType: DisplayType) => {
  switchDisplayTree(tree, displayType)
  listHeight.value = getShownHeight(tree)
  refreshTree()
}

defineExpose({
  fuzzySearch,
  getTreeSize,
  setChecked,
  setCheckedByIds,
  clearAllChecked,
  switchDisplay,
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
        />
      </template>
    </div>
  </div>
</template>

<style scoped></style>
