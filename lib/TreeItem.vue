<script setup lang="ts">
import { SelectType, CheckType } from '../build/release'
import type {
  FilterFn,
  NodeIconResolver,
  SearchHighlightPart,
  ShowLineStyle,
  TreeNodeData,
} from './types'
import {
  DEFAULT_SHOW_LINE_COLOR,
  DEFAULT_SHOW_LINE_STYLE,
  DEFAULT_SHOW_LINE_WIDTH,
} from './guide'
import { computed, nextTick, ref, watch, type VNodeChild } from 'vue'
import { SlotRenderer } from './SlotRenderer'

const props = defineProps<{
  item: TreeNodeData
  /**
   * 行内字号兜底，仅用于脱离 VueGiantTree 单独挂载 TreeItem 的场景。
   * 正常使用时由 VueGiantTree 根节点的 `--giant-tree-font-size` 等变量驱动，
   * 这样宿主可以用 CSS 覆盖字号/图标/缩进；结构尺寸规则在
   * `assets/style/style.scss` 里以 `:where()` 低特异性提供。
   *
   * Inline font-size fallback for mounting TreeItem standalone. Within
   * VueGiantTree the row inherits `--giant-tree-font-size` and friends from the
   * root element, so hosts can override them with CSS; structural sizing lives
   * in `assets/style/style.scss` behind `:where()` to keep specificity low.
   */
  fontSize?: string
  selectType: SelectType
  filterFn?: FilterFn
  nodeIcon?: boolean | NodeIconResolver
  /**
   * 是否启用连接线展示。模板据此选择「轻量占位 v-for」与「引导格渲染」分支。
   * / Whether guide-line mode is enabled; the template picks between placeholder
   * cells and rendered guide cells.
   */
  showLineEnabled?: boolean
  /** 连接线形态，见 ShowLineStyle；缺省 'solid'。 / Guide-line shape, see ShowLineStyle. Defaults to 'solid'. */
  showLineStyle?: ShowLineStyle
  /** 连接线颜色。 / Guide-line color. */
  showLineColor?: string
  /** 连接线粗细（px）。 / Guide-line width in px. */
  showLineWidth?: number
  /**
   * 模糊搜索当前生效的关键词。空字符串表示不启用高亮；命中时会按关键词
   * 切片，只标记关键词本身，祖先行等未命中的文本保持原样。
   * The keyword applied by the current fuzzy search. Empty disables it; matches
   * are split so only the keyword itself is marked, while non-matching text
   * (for example ancestors completing the path) stays unstyled.
   */
  highlightKeyword?: string
  /**
   * 宿主的 `#node` 插槽函数，作为 **prop** 传入（而不是 `<template #node>` 转发）。
   *
   * 插槽转发会让每个行 vnode 带上 `DYNAMIC_SLOTS` 标记，Vue 因此无法跳过未变化
   * 的行 —— 每次视口快照都会把整屏行重渲染一遍。用函数 prop 传进来后，行只按
   * props 比较；`item` 与这些函数都不变时整行被跳过。函数引用本身也是「宿主插槽
   * 内容变了」的信号：宿主每渲染一次，插槽函数就是新引用，行随之更新。
   *
   * The host's `#node` slot function, passed as a **prop** rather than forwarded
   * through `<template #node>`. Forwarding marks every row vnode with
   * `DYNAMIC_SLOTS`, which prevents Vue from skipping unchanged rows and makes
   * every viewport snapshot re-render the whole screen. As a prop, rows are
   * compared by props only, and the function identity doubles as the "host slot
   * content changed" signal.
   */
  renderNode?: (slotProps: {
    node: TreeNodeData
    highlights: SearchHighlightPart[] | null
  }) => VNodeChild
  /** 同 `renderNode`，对应宿主 `#actions` 插槽。 / Same as `renderNode`, for `#actions`. */
  renderActions?: (slotProps: { node: TreeNodeData }) => VNodeChild
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
 * 按当前关键词把节点名切成「普通文本 / 命中片段」。
 *
 * 匹配语义与 WASM 搜索保持一致（区分大小写的 `indexOf`），而且标记的是
 * 用户输入的关键词原文，不是整个节点名；关键词为空或名称未命中时返回
 * `null`，模板走无高亮的轻量分支。
 *
 * Split the node name into plain / matched runs for the active keyword. Uses the
 * same case-sensitive `indexOf` semantics as the WASM search, and marks only the
 * typed keyword rather than the whole name. Returns `null` when there is nothing
 * to highlight, so the template keeps its lightweight path.
 */
const highlightParts = computed<SearchHighlightPart[] | null>(() => {
  const keyword = props.highlightKeyword
  if (!keyword) return null
  const name = props.item.name
  let from = 0
  let at = name.indexOf(keyword)
  if (at < 0) return null
  const parts: SearchHighlightPart[] = []
  while (at >= 0) {
    if (at > from) parts.push({ text: name.slice(from, at), hit: false })
    parts.push({ text: keyword, hit: true })
    from = at + keyword.length
    at = name.indexOf(keyword, from)
  }
  if (from < name.length) parts.push({ text: name.slice(from), hit: false })
  return parts
})

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
  if (!props.showLineEnabled || deep <= 0) return []
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
  () => props.showLineEnabled && !isBranch.value && markerLine.value !== 'none'
)
const markerVerticalClass = computed(
  () => `giant-tree__guide--m-${markerLine.value}`
)

