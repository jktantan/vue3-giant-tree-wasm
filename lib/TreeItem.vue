<script setup lang="ts">
import { SelectType, CheckType } from '../build/release'
import type { FilterFn, NodeIconResolver, TreeNodeData } from './types'
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  item: TreeNodeData
  fontSize: string
  selectType: SelectType
  filterFn?: FilterFn
  nodeIcon?: boolean | NodeIconResolver
  /** 连接线展示模式：true 时缩进格绘制分支线。 / Guide-line mode: draw branch lines in the indent cells. */
  showLine?: boolean
}>()

const emit = defineEmits([
  'collapse-click',
  'check-click',
  'item-click',
  'item-contextmenu',
])

/** RADIO 模式：filterFn 返回 false 则不显示 Radio 框（节点不可选） / RADIO mode: hide radio if filterFn returns false / RADIO: скрыть radio если filterFn возвращает false */
const showRadio = computed(() => {
  if (!props.filterFn) return true
  return props.filterFn(props.item.extendData || {})
})
const isBranch = computed(() => props.item.rightNode - props.item.leftNode > 1)

/** Resolve the optional presentation icon locally so virtual rows stay light. */
const nodeIconClass = computed<string | undefined>(() => {
  const setting = props.nodeIcon
  if (setting === false || setting === undefined) return undefined

  const icon = typeof setting === 'function' ? setting(props.item) : setting
  if (icon === false) return undefined
  if (icon === true) {
    if (!isBranch.value) return 'giant-tree__icon-node-leaf'
    return props.item.collapsed
      ? 'giant-tree__icon-node-collapsed'
      : 'giant-tree__icon-node-expanded'
  }
  if (typeof icon === 'string') return icon

  return !isBranch.value || props.item.collapsed
    ? icon.collapsed
    : (icon.expanded ?? icon.collapsed)
})
const collapsedClick = () => {
  emit('collapse-click', props.item.id, !props.item.collapsed)
}

/**
 * 连接线模式：为每个缩进格计算该画什么线。
 * deep=d 的行左侧有 d 个缩进格（列 0..d-1），每格是否画贯穿竖线由 guideMask 的对应位
 * 决定——用于把同列的箭头上下连起来；连向父节点的 ├/└ 折线画在标记列（箭头那一格，
 * 列 d），不在这里。关闭 showLine 时返回空数组，模板走轻量占位分支。
 *
 * Guide-line mode: per-indent-cell vertical spec. A row of deep=d has d indent
 * cells (columns 0..d-1); each draws a full-height vertical only when the
 * ancestor column continues (guideMask bit). The ├/└ connector is drawn in the
 * marker column (the arrow cell, column d) instead.
 */
const guideCells = computed(() => {
  const deep = props.item.deep
  if (!props.showLine || deep <= 0) return []
  const mask = props.item.guideMask ?? 0
  return Array.from({ length: deep }, (_, i) => ({
    key: i,
    vertical: ((mask >> i) & 1) === 1 ? 'full' : 'none',
  }))
})
/**
 * 标记列（列 deep，箭头/图标所在那一格）的竖线段形态。
 *
 * 该竖线段只用于**叶子**：分支行用箭头，不画竖线。形态由节点在兄弟中的位置决定，
 * 顶部/底部不要多画半段：
 * - 'none'（独子）→ 不画；'lower'（首子）→ 下半段；'upper'（末子）→ 上半段；
 * - 'full'（中间）→ 全高。
 * 连向父节点的横向折线（├/└ 的横线）只有叶子才画。
 */
const markerLine = computed(() => props.item.markerLine ?? 'none')
const showMarkerLine = computed(
  () => props.showLine && !isBranch.value && markerLine.value !== 'none'
)
const markerVerticalClass = computed(
  () => `giant-tree__guide--m-${markerLine.value}`
)

/**
 * 选中反馈动画开关：虚拟滚动滚动时会不断卸载/重建行元素，若动画挂在
 * 元素的进入上，新滚入视口的行会被误播动画。因此初始挂载不播，只有
 * 组件存活期间 checked 状态真正变化时（nextTick 后）才加上
 * giant-tree__animated 类，让 CSS 只对状态切换播动画。
 */
const checkAnimated = ref(false)
watch(
  () => props.item.checked,
  (_newVal, oldVal) => {
    if (oldVal === undefined) return // 初次挂载，不播
    checkAnimated.value = false
    nextTick(() => {
      checkAnimated.value = true
    })
  },
  { immediate: true }
)

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

