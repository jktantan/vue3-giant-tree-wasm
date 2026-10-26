# 虚拟滚动与可见性

## 这一页讲什么

组件只把**可视区域内的行**渲染进 DOM。可见集合由两件事共同决定：

1. **结构上可见** —— 节点的所有祖先都没有折叠。`assembly/tree-visibility.ts` 用单遍遍历 + 一个栈跟踪
   「折叠祖先的 `rightNode`」来重建整棵树的 `shown` 标志，不需要逐节点向上回溯；
   清空搜索后也是用同一条路径恢复可见性，避免搜索期间被污染的 `shown` 残留。
2. **几何上在视口里** —— 用容器的 `scrollTop` 和高度切出 `[start, end)` 这一段行。

MPTT 让这两步都很廉价：

| 操作 | 复杂度 |
| --- | --- |
| 子树判定（某节点是否在某子树内） | O(1) —— 比较 `leftNode` / `rightNode` 区间 |
| 视口切片（取当前要渲染的行） | O(k)，k = 视口内行数 |
| 展开 / 折叠一个节点 | O(subtree + log N) |

## 滚动的稳定性与开销

滚动本身由浏览器完成，组件只负责「换掉视口里那批行」。这条边界上有三件事决定手感：

- **行块位置只跟着它自己那批行走**。视口是按某个 `scrollTop` 请求的，行却要等一次 Worker
  往返才能回来；如果位置用「最新的」`scrollTop` 算，迟到的回包就会把整块行先推下去、等行
  到了再弹回来 —— 每个行边界抖一次，也就是快速甩动时看到的滚动抖动。所以位置取自**回包里
  携带的行下标**，任何延迟都只是让窗口暂时落后，不会让已经渲染的行移动。
- **视口上下各多渲染 4 行**。窗口落后时，这点余量保证落差落在视口之外，而不是在边缘露出
  空白。
- **只有真的变了的行才重渲染**。未变化的行沿用同一个行对象，宿主插槽也以函数 prop 传入而
  不是转发，行 vnode 因此可以按 props 跳过 —— 一次滚动只新建滚入的那几行，而不是整屏。

## 参数

| prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `height` | `string` | `'100%'` | 容器高度。父容器需要能给出确定高度，否则虚拟滚动没有可切分的窗口 |
| `width` | `string` | `'100%'` | 容器宽度 |
| `lineHeight` | `number` | —（`size` 预设，默认 26） | 行高（像素）。虚拟滚动按它换算可见区间；显式传入时优先于 `size` |
| `fontSize` | `string` | —（`size` 预设，默认 14px） | 行内字号；也可由 `--giant-tree-font-size` 覆盖 |

## 展开 / 收起与动画

- `expandAll()` / `collapseAll()` 作用于**当前视图**：普通树操作完整树，搜索视图只操作当前搜索结果，
  且不会改动主树的展开状态。
- 展开或收起时，组件只为**当前视口内已有的分支行**创建一层短暂过渡（约 220ms），
  不会为了动画把整棵子树加进 DOM。未变化的行不会被重新挂载。
- 过渡期间滚动会短暂冻结，避免动画进行到一半被换行打断。
- 系统「减少动态效果」（`prefers-reduced-motion`）开启时，动画自动降级为瞬时。

## 用法

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const selected = ref([])
</script>

<template>
  <div style="height: 600px">
    <button @click="treeRef?.expandAll()">全部展开</button>
    <button @click="treeRef?.collapseAll()">全部收起</button>
    <VueGiantTree ref="treeRef" :tree="rows" root="root" v-model="selected" />
  </div>
</template>
```

## 动手试试

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="virtual-scroll" />

试一下：把「数据规模」切到 `10k`，点「全部展开」，再滚动列表 ——
行数是几千行，但 DOM 里的行数始终只和视口高度有关。
