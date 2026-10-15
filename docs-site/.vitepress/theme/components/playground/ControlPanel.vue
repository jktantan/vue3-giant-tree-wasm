<script setup lang="ts">
import type { ApiAction, PlaygroundSettings } from './settings'

const props = defineProps<{ settings: PlaygroundSettings }>()
const emit = defineEmits<{ action: [ApiAction] }>()

/** 直接引用父组件的 reactive 对象，控件改动即写回。 */
const settings = props.settings

const sizes: Array<{ value: PlaygroundSettings['size']; label: string }> = [
  { value: 'small', label: 'small' },
  { value: 'medium', label: 'medium' },
  { value: '10k', label: '10k' },
  { value: '100k', label: '100k（较慢）' },
]

const heights = ['240px', '360px', '520px', '720px']
const fonts = ['12px', '14px', '16px']
const lineColors = ['#d0d4dc', '#9ca3af', '#3b82f6', '#ef4444', '#10b981']
</script>

<template>
  <div class="control-panel">
    <fieldset>
      <legend>数据规模</legend>
      <button
        v-for="item in sizes"
        :key="item.value"
        type="button"
        :class="{ active: settings.size === item.value }"
        @click="settings.size = item.value"
      >
        {{ item.label }}
      </button>
      <p class="hint">10k / 100k 在点击后才会生成，避免默认拖慢页面。</p>
    </fieldset>

    <fieldset>
      <legend>布局</legend>
      <label>
        高度
        <select v-model="settings.height">
          <option v-for="h in heights" :key="h" :value="h">{{ h }}</option>
        </select>
      </label>
      <label>
        行高
        <input v-model.number="settings.lineHeight" type="number" min="18" max="60" />
      </label>
      <label>
        字号
        <select v-model="settings.fontSize">
          <option v-for="f in fonts" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
    </fieldset>

    <fieldset>
      <legend>选择与输出</legend>
      <button
        v-for="mode in (['CHECKBOX', 'RADIO', 'SELECT'] as const)"
        :key="mode"
        type="button"
        :class="{ active: settings.selectType === mode }"
        @click="settings.selectType = mode"
      >
        {{ mode }}
      </button>
      <label>
        <input v-model="settings.outputIdOnly" type="checkbox" />
        outputIdOnly（只输出 ID）
      </label>
      <label>
        checkedOutputMode
        <select v-model="settings.checkedOutputMode">
          <option value="All">All</option>
          <option value="RootOnly">RootOnly</option>
          <option value="LeafOnly">LeafOnly</option>
          <option value="Custom">Custom</option>
        </select>
      </label>
      <label>
        <input v-model="settings.enableFilterFn" type="checkbox" />
        filterFn（仅保留 category=A）
      </label>
    </fieldset>

    <fieldset>
      <legend>行渲染</legend>
      <label>
        <input v-model="settings.showLine" type="checkbox" />
        showLine
      </label>
      <template v-if="settings.showLine">
        <button
          v-for="style in (['solid', 'dashed', 'dotted'] as const)"
          :key="style"
          type="button"
          :class="{ active: settings.showLineStyle === style }"
          @click="settings.showLineStyle = style"
        >
          {{ style }}
        </button>
        <label>
          颜色
          <select v-model="settings.showLineColor">
            <option v-for="c in lineColors" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label>
          粗细
          <input v-model.number="settings.showLineWidth" type="number" min="1" max="4" />
        </label>
      </template>
      <label>
        nodeIcon
        <select v-model="settings.nodeIcon">
          <option value="off">off</option>
          <option value="default">内置图标</option>
          <option value="business">业务字段映射</option>
        </select>
      </label>
      <label>
        <input v-model="settings.useNodeSlot" type="checkbox" />
        #node 插槽
      </label>
      <label>
        <input v-model="settings.useActionsSlot" type="checkbox" />
        #actions 插槽
      </label>
    </fieldset>

    <fieldset>
      <legend>构建与 Worker</legend>
      <label>
        <input v-model="settings.workerMode" type="checkbox" />
        workerMode
      </label>
      <label>
        <input v-model="settings.chunkedBuild" type="checkbox" />
        chunkedBuild
      </label>
      <label>
        buildBatchSize
        <input v-model.number="settings.buildBatchSize" type="number" min="100" step="100" />
      </label>
      <label>
        <input v-model="settings.preorderedInput" type="checkbox" />
        preorderedInput
      </label>
      <label>
        fieldKeys
        <select v-model="settings.fieldKeysMode">
          <option value="default">默认字段</option>
          <option value="custom">key/label/parent</option>
        </select>
      </label>
    </fieldset>

    <fieldset>
      <legend>实例方法</legend>
      <button type="button" @click="emit('action', 'expandAll')">expandAll</button>
      <button type="button" @click="emit('action', 'collapseAll')">collapseAll</button>
      <button type="button" @click="emit('action', 'clearAllChecked')">clearAllChecked</button>
      <button type="button" @click="emit('action', 'setCheckedFirst')">setCheckedByIds</button>
      <button type="button" @click="emit('action', 'switchDisplayTree')">switchDisplay(TREE)</button>
      <button type="button" @click="emit('action', 'switchDisplaySearch')">switchDisplay(SEARCH)</button>
      <button type="button" @click="emit('action', 'refreshCheckedResult')">refreshCheckedResult</button>
      <button type="button" @click="emit('action', 'updateFirst')">updateNode</button>
      <button type="button" @click="emit('action', 'addChild')">addNode</button>
      <button type="button" @click="emit('action', 'removeLast')">removeNode</button>
      <button type="button" @click="emit('action', 'queryMetrics')">getBuildMetrics / getWorkerMetrics</button>
      <button type="button" @click="emit('action', 'reload')">重建数据</button>
    </fieldset>
  </div>
</template>

<style scoped>
.control-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

fieldset {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 8px 10px 10px;
}

legend {
  padding: 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 4px 10px 4px 0;
  font-size: 13px;
}

select,
input[type='number'] {
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 2px 6px;
  background: var(--vp-c-bg);
  color: inherit;
}

button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 3px 8px;
  margin: 0 6px 6px 0;
  font-size: 12px;
  background: var(--vp-c-bg);
  cursor: pointer;
}

button.active {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.hint {
  font-size: 12px;
  color: var(--vp-c-text-3);
  margin-top: 4px;
}
</style>
