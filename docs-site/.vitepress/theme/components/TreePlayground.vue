<script setup lang="ts">
/**
 * 按页参数化的 DEMO：每张使用说明页用它演示当前算法能力的一个侧面。
 * 组件只在客户端加载（页面用 `defineClientComponent`），因此可以安全使用组件库本体。
 */
import { computed, ref } from 'vue'
import { VueGiantTree, SelectType, CheckedOutputMode } from '@lib/index'
import type { FilterFn, NodeIconResolver, TreeNodeData } from '@lib/types'
import { buildTreeData, type TreePreset } from './treeData'
import { useMessages } from './i18n'

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

const t = useMessages()

const SELECT_TYPES: Record<typeof props.selectType, SelectType> = {
  CHECKBOX: SelectType.CHECKBOX,
  RADIO: SelectType.RADIO,
  SELECT: SelectType.SELECT,
}

const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const size = ref<TreePreset>(props.initialPreset)
const dataOptions = () => ({
  disabledEvery: 9,
  categoryEvery: 4,
  labelPrefix: t.nodeLabel,
})
const data = ref(buildTreeData(size.value, dataOptions()))
const checked = ref<TreeNodeData | TreeNodeData[] | string | string[]>([])
const keyword = ref('')
/** 模糊搜索页默认展示关键词高亮，其他页面不启用。 */
const highlight = ref(props.preset === 'fuzzy-search')
const useLine = ref(props.preset === 'guide-lines' || props.showLine)
const icons = ref(props.preset === 'node-icons' || props.nodeIcon)
const nodeCount = ref(data.value.length)

const currentSelectType = ref<typeof props.selectType>(props.selectType)
const outputMode = ref<'All' | 'RootOnly' | 'LeafOnly' | 'Custom'>('All')
const enableFilterFn = ref(false)

const selectType = computed(() => SELECT_TYPES[currentSelectType.value])
const outputModeEnum = computed(
  () =>
    ({
      All: CheckedOutputMode.All,
      RootOnly: CheckedOutputMode.RootOnly,
      LeafOnly: CheckedOutputMode.LeafOnly,
      Custom: CheckedOutputMode.Custom,
    })[outputMode.value]
)

const reload = (preset: TreePreset = size.value) => {
  size.value = preset
  data.value = buildTreeData(preset, dataOptions())
  checked.value = []
  nodeCount.value = data.value.length
}

/** 只让 category 为 'A' 的节点可选 / 可输出。 */
const filterFn: FilterFn = extendData => extendData.category === 'A'

/** 业务字段映射成 CSS 图标类的示例。 */
const nodeIconResolver: NodeIconResolver = node =>
  node.extendData?.category === 'B' ? false : true

const resultText = computed(() => {
  const value = checked.value
  if (Array.isArray(value)) {
    if (value.length === 0) return t.noneChecked
    const head = value
      .slice(0, 6)
      .map(item => (typeof item === 'string' ? item : item.id))
    return `${value.length}：${head.join('、')}${
      value.length > head.length ? ' …' : ''
    }`
  }
  if (!value) return t.noneChecked
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
        <span>{{ t.sizeLabel }}</span>
        <select
          :value="size"
          @change="
            reload(($event.target as HTMLSelectElement).value as TreePreset)
          "
        >
          <option value="small">
            {{ t.sizeLabels.small }} · {{ t.nodeCount(39) }}
          </option>
          <option value="medium">
            {{ t.sizeLabels.medium }} · {{ t.nodeCount(258) }}
          </option>
          <option value="10k">
            {{ t.sizeLabels['10k'] }} · {{ t.nodeCount(10000) }}
          </option>
        </select>
      </label>

      <label v-if="preset === 'guide-lines'" class="tree-playground__field">
        <span>{{ t.showLine }}</span>
        <input type="checkbox" v-model="useLine" />
      </label>

      <label v-if="preset === 'node-icons'" class="tree-playground__field">
        <span>{{ t.nodeIcon }}</span>
        <input type="checkbox" v-model="icons" />
      </label>

      <template v-if="preset === 'fuzzy-search'">
        <label class="tree-playground__field">
          <span>{{ t.keyword }}</span>
          <input
            v-model="keyword"
            type="text"
            :placeholder="t.keywordPlaceholder"
            @keyup.enter="doSearch"
          />
        </label>
        <button type="button" @click="doSearch">{{ t.search }}</button>
        <button type="button" @click="clearSearch">{{ t.clear }}</button>
        <label class="tree-playground__field">
          <span>{{ t.searchHighlight }}</span>
          <input type="checkbox" v-model="highlight" />
        </label>
      </template>

      <template v-if="preset === 'check-and-output'">
        <label class="tree-playground__field">
          <span>{{ t.selectType }}</span>
          <select v-model="currentSelectType">
            <option value="CHECKBOX">{{ t.selectTypeLabels.CHECKBOX }}</option>
            <option value="RADIO">{{ t.selectTypeLabels.RADIO }}</option>
            <option value="SELECT">{{ t.selectTypeLabels.SELECT }}</option>
          </select>
        </label>
        <label class="tree-playground__field">
          <span>{{ t.outputMode }}</span>
          <select v-model="outputMode">
            <option value="All">{{ t.outputModeLabels.All }}</option>
            <option value="RootOnly">{{ t.outputModeLabels.RootOnly }}</option>
            <option value="LeafOnly">{{ t.outputModeLabels.LeafOnly }}</option>
            <option value="Custom">{{ t.outputModeLabels.Custom }}</option>
          </select>
        </label>
        <label class="tree-playground__field">
          <span>{{ t.filterFn }}</span>
          <input type="checkbox" v-model="enableFilterFn" />
        </label>
      </template>

      <template v-if="preset === 'check-and-output' || preset === 'crud'">
        <button type="button" @click="clearChecked">
          {{ t.clearChecked }}
        </button>
      </template>

      <button type="button" @click="expandAll">{{ t.expandAll }}</button>
      <button type="button" @click="collapseAll">{{ t.collapseAll }}</button>
      <button type="button" @click="querySize">{{ t.treeSize }}</button>
    </div>

    <div class="tree-playground__tree">
      <VueGiantTree
        ref="treeRef"
        :key="`s${currentSelectType}-z${size}`"
        v-model="checked"
        :tree="data"
        root="root"
        height="420px"
        :select-type="selectType"
        :show-line="useLine"
        :search-highlight="highlight"
        :node-icon="icons ? nodeIconResolver : false"
        :filter-fn="
          preset === 'check-and-output' && enableFilterFn ? filterFn : undefined
        "
        :checked-output-mode="outputModeEnum"
      />
    </div>

    <div class="tree-playground__output">
      <p>
        <strong>{{ t.totalNodes }}：</strong>{{ nodeCount }}
      </p>
      <p>
        <strong>{{ t.checkedResult }}：</strong>{{ resultText }}
      </p>
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
