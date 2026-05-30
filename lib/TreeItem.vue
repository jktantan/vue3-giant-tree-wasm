<script setup lang="ts">
import { SelectType, CheckType } from '../build/release'
import type { FilterFn, TreeNodeData } from './types'
import { computed } from 'vue'

const props = defineProps<{
  item: TreeNodeData
  fontSize: string
  selectType: SelectType
  filterFn?: FilterFn
}>()

const emit = defineEmits(['collapse-click', 'check-click', 'item-click'])

/** RADIO 模式：filterFn 返回 false 则不显示 Radio 框（节点不可选） / RADIO mode: hide radio if filterFn returns false / RADIO: скрыть radio если filterFn возвращает false */
const showRadio = computed(() => {
  if (!props.filterFn) return true
  return props.filterFn(props.item.extendData || {})
})
const collapsedClick = () => {
  emit('collapse-click', props.item.id, !props.item.collapsed)
}

/** 复选框/单选框点击（toggle 逻辑在 WASM 侧） / Checkbox/radio click (toggle logic is in WASM) / Клик по чекбоксу/радио (логика переключения в WASM) */
const checkClick = () => {
  if (props.item.disabled) return
  emit(
    'check-click',
    props.item.id,
    props.item.checked === CheckType.CHECKED
      ? CheckType.UNCHECKED
      : CheckType.CHECKED
  )
}

/** 行点击（SELECT 模式下选中节点） / Row click (selects node in SELECT mode) / Клик по строке (выбирает узел в режиме SELECT) */
const itemClick = () => {
  if (props.item.disabled) return
  emit('item-click', props.item.id)
}
</script>

<template>
  <div
    class="tree-item"
    :style="{ fontSize: fontSize }"
    :class="{ selected: item.selected, disabled: item.disabled }"
  >
    <div v-for="i in item.deep" :style="{ width: fontSize }" :key="i"></div>
    <div class="item-icon" :style="{ width: fontSize }">
      <div
        :style="{ width: fontSize, height: fontSize }"
        v-if="item.rightNode - item.leftNode > 1 && item.collapsed"
        class="giant-tree__mask-button giant-tree__icon-arrow-right"
        @click="collapsedClick"
      />
      <div
        :style="{ width: fontSize, height: fontSize }"
        v-else-if="item.rightNode - item.leftNode > 1 && !item.collapsed"
        class="giant-tree__mask-button giant-tree__icon-arrow-down"
        @click="collapsedClick"
      />
    </div>
    <div v-if="selectType === SelectType.CHECKBOX" @click="checkClick">
      <div
        v-if="item.checked === CheckType.UNCHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-check-unchecked"
      ></div>
      <div
        v-else-if="item.checked === CheckType.HALF_CHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-check-half checked"
      ></div>
      <div
        v-else-if="item.checked === CheckType.CHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-check-checked checked"
      ></div>
    </div>
    <div
      v-else-if="selectType === SelectType.RADIO && showRadio"
      @click="checkClick"
    >
      <div
        v-if="item.checked === CheckType.CHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-radio-checked checked"
      ></div>
      <div
        v-else-if="item.checked === CheckType.UNCHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-radio-unchecked"
      ></div>
    </div>
    <div class="item-text" @click="itemClick">
      <slot name="node" :node="item">
        <span>{{ item.name }}</span>
      </slot>
    </div>
  </div>
</template>

<style scoped></style>
