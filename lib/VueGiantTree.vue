<script setup lang="ts">
/**
 * VueGiantTree 主组件：高性能虚拟滚动树，基于 MPTT 算法的纯 JS 实现
 */
import {
  GiantTree,
  CheckType,
  CheckedOutputMode,
  SelectType,
  DisplayType,
} from './giant-tree'
import type { MpttNode } from './giant-tree'

import { debounce } from 'throttle-debounce'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import TreeItem from '@lib/TreeItem.vue'
import type { TreeInputItem, TreeFieldKeys, FilterFn } from './types'

const props = withDefaults(
  defineProps<{
    modelValue: MpttNode | MpttNode[] | string | string[]
    width?: string
    height?: string
    lineHeight?: number
    size?: number
    selectType?: SelectType
    root?: string
    fontSize?: string
    tree: TreeInputItem[]
    fieldKeys?: TreeFieldKeys
    outputIdOnly?: boolean
    checkedOutputMode?: CheckedOutputMode
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

const container = ref<HTMLDivElement>()
const listHeight = ref<number>(0)
const currentTreeList = ref<MpttNode[]>([])
let scrollTop = 0,
  scrollHeight = 0
const startOffset = ref<number>(0)

const fk = props.fieldKeys
const giantTree = new GiantTree(
  props.root,
  props.lineHeight,
  props.selectType,
  fk.idField ?? 'id',
  fk.nameField ?? 'name',
  fk.parentIdField ?? 'parentId'
)
giantTree.checkedOutputMode = props.checkedOutputMode

const ro = new ResizeObserver((entries: ResizeObserverEntry[]) => {
  const { blockSize: height } = entries[0].contentBoxSize[0]
  scrollHeight = height
  giantTree.setBoundary(scrollTop, scrollHeight)
  listHeight.value = giantTree.getShownHeight()
  refreshTree()
})

let lastSlice: MpttNode[] | null = null
const refreshTree = () => {
  const slice = giantTree.getShownNodes()
  if (slice === lastSlice) return
  lastSlice = slice
  currentTreeList.value = slice
}

let scrollRafId = 0
const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  scrollTop = target.scrollTop
  startOffset.value = scrollTop - (scrollTop % props.lineHeight)
  giantTree.setBoundary(scrollTop, scrollHeight)
  refreshTree()
}

const emitCheckedResult = () => {
  if (props.checkedOutputMode === CheckedOutputMode.Custom && props.filterFn) {
    const nodes = giantTree.getCheckedNodes()
    const filtered = nodes.filter((item) =>
      props.filterFn!(item.extendData || {})
    )
    const result = props.outputIdOnly
      ? filtered.map((item) => item.id)
      : filtered.map((item) => item.extendData || item)
    emit('update:modelValue', result)
  } else {
    if (props.outputIdOnly) {
      emit('update:modelValue', giantTree.getCheckedIds())
    } else {
      const nodes = giantTree.getCheckedNodes()
      emit(
        'update:modelValue',
        nodes.map((n) => n.extendData || n)
      )
    }
  }
}

const scrollEvent = (event: Event) => {
  if (scrollRafId) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = 0
    handleScroll(event)
  })
}

const transformOffset = computed(
  () => `translate3d(0,${startOffset.value}px,0)`
)

const loadTree = (data: TreeInputItem[]) => {
  giantTree.clear()
  if (data.length > 0) {
    giantTree.setTree(data as unknown as Record<string, unknown>[])
  }
  giantTree.setBoundary(scrollTop, scrollHeight)
  listHeight.value = giantTree.getShownHeight()
  refreshTree()
}

watch(
  () => props.outputIdOnly,
  () => emitCheckedResult()
)

watch(
  () => props.checkedOutputMode,
  (newMode) => {
    giantTree.checkedOutputMode = newMode
    emitCheckedResult()
  }
)

watch(
  () => props.tree,
  (newTree) => loadTree(newTree),
  { deep: true }
)

onMounted(() => {
  ro.observe(container.value!)
  loadTree(props.tree)
})

onUnmounted(() => {
  ro.disconnect()
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId)
    scrollRafId = 0
  }
  giantTree.clear()
  lastSlice = null
})

const itemClick = (id: string) => {
  if (props.selectType === SelectType.SELECT) {
    giantTree.checkNode(id, CheckType.CHECKED)
    emitCheckedResult()
    refreshTree()
  }
}

const collapseClick = (id: string, isCollapse: boolean) => {
  giantTree.collapseTree(id, isCollapse)
  listHeight.value = giantTree.getShownHeight()
  refreshTree()
}

const checkClick = (id: string, checkType: CheckType) => {
  giantTree.checkNode(id, checkType)
  emitCheckedResult()
  refreshTree()
}

const rawFuzzySearch = (keyword: string) => {
  giantTree.fuzzySearch(keyword)
  listHeight.value = giantTree.getShownHeight()
  refreshTree()
}
const fuzzySearch = debounce(300, rawFuzzySearch)

const getTreeSize = (): number => giantTree.getSize()

const setChecked = (id: string) => {
  giantTree.setCheckedNode(id)
  emitCheckedResult()
  listHeight.value = giantTree.getShownHeight()
  refreshTree()
}

const setCheckedByIds = (ids: string[]) => {
  giantTree.setCheckedNodes(ids)
  emitCheckedResult()
  listHeight.value = giantTree.getShownHeight()
  refreshTree()
}

const clearAllChecked = () => {
  giantTree.clearCheckedNodes()
  emitCheckedResult()
  refreshTree()
}

const switchDisplay = (displayType: DisplayType) => {
  giantTree.switchDisplayTree(displayType)
  listHeight.value = giantTree.getShownHeight()
  refreshTree()
}

const refreshCheckedResult = () => emitCheckedResult()

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
