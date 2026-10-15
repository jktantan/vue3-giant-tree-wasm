<script setup lang="ts">
import type { ApiAction, PlaygroundSettings } from './settings'
import type { TreePreset } from '../treeData'
import { useMessages } from '../i18n'

const props = defineProps<{ settings: PlaygroundSettings }>()
const emit = defineEmits<{ action: [ApiAction] }>()

/** 直接引用父组件的 reactive 对象，控件改动即写回。 */
const settings = props.settings
const t = useMessages()

const sizes: Array<{ value: TreePreset; label: string; heavy?: boolean }> = [
  { value: 'small', label: 'small' },
  { value: 'medium', label: 'medium' },
  { value: '10k', label: '10k' },
  { value: '100k', label: '100k', heavy: true },
  { value: '1m', label: '1m', heavy: true },
]

const heights = ['240px', '360px', '520px', '720px']
const fonts = ['12px', '14px', '16px', '18px']
const lineColors = ['#d0d4dc', '#9ca3af', '#3b82f6', '#ef4444', '#10b981']

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
          {{ item.label }}
          <span v-if="item.heavy" class="tag">{{ t.sizeHeavy }}</span>
        </button>
      </div>
      <p class="hint">{{ t.sizeHint }}</p>
      <label class="check">
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
            <option v-for="h in heights" :key="h" :value="h">{{ h }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t.lineHeight }}</span>
          <input v-model.number="settings.lineHeight" type="number" min="18" max="60" />
        </label>
        <label class="field">
          <span>{{ t.fontSize }}</span>
          <select v-model="settings.fontSize">
            <option v-for="f in fonts" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
      </div>
    </section>

    <section class="group">
      <h4 class="group__title">{{ t.selectAndOutput }}</h4>
      <div class="segmented">
        <button
          v-for="mode in (['CHECKBOX', 'RADIO', 'SELECT'] as const)"
          :key="mode"
          type="button"
          :class="{ active: settings.selectType === mode }"
          @click="settings.selectType = mode"
        >
          {{ mode }}
        </button>
      </div>
      <label class="check">
        <input v-model="settings.outputIdOnly" type="checkbox" />
        <span>{{ t.outputIdOnly }}</span>
      </label>
      <div v-if="settings.selectType === 'CHECKBOX'" class="fields">
        <label class="field">
          <span>{{ t.checkedOutputMode }}</span>
          <select v-model="settings.checkedOutputMode">
            <option v-for="m in (['All', 'RootOnly', 'LeafOnly', 'Custom'] as const)" :key="m" :value="m">
              {{ m }}
            </option>
          </select>
        </label>
      </div>
      <label class="check">
        <input v-model="settings.enableFilterFn" type="checkbox" />
        <span>{{ t.filterFn }}</span>
      </label>
      <div v-if="settings.enableFilterFn" class="segmented">
        <button
          v-for="c in (['A', 'B'] as const)"
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
      <label class="check">
        <input v-model="settings.showLine" type="checkbox" />
        <span>{{ t.showLine }}</span>
      </label>
      <div v-if="settings.showLine" class="fields nested">
        <div class="segmented">
          <button
            v-for="style in (['solid', 'dashed', 'dotted'] as const)"
            :key="style"
            type="button"
            :class="{ active: settings.showLineStyle === style }"
            @click="settings.showLineStyle = style"
          >
            {{ style }}
          </button>
        </div>
        <label class="field">
          <span>{{ t.lineColor }}</span>
          <select v-model="settings.showLineColor">
            <option v-for="c in lineColors" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t.lineWidth }}</span>
          <input v-model.number="settings.showLineWidth" type="number" min="1" max="4" />
        </label>
      </div>
      <div class="fields">
        <label class="field">
          <span>{{ t.nodeIcon }}</span>
          <select v-model="settings.nodeIcon">
            <option v-for="m in (['off', 'default', 'business', 'single', 'partial'] as const)" :key="m" :value="m">
              {{
                m === 'off'
                  ? t.iconOff
                  : m === 'default'
                    ? t.iconBuiltin
                    : m === 'business'
                      ? t.iconBusiness
                      : m === 'single'
                        ? t.iconSingle
                        : t.iconPartial
              }}
            </option>
          </select>
        </label>
      </div>
      <label class="check">
        <input v-model="settings.darkIconBg" type="checkbox" />
        <span>{{ t.iconDarkBg }}</span>
      </label>
      <label class="check">
        <input v-model="settings.mptt" type="checkbox" />
        <span>{{ t.mptt }}</span>
      </label>
      <label class="check">
        <input v-model="settings.useNodeSlot" type="checkbox" />
        <span>{{ t.slotNode }}</span>
      </label>
      <label class="check">
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
        <button type="button" class="primary" @click="send('search')">{{ t.search }}</button>
        <button type="button" @click="send('clearSearch')">{{ t.clear }}</button>
      </div>
      <div class="segmented">
        <button type="button" @click="send('switchDisplayTree')">{{ t.treeView }}</button>
        <button type="button" @click="send('switchDisplaySearch')">{{ t.searchView }}</button>
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
        <button type="button" class="primary" @click="send('setCheckedFromInput')">{{ t.apply }}</button>
        <button type="button" @click="send('setCheckedRandom')">{{ t.random }}</button>
      </div>
    </section>

    <section class="group">
      <h4 class="group__title">{{ t.buildAndWorker }}</h4>
      <label class="check">
        <input v-model="settings.workerMode" type="checkbox" />
        <span>{{ t.workerMode }}</span>
      </label>
      <label class="check">
        <input v-model="settings.chunkedBuild" type="checkbox" />
        <span>{{ t.chunkedBuild }}</span>
      </label>
      <label class="check">
        <input v-model="settings.preorderedInput" type="checkbox" />
        <span>{{ t.preorderedInput }}</span>
      </label>
      <div class="fields">
        <label class="field">
          <span>{{ t.buildBatchSize }}</span>
          <input v-model.number="settings.buildBatchSize" type="number" min="100" step="100" />
        </label>
        <label class="field">
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
        <button type="button" @click="send('expandAll')">expandAll</button>
        <button type="button" @click="send('collapseAll')">collapseAll</button>
        <button type="button" @click="send('clearAllChecked')">clearAllChecked</button>
        <button type="button" @click="send('refreshCheckedResult')">refreshCheckedResult</button>
        <button type="button" @click="send('updateFirst')">updateNode</button>
        <button type="button" @click="send('addChild')">addNode</button>
        <button type="button" @click="send('removeLast')">removeNode</button>
        <button type="button" @click="send('queryMetrics')">getBuildMetrics / getWorkerMetrics</button>
        <button type="button" class="primary" @click="send('reload')">{{ t.reload }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.control-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
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
</style>
