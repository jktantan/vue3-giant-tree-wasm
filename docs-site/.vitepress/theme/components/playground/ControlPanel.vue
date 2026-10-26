<script setup lang="ts">
import type {
  ApiAction,
  ComponentSize,
  PlaygroundSettings,
  ThemeMode,
} from './settings'
import type { TreePreset } from '../treeData'
import { useMessages } from '../i18n'

const props = defineProps<{ settings: PlaygroundSettings }>()
const emit = defineEmits<{ action: [ApiAction] }>()

/** 直接引用父组件的 reactive 对象，控件改动即写回。 */
const settings = props.settings
const t = useMessages()

const sizes: Array<{ value: TreePreset; heavy?: boolean }> = [
  { value: 'small' },
  { value: 'medium' },
  { value: '10k' },
  { value: '100k', heavy: true },
  { value: '1m', heavy: true },
]

const selectTypes = ['CHECKBOX', 'RADIO', 'SELECT'] as const
const outputModes = ['All', 'RootOnly', 'LeafOnly', 'Custom'] as const
const lineStyles = ['solid', 'dashed', 'dotted'] as const
const iconModes = ['off', 'default', 'business', 'single', 'partial'] as const
const iconLabels = () => ({
  off: t.iconOff,
  default: t.iconBuiltin,
  business: t.iconBusiness,
  single: t.iconSingle,
  partial: t.iconPartial,
})

/** 高度档位：`fill` 表示填满右栏剩余空间，其余是显式 CSS 长度。 */
const heights = [
  { value: 'fill', label: t.heightFill },
  { value: '240px' },
  { value: '360px' },
  { value: '520px' },
  { value: '720px' },
]
const fonts = ['12px', '14px', '16px', '18px']
const lineColors = ['#d0d4dc', '#9ca3af', '#3b82f6', '#ef4444', '#10b981']
const themes: ThemeMode[] = ['inherit', 'light', 'dark']
const componentSizes: ComponentSize[] = ['small', 'default', 'large']
const primaryColors = [
  '#409eff',
  '#7c3aed',
  '#16a34a',
  '#f97316',
  '#ef4444',
  '#06b6d4',
]
const onPrimaryColorInput = (event: Event) => {
  settings.primaryColor = (event.target as HTMLInputElement).value
}

/**
 * 组件尺寸与字体/行高是两套 prop：`size` 只改 CSS 字号和（在未显式传
 * `lineHeight` 时）行高。演示场始终把滑块值传给组件，所以这里同步滑块，
 * 让切换尺寸能直接看到完整效果。
 */
const sizePresets: Record<
  ComponentSize,
  { fontSize: string; lineHeight: number }
> = {
  small: { fontSize: '12px', lineHeight: 24 },
  default: { fontSize: '14px', lineHeight: 26 },
  large: { fontSize: '16px', lineHeight: 32 },
}
const applyComponentSize = (size: ComponentSize) => {
  settings.componentSize = size
  settings.fontSize = sizePresets[size].fontSize
  settings.lineHeight = sizePresets[size].lineHeight
}
const onComponentSizeChange = (event: Event) =>
  applyComponentSize((event.target as HTMLSelectElement).value as ComponentSize)

const send = (action: ApiAction) => emit('action', action)
</script>

