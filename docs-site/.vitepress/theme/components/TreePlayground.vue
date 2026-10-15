<script setup lang="ts">
/**
 * 按页参数化的 DEMO：每张使用说明页用它演示当前算法能力的一个侧面。
 * 组件只在客户端加载（页面用 `defineClientComponent`），因此可以安全使用组件库本体。
 */
import { computed, ref } from 'vue'
import { VueGiantTree, SelectType, CheckedOutputMode } from '@lib/index'
import type { FilterFn, NodeIconResolver, TreeNodeData } from '@lib/types'
import { buildTreeData, type TreePreset } from './treeData'

type Preset =
  | 'tree-building'
  | 'virtual-scroll'
  | 'fuzzy-search'
  | 'check-and-output'
  | 'serialization'
  | 'guide-lines'
  | 'node-icons'
  | 'crud'

const props = withDefaults(
  defineProps<{
    preset: Preset
    selectType?: 'CHECKBOX' | 'RADIO' | 'SELECT'
    showLine?: boolean
    nodeIcon?: boolean
    initialPreset?: TreePreset
  }>(),
  {
    selectType: 'CHECKBOX',
    showLine: false,
    nodeIcon: false,
    initialPreset: 'medium',
  }
)

const SELECT_TYPES: Record<typeof props.selectType, SelectType> = {
  CHECKBOX: SelectType.CHECKBOX,
  RADIO: SelectType.RADIO,
  SELECT: SelectType.SELECT,
}

const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const size = ref<TreePreset>(props.initialPreset)
const data = ref(buildTreeData(size.value, { disabledEvery: 9, categoryEvery: 4 }))
const checked = ref<TreeNodeData | TreeNodeData[] | string | string[]>([])
const keyword = ref('')
const useLine = ref(props.preset === 'guide-lines' || props.showLine)
const icons = ref(props.preset === 'node-icons' || props.nodeIcon)
const nodeCount = ref(data.value.length)

const reload = (preset: TreePreset = size.value) => {
  size.value = preset
  data.value = buildTreeData(preset, { disabledEvery: 9, categoryEvery: 4 })
  checked.value = []
  nodeCount.value = data.value.length
}

const selectType = computed(() => SELECT_TYPES[props.selectType])

/** 只让 category 为 'A' 的节点可选 / 可输出。 */
const filterFn: FilterFn = extendData => extendData.category === 'A'

/** 业务字段映射成 CSS 图标类的示例。 */
const nodeIconResolver: NodeIconResolver = node =>
  node.extendData?.category === 'B' ? false : true

const resultText = computed(() => {
  const value = checked.value
  if (Array.isArray(value)) {
    if (value.length === 0) return '（未选中）'
    const head = value.slice(0, 6).map(item => (typeof item === 'string' ? item : item.id))
    return `${value.length} 项：${head.join('、')}${value.length > head.length ? ' …' : ''}`
  }
  if (!value) return '（未选中）'
  return typeof value === 'string' ? value : value.id
})

const doSearch = () => treeRef.value?.fuzzySearch(keyword.value)
const clearSearch = () => {
  keyword.value = ''
  treeRef.value?.fuzzySearchRaw('')
}
const expandAll = () => treeRef.value?.expandAll()
const collapseAll = () => treeRef.value?.collapseAll()
const clearChecked = () => {
  treeRef.value?.clearAllChecked()
  checked.value = []
}
const querySize = () => {
  nodeCount.value = treeRef.value?.getTreeSize() ?? 0
}
</script>

<template>
  <div class="tree-playground">
    <div class="tree-playground__controls">
      <label class="tree-playground__field">
        <span>数据规模</span>
        <select :value="size" @change="reload(($event.target as HTMLSelectElement).value as TreePreset)">
          <option value="small">small（39 节点）</option>
          <option value="medium">medium（258 节点）</option>
          <option value="10k">10k（10000 节点）</option>
        </select>
      </label>

      <label v-if="preset === 'guide-lines'" class="tree-playground__field">
        <span>连接线</span>
        <input type="checkbox" v-model="useLine" />
      </label>

      <label v-if="preset === 'node-icons'" class="tree-playground__field">
        <span>节点图标</span>
        <input type="checkbox" v-model="icons" />
      </label>

      <template v-if="preset === 'fuzzy-search'">
        <label class="tree-playground__field">
          <span>关键词</span>
          <input v-model="keyword" type="text" placeholder="例如 节点 n1" @keyup.enter="doSearch" />
        </label>
        <button type="button" @click="doSearch">搜索</button>
        <button type="button" @click="clearSearch">清除</button>
      </template>

      <template v-if="preset === 'check-and-output' || preset === 'crud'">
        <button type="button" @click="clearChecked">清除选中</button>
      </template>

      <button type="button" @click="expandAll">全部展开</button>
      <button type="button" @click="collapseAll">全部收起</button>
      <button type="button" @click="querySize">树节点总数</button>
    </div>

    <div class="tree-playground__tree">
      <VueGiantTree
        ref="treeRef"
        v-model="checked"
        :tree="data"
        root="root"
        height="420px"
        :select-type="selectType"
        :show-line="useLine"
        :node-icon="icons ? nodeIconResolver : false"
        :filter-fn="preset === 'check-and-output' ? filterFn : undefined"
        :checked-output-mode="CheckedOutputMode.All"
      />
    </div>

    <div class="tree-playground__output">
      <p><strong>节点总数：</strong>{{ nodeCount }}</p>
      <p><strong>选中结果：</strong>{{ resultText }}</p>
    </div>
  </div>
</template>

<style scoped>
.tree-playground {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 12px;
  background: var(--vp-c-bg-soft);
}

.tree-playground__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  margin-bottom: 12px;
}

.tree-playground__field {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
}

.tree-playground__field input[type='text'],
.tree-playground__field select {
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 2px 6px;
  background: var(--vp-c-bg);
}

.tree-playground button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 13px;
  background: var(--vp-c-bg);
  cursor: pointer;
}

.tree-playground__tree {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.tree-playground__output {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.7;
  word-break: break-all;
}
</style>
