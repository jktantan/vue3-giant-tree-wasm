<script setup lang="ts">
import { CheckType, SelectType } from './giant-tree'
import type { MpttNode } from './giant-tree'
import type { FilterFn } from './types'
import { computed } from 'vue'

const props = defineProps<{
  item: MpttNode
  fontSize: string
  selectType: SelectType
  filterFn?: FilterFn
}>()

const emit = defineEmits(['collapse-click', 'check-click', 'item-click'])

const showRadio = computed(() => {
  if (!props.filterFn) return true
  return props.filterFn(props.item.extendData || {})
})

const collapsedClick = () => {
  emit('collapse-click', props.item.id, !props.item.collapsed)
}

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