/** 引导元素形参：style/color/width 由 props 决定，未启用时不写入（关闭时模板走轻量分支）。 */
const showLineStyle = computed(
  () => props.showLineStyle ?? DEFAULT_SHOW_LINE_STYLE
)
const showLineColor = computed(
  () => props.showLineColor ?? DEFAULT_SHOW_LINE_COLOR
)
const showLineWidth = computed(
  () => props.showLineWidth ?? DEFAULT_SHOW_LINE_WIDTH
)
/**
 * 写到行根节点的 CSS 变量集合。TreeItem 的根元素承担样式域，因此只在这里拼一次，
 * 模板只声明 `:style="guideStyle"`。`none` 不写；`line`/`dot` 共用 `color` 与 `width`，
 * 形态差异由 SCSS 中的 `.giant-tree__guide--dot` 消费。
 *
 * CSS variable set written to the row root. Only enabled rows pay this cost; the
 * template takes the lightweight path when disabled. `line` and `dot` share `color`
 * and `width`; the shape difference is consumed by `.giant-tree__guide--dot` in SCSS.
 */
const guideStyle = computed(() =>
  props.showLineEnabled
    ? ({
        '--giant-tree-guide-style': showLineStyle.value,
        '--giant-tree-guide-color': showLineColor.value,
        '--giant-tree-guide-width':
          typeof showLineWidth.value === 'number'
            ? `${showLineWidth.value}px`
            : '1px',
      } as Record<string, string>)
    : null
)

/**
 * Row-level sizing variables. Indent cells, icons and checkboxes consume
 * `--giant-tree-row-size` / `--giant-tree-indent-size` / `--giant-tree-icon-size`
 * from CSS instead of binding a style object per cell, which matters for deep
 * rows where one render used to create dozens of temporary `{ width }` objects.
 *
 * When no fallback `fontSize` is supplied (the normal path through
 * VueGiantTree), the row inherits these variables from the root element, so a
 * host stylesheet can override font/icon/indent sizes without touching props.
 */
const rowStyle = computed(() =>
  props.fontSize
    ? ({
        fontSize: props.fontSize,
        '--giant-tree-font-size': props.fontSize,
        '--giant-tree-row-size': props.fontSize,
        '--giant-tree-indent-size': props.fontSize,
        '--giant-tree-icon-size': props.fontSize,
      } as Record<string, string>)
    : null
)

/**
 * 插槽函数 prop 的实参。用 computed 保持引用稳定：行被跳过时不会重建，
 * 宿主插槽一旦变化又会连同渲染函数一起换新。
 */
const nodeSlotProps = computed(() => ({
  node: props.item,
  highlights: highlightParts.value,
}))
const actionsSlotProps = computed(() => ({ node: props.item }))