<template>
  <div class="control-panel">
    <section class="group">
      <h4 class="group__title">{{ t.sizeLabel }}</h4>
      <div class="segmented">
        <button
          v-for="item in sizes"
          :key="item.value"
          type="button"
          :class="{ active: settings.size === item.value }"
          @click="settings.size = item.value"
        >
          {{ t.sizeLabels[item.value] }}
          <span v-if="item.heavy" class="tag">{{ t.sizeHeavy }}</span>
        </button>
      </div>
      <p class="hint">{{ t.sizeHint }}</p>
      <label class="check" title="disabled">
        <input v-model="settings.enableDisabled" type="checkbox" />
        <span>{{ t.enableDisabled }}</span>
      </label>
    </section>

    <section class="group">
      <h4 class="group__title">{{ t.layout }}</h4>
      <div class="fields">
        <label class="field">
          <span>{{ t.height }}</span>
          <select v-model="settings.height">
            <option v-for="h in heights" :key="h.value" :value="h.value">
              {{ h.label ?? h.value }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>{{ t.lineHeight }}</span>
          <input
            v-model.number="settings.lineHeight"
            type="number"
            min="18"
            max="60"
          />
        </label>
        <label class="field">
          <span>{{ t.fontSize }}</span>
          <select v-model="settings.fontSize">
            <option v-for="f in fonts" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t.theme }}</span>
          <select v-model="settings.theme">
            <option v-for="mode in themes" :key="mode" :value="mode">
              {{ t.themeLabels[mode] }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>{{ t.componentSize }}</span>
          <select
            :value="settings.componentSize"
            @change="onComponentSizeChange"
          >
            <option v-for="size in componentSizes" :key="size" :value="size">
              {{ t.componentSizeLabels[size] }}
            </option>
          </select>
        </label>
      </div>
      <div class="swatches">
        <button
          type="button"
          class="swatch swatch--default"
          :class="{ active: settings.primaryColor === '' }"
          @click="settings.primaryColor = ''"
        >
          {{ t.primaryColorDefault }}
        </button>
        <button
          v-for="color in primaryColors"
          :key="color"
          type="button"
          class="swatch"
          :class="{ active: settings.primaryColor === color }"
          :style="{ backgroundColor: color }"
          :title="color"
          :aria-label="color"
          @click="settings.primaryColor = color"
        ></button>
        <label class="color-input" :title="t.primaryColorCustom">
          <input
            type="color"
            :value="settings.primaryColor || '#409eff'"
            @input="onPrimaryColorInput"
          />
          <span>{{ t.primaryColorCustom }}</span>
        </label>
      </div>
    </section>

    <section class="group">
      <h4 class="group__title">{{ t.selectAndOutput }}</h4>
      <div class="segmented">
        <button
          v-for="mode in selectTypes"
          :key="mode"
          type="button"
          :title="`selectType: ${mode}`"
          :class="{ active: settings.selectType === mode }"
          @click="settings.selectType = mode"
        >
          {{ t.selectTypeLabels[mode] }}
        </button>
      </div>
      <label class="check" title="outputIdOnly">
        <input v-model="settings.outputIdOnly" type="checkbox" />
        <span>{{ t.outputIdOnly }}</span>
      </label>
      <div v-if="settings.selectType === 'CHECKBOX'" class="fields">
        <label class="field" title="checkedOutputMode">
          <span>{{ t.checkedOutputMode }}</span>
          <select v-model="settings.checkedOutputMode">
            <option v-for="m in outputModes" :key="m" :value="m">
              {{ t.outputModeLabels[m] }}
            </option>
          </select>
        </label>
      </div>
      <label class="check" title="filterFn">
        <input v-model="settings.enableFilterFn" type="checkbox" />
        <span>{{ t.filterFn }}</span>
      </label>
      <div v-if="settings.enableFilterFn" class="segmented">
        <button
          v-for="c in ['A', 'B'] as const"
          :key="c"
          type="button"
          :class="{ active: settings.filterCategory === c }"
          @click="settings.filterCategory = c"
        >
          category={{ c }}
        </button>
      </div>
    </section>

    <section class="group">
      <h4 class="group__title">{{ t.rowRendering }}</h4>
      <label class="check" title="showLine">
        <input v-model="settings.showLine" type="checkbox" />
        <span>{{ t.showLine }}</span>
      </label>
      <div v-if="settings.showLine" class="fields nested">
        <div class="segmented">
          <button
            v-for="style in lineStyles"
            :key="style"
            type="button"
            :title="`showLine.style: ${style}`"
            :class="{ active: settings.showLineStyle === style }"
            @click="settings.showLineStyle = style"
          >
            {{ t.lineStyleLabels[style] }}
          </button>
        </div>
        <label class="field" title="showLine.color">
          <span>{{ t.lineColor }}</span>
          <select v-model="settings.showLineColor">
            <option v-for="c in lineColors" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="field" title="showLine.width">
          <span>{{ t.lineWidth }}</span>
          <input
            v-model.number="settings.showLineWidth"
            type="number"
            min="1"
            max="4"
          />
        </label>
      </div>
      <div class="fields">
        <label class="field" title="nodeIcon">
          <span>{{ t.nodeIcon }}</span>
          <select v-model="settings.nodeIcon">
            <option v-for="m in iconModes" :key="m" :value="m">
              {{ iconLabels()[m] }}
            </option>
          </select>
        </label>
      </div>
      <label class="check">
        <input v-model="settings.darkIconBg" type="checkbox" />
        <span>{{ t.iconDarkBg }}</span>
      </label>
      <label class="check" title="leftNode / rightNode">
        <input v-model="settings.mptt" type="checkbox" />
        <span>{{ t.mptt }}</span>
      </label>
      <label class="check" title="#node">
        <input v-model="settings.useNodeSlot" type="checkbox" />
        <span>{{ t.slotNode }}</span>
      </label>
      <label class="check" title="#actions">
        <input v-model="settings.useActionsSlot" type="checkbox" />
        <span>{{ t.slotActions }}</span>
      </label>
    </section>

    <section class="group">
      <h4 class="group__title">{{ t.searchGroup }}</h4>
      <div class="inline">
        <input
          v-model="settings.keyword"
          type="text"
          class="grow"
          :placeholder="t.keywordPlaceholder"
          @keyup.enter="send('search')"
        />
        <button type="button" class="primary" @click="send('search')">
          {{ t.search }}
        </button>
        <button type="button" @click="send('clearSearch')">
          {{ t.clear }}
        </button>
      </div>
      <label class="check" title="searchHighlight">
        <input v-model="settings.searchHighlight" type="checkbox" />
        <span>{{ t.searchHighlight }}</span>
      </label>
      <div class="segmented">
        <button
          type="button"
          title="switchDisplay(TREE)"
          @click="send('switchDisplayTree')"
        >
          {{ t.treeView }}
        </button>
        <button
          type="button"
          title="switchDisplay(SEARCH)"
          @click="send('switchDisplaySearch')"
        >
          {{ t.searchView }}
        </button>
      </div>
    </section>

    <section class="group">
      <h4 class="group__title">{{ t.checkedIdsGroup }}</h4>
      <div class="inline">
        <input
          v-model="settings.checkedIdsInput"
          type="text"
          class="grow"
          :placeholder="t.checkedIdsPlaceholder"
          @keyup.enter="send('setCheckedFromInput')"
        />
        <button
          type="button"
          class="primary"
          @click="send('setCheckedFromInput')"
        >
          {{ t.apply }}
        </button>
        <button type="button" @click="send('setCheckedRandom')">
          {{ t.random }}
        </button>
      </div>
    </section>

    <section class="group">
      <h4 class="group__title">{{ t.buildAndWorker }}</h4>
      <label class="check" title="workerMode">
        <input v-model="settings.workerMode" type="checkbox" />
        <span>{{ t.workerMode }}</span>
      </label>
      <label class="check" title="chunkedBuild">
        <input v-model="settings.chunkedBuild" type="checkbox" />
        <span>{{ t.chunkedBuild }}</span>
      </label>
      <label class="check" title="preorderedInput">
        <input v-model="settings.preorderedInput" type="checkbox" />
        <span>{{ t.preorderedInput }}</span>
      </label>
      <div class="fields">
        <label class="field" title="buildBatchSize">
          <span>{{ t.buildBatchSize }}</span>
          <input
            v-model.number="settings.buildBatchSize"
            type="number"
            min="100"
            step="100"
          />
        </label>
        <label class="field" title="fieldKeys">
          <span>{{ t.fieldKeys }}</span>
          <select v-model="settings.fieldKeysMode">
            <option value="default">{{ t.fieldKeysDefault }}</option>
            <option value="custom">{{ t.fieldKeysCustom }}</option>
          </select>
        </label>
      </div>
    </section>

    <section class="group">
      <h4 class="group__title">{{ t.instanceMethods }}</h4>
      <div class="actions">
        <button type="button" title="expandAll()" @click="send('expandAll')">
          {{ t.expandAll }}
        </button>
        <button
          type="button"
          title="collapseAll()"
          @click="send('collapseAll')"
        >
          {{ t.collapseAll }}
        </button>
        <button
          type="button"
          title="clearAllChecked()"
          @click="send('clearAllChecked')"
        >
          {{ t.clearChecked }}
        </button>
        <button
          type="button"
          title="refreshCheckedResult()"
          @click="send('refreshCheckedResult')"
        >
          {{ t.methodRefresh }}
        </button>
        <button
          type="button"
          title="updateNode(id, patch)"
          @click="send('updateFirst')"
        >
          {{ t.methodUpdate }}
        </button>
        <button type="button" title="addNode(node)" @click="send('addChild')">
          {{ t.methodAdd }}
        </button>
        <button
          type="button"
          title="removeNode(id)"
          @click="send('removeLast')"
        >
          {{ t.methodRemove }}
        </button>
        <button
          type="button"
          title="getBuildMetrics() / getWorkerMetrics()"
          @click="send('queryMetrics')"
        >
          {{ t.methodMetrics }}
        </button>
        <button type="button" class="primary" @click="send('reload')">
          {{ t.reload }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.control-panel {
  display: grid;
  gap: 12px;
}

.group {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 12px 14px 14px;
  background: var(--vp-c-bg-soft);
}

.group__title {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}

.segmented button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 13px;
  line-height: 1.4;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.segmented button:hover {
  border-color: var(--vp-c-brand-1);
}

.segmented button.active {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

.segmented button .tag {
  margin-left: 5px;
  font-size: 10px;
  opacity: 0.75;
}

.fields {
  display: grid;
  gap: 8px;
  margin-top: 6px;
}

.fields.nested {
  margin: 6px 0 8px;
  padding-left: 10px;
  border-left: 2px solid var(--vp-c-divider);
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.field > span {
  flex: 1;
  min-width: 0;
}

.field select,
.field input {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 3px 8px;
  max-width: 168px;
  font-size: 13px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 7px 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.check input {
  flex: none;
  accent-color: var(--vp-c-brand-1);
}

.inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.inline input.grow {
  flex: 1;
  min-width: 120px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.inline button,
.actions button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;
}

.inline button:hover,
.actions button:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.inline button.primary,
.actions button.primary {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: transform 0.15s;
}

.swatch:hover {
  transform: scale(1.1);
}

.swatch.active {
  border-color: var(--vp-c-text-1);
  box-shadow: inset 0 0 0 2px var(--vp-c-bg);
}

.swatch--default {
  width: auto;
  padding: 0 9px;
  border-radius: 6px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.swatch--default.active {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.color-input {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.color-input input[type='color'] {
  width: 26px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}
</style>