/**
 * 行右键：仅转发节点与原生事件，不阻止浏览器原生菜单（由业务决定是否 preventDefault）。
 * Row context menu: forwards the node and the native event only; the browser menu is not
 * prevented — the consumer decides whether to call preventDefault().
 * Контекстное меню строки: передаёт только узел и исходное событие, не блокирует браузерное
 * меню — решение о preventDefault() принимает потребитель.
 */
const contextMenu = (event: MouseEvent) => {
  emit('item-contextmenu', props.item, event)
}
</script>

<template>
  <div
    class="tree-item"
    :style="{ fontSize: fontSize }"
    :class="{ selected: item.selected, disabled: item.disabled }"
    @click="itemClick"
    @contextmenu="contextMenu"
  >
    <template v-if="showLine">
      <div
        v-for="cell in guideCells"
        :key="cell.key"
        class="item-guide-cell"
        :style="{ width: fontSize }"
        aria-hidden="true"
      >
        <span
          class="giant-tree__guide"
          :class="`giant-tree__guide--v-${cell.vertical}`"
        />
      </div>
    </template>
    <template v-else>
      <div v-for="i in item.deep" :key="i" :style="{ width: fontSize }"></div>
    </template>
    <div
      v-if="isBranch"
      class="item-icon item-control"
      :style="{ width: fontSize }"
      role="button"
      tabindex="0"
      :aria-label="`${item.collapsed ? '展开' : '折叠'} ${item.name}`"
      @click.stop="collapsedClick"
      @keydown.enter.prevent="collapsedClick"
      @keydown.space.prevent="collapsedClick"
    >
      <!-- 分支行用箭头，不画连接线。 -->
      <div
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button"
        :class="
          item.collapsed
            ? 'giant-tree__icon-arrow-right'
            : 'giant-tree__icon-arrow-down'
        "
      />
    </div>
    <div v-else class="item-icon" :style="{ width: fontSize }">
      <!-- 叶子行：标记列按位置画竖线段（上半/下半/全高）加横向折线，构成 ├/└。 -->
      <span
        v-if="showMarkerLine"
        class="giant-tree__guide"
        :class="[markerVerticalClass, 'giant-tree__guide--h']"
        aria-hidden="true"
      />
    </div>
    <div
      v-if="selectType === SelectType.CHECKBOX"
      class="item-selection item-control"
      role="checkbox"
      :tabindex="item.disabled ? -1 : 0"
      :aria-checked="
        item.checked === CheckType.HALF_CHECKED
          ? 'mixed'
          : item.checked === CheckType.CHECKED
      "
      :aria-disabled="item.disabled || undefined"
      :aria-label="`选择 ${item.name}`"
      @click.stop="checkClick"
      @keydown.enter.prevent="checkClick"
      @keydown.space.prevent="checkClick"
    >
      <div
        v-if="item.checked === CheckType.UNCHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-check-unchecked"
        :class="{ 'giant-tree__animated': checkAnimated }"
      ></div>
      <div
        v-else-if="item.checked === CheckType.HALF_CHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-check-half checked"
        :class="{ 'giant-tree__animated': checkAnimated }"
      ></div>
      <div
        v-else-if="item.checked === CheckType.CHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-check-checked checked"
        :class="{ 'giant-tree__animated': checkAnimated }"
      ></div>
    </div>
    <div
      v-else-if="selectType === SelectType.RADIO && showRadio"
      class="item-selection item-control"
      role="radio"
      :tabindex="item.disabled ? -1 : 0"
      :aria-checked="item.checked === CheckType.CHECKED"
      :aria-disabled="item.disabled || undefined"
      :aria-label="`选择 ${item.name}`"
      @click.stop="checkClick"
      @keydown.enter.prevent="checkClick"
      @keydown.space.prevent="checkClick"
    >
      <div
        v-if="item.checked === CheckType.CHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-radio-checked checked"
        :class="{ 'giant-tree__animated': checkAnimated }"
      ></div>
      <div
        v-else-if="item.checked === CheckType.UNCHECKED"
        :style="{ width: fontSize, height: fontSize }"
        class="giant-tree__mask-button giant-tree__icon-radio-unchecked"
        :class="{ 'giant-tree__animated': checkAnimated }"
      ></div>
    </div>
    <div
      v-if="nodeIconClass"
      class="item-node-icon giant-tree__node-icon"
      :class="nodeIconClass"
      :style="{ width: fontSize, height: fontSize }"
      aria-hidden="true"
    ></div>
    <div class="item-text">
      <slot name="node" :node="item">
        <span>{{ item.name }}</span>
      </slot>
    </div>
    <div v-if="$slots.actions" class="item-actions" @click.stop>
      <slot name="actions" :node="item" />
    </div>
  </div>
</template>

<style scoped></style>
