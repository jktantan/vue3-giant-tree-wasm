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
} from '../build/debug'

import { ResizeObserver } from '@juggle/resize-observer'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ResizeObserverEntry } from '@juggle/resize-observer/lib/ResizeObserverEntry'
import TreeItem from '@lib/TreeItem.vue'
import { CheckType } from '../build/release'
const props = withDefaults(
  defineProps<{
    modelValue: any | any[]
    width?: string
    height?: string
    lineHeight?: number
    size?: number
    selectType?: SelectType
    root?: string
    fontSize?: string
    tree: any[]
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
const currentTreeList = ref<any[]>([])
let scrollTop = 0,
  scrollHeight = 0
const startOffset = ref<number>(0)
const ro = new ResizeObserver((entries: ResizeObserverEntry[]) => {
  console.log('Body has resized!')
  const { inlineSize: width, blockSize: height } = entries[0].contentBoxSize[0]
  scrollHeight = height
  setBoundary(tree, scrollTop, scrollHeight)
  listHeight.value = getShownHeight(tree)
  getTree()
  console.log(width, height)
})
const getTree = () => {
  const nodesStr = getShownNodes(tree)
  currentTreeList.value.splice(0)
  currentTreeList.value.push(...JSON.parse(nodesStr))
  console.log(currentTreeList.value)
}
const scrollEvent = $event => {
  scrollTop = $event.target.scrollTop
  //此时的偏移量
  startOffset.value = scrollTop - (scrollTop % props.lineHeight)
  setBoundary(tree, scrollTop, scrollHeight)
  getTree()
}
const transformOffset = computed(
  () => `translate3d(0,${startOffset.value}px,0)`
)

const tree = newTree(props.root, props.lineHeight, props.selectType)

onMounted(async () => {
  console.log('root: ', props.root)

  ro.observe(container.value)
  setBoundary(tree, scrollTop, scrollHeight)
  clear(tree)
  for (let i = 0; i < props.tree.length; i++) {
    const { id, name, parentId } = props.tree[i]
    pushNeighborNode(tree, id, name, parentId)
  }
  popNeighbor(tree)
  // const nodesStr = getShownNodes(tree)
  //
  // currentTreeList.value.splice(0)
  // currentTreeList.value.push(...JSON.parse(nodesStr))
  // console.log(currentTreeList.value)
})
onUnmounted(() => {
  ro.disconnect()
})
const itemClick = (id: string) => {
  if (props.selectType === SelectType.SELECT) {
    checkNode(tree, id, CheckType.CHECKED)
    const checkResult = getCheckedNodes(tree)
    emit('update:modelValue', JSON.parse(checkResult))
    getTree()
  }
}
const collapseClick = (id: string, isCollapse: boolean) => {
  console.log('collapseClick: ', id, isCollapse)
  collapseTree(tree, id, isCollapse)
  listHeight.value = getShownHeight(tree)
  getTree()
}
const checkClick = (id: string, checkType: CheckType) => {
  console.log('checkClick: ', id, checkType)
  checkNode(tree, id, checkType)
  const checkResult = getCheckedNodes(tree)
  emit('update:modelValue', JSON.parse(checkResult))
  getTree()
}
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