/**
 * 选中反馈动画开关：虚拟滚动滚动时会不断卸载/重建行元素，若动画挂在
 * 元素的进入上，新滚入视口的行会被误播动画。因此初始挂载不播，只有
 * 组件存活期间 checked 状态真正变化时（nextTick 后）才加上
 * giant-tree__mask-button--animated 类，让 CSS 只对状态切换播动画。
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
    class="giant-tree__row"
    :style="[rowStyle, guideStyle]"
    :class="{
      'giant-tree__row--selected': item.selected,
      'giant-tree__row--disabled': item.disabled,
    }"
    @click="itemClick"
    @contextmenu="contextMenu"
  >
    <template v-if="showLineEnabled">
      <div
        v-for="cell in guideCells"
        :key="cell.key"
        class="giant-tree__guide-cell"
        aria-hidden="true"
      >
        <span
          class="giant-tree__guide"
          :class="`giant-tree__guide--v-${cell.vertical}`"
        />
      </div>
    </template>
    <template v-else>
      <div v-for="i in item.deep" :key="i" class="giant-tree__indent"></div>
    </template>
    <div
      v-if="isBranch"
      class="giant-tree__arrow-cell"
      role="button"
      tabindex="0"
      :aria-label="`${item.collapsed ? '展开' : '折叠'} ${item.name}`"
      @click.stop="collapsedClick"
      @keydown.enter.prevent="collapsedClick"
      @keydown.space.prevent="collapsedClick"
    >
      <!-- 分支行用箭头，不画连接线。 -->
      <div
        class="giant-tree__mask-button"
        :class="
          item.collapsed
            ? 'giant-tree__icon-arrow-right'
            : 'giant-tree__icon-arrow-down'
        "
      />
    </div>
    <div v-else class="giant-tree__arrow-cell">
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
      class="giant-tree__selection"
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
        class="giant-tree__mask-button giant-tree__icon-check-unchecked"
        :class="{ 'giant-tree__mask-button--animated': checkAnimated }"
      ></div>
      <div
        v-else-if="item.checked === CheckType.HALF_CHECKED"
        class="giant-tree__mask-button giant-tree__icon-check-half giant-tree__mask-button--checked"
        :class="{ 'giant-tree__mask-button--animated': checkAnimated }"
      ></div>
      <div
        v-else-if="item.checked === CheckType.CHECKED"
        class="giant-tree__mask-button giant-tree__icon-check-checked giant-tree__mask-button--checked"
        :class="{ 'giant-tree__mask-button--animated': checkAnimated }"
      ></div>
    </div>
    <div
      v-else-if="selectType === SelectType.RADIO && showRadio"
      class="giant-tree__selection"
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
        class="giant-tree__mask-button giant-tree__icon-radio-checked giant-tree__mask-button--checked"
        :class="{ 'giant-tree__mask-button--animated': checkAnimated }"
      ></div>
      <div
        v-else-if="item.checked === CheckType.UNCHECKED"
        class="giant-tree__mask-button giant-tree__icon-radio-unchecked"
        :class="{ 'giant-tree__mask-button--animated': checkAnimated }"
      ></div>
    </div>
    <div
      v-if="nodeIconClass"
      class="giant-tree__node-icon"
      :class="nodeIconClass"
      aria-hidden="true"
    ></div>
    <div class="giant-tree__text">
      <!-- 宿主的渲染函数 prop 优先；没有时退回 #node 插槽，再退回默认文本。 -->
      <slot-renderer
        v-if="renderNode"
        :render="renderNode"
        :slot-props="nodeSlotProps"
      />
      <slot v-else name="node" :node="item" :highlights="highlightParts">
        <span v-if="highlightParts === null">{{ item.name }}</span>
        <span v-else>
          <template v-for="(part, index) in highlightParts" :key="index">
            <mark v-if="part.hit" class="giant-tree__search-hit">{{
              part.text
            }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </span>
      </slot>
    </div>
    <div
      v-if="renderActions || $slots.actions"
      class="giant-tree__actions"
      @click.stop
    >
      <slot-renderer
        v-if="renderActions"
        :render="renderActions"
        :slot-props="actionsSlotProps"
      />
      <slot v-else name="actions" :node="item" />
    </div>
  </div>
</template>
