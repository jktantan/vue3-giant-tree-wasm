# Virtual scrolling and visibility

## What this page covers

Only the rows **inside the viewport** are rendered to the DOM. Two things decide that set:

1. **Structurally visible** — none of the node's ancestors is collapsed. `assembly/tree-visibility.ts`
   rebuilds the whole tree's `shown` flags with a single pass plus a stack that tracks the
   `rightNode` of collapsed ancestors, instead of walking upwards per node. Clearing a search uses
   the same path, so `shown` pollution from searching does not linger.
2. **Geometrically in view** — the container's `scrollTop` and height slice out the `[start, end)` range.

MPTT makes both cheap:

| Operation | Complexity |
| --- | --- |
| Subtree check (is a node inside a subtree) | O(1) — compare the `leftNode` / `rightNode` range |
| Viewport slice (rows to render) | O(k), k = rows in viewport |
| Expanding / collapsing one node | O(subtree + log N) |

## Scroll stability and cost

The browser owns the scroll; the component only swaps the batch of rows inside the viewport.
Three things decide how that feels:

- **The row block moves only with the rows it carries.** The viewport is requested from one
  `scrollTop`, but the rows it describes arrive one Worker round trip later. Positioning the block
  from the *newest* `scrollTop` would push the whole block down on every late reply and snap it back
  once the rows arrive — one visible jump per row boundary, which is what shaking looks like on a
  fast fling. The offset therefore comes from the **row index carried by the reply**: a delayed
  reply only lets the window lag behind, it never moves rows that are already rendered.
- **Four extra rows are rendered beyond each edge.** While the window lags, that margin keeps the
  shortfall outside the viewport instead of exposing a blank strip.
- **Only rows that actually changed are re-rendered.** Unchanged rows keep the same row object, and
  host slots are passed as function props rather than forwarded, so row vnodes can be skipped by
  prop comparison: a scroll creates only the rows that scrolled in, not the whole screen.

## Parameters

| prop | Type | Default | Description |
| --- | --- | --- | --- |
| `height` | `string` | `'100%'` | Container height. The parent must give it a definite height, otherwise there is no window to slice |
| `width` | `string` | `'100%'` | Container width |
| `lineHeight` | `number` | — (`size` preset, 26) | Row height in pixels; virtual scrolling converts it into the visible range. Wins over `size` |
| `fontSize` | `string` | — (`size` preset, 14px) | Font size inside rows; also overridable via `--giant-tree-font-size` |

## Expand / collapse and animation

- `expandAll()` / `collapseAll()` apply to the **current view**: normally the full tree, and while
  searching only the current results — never changing the main tree's expansion state.
- Expanding or collapsing creates a short-lived transition (about 220ms) only for branch rows
  **already in the viewport**; the whole subtree is never added to the DOM for the animation, and
  unchanged rows are not remounted.
- Scrolling is briefly frozen during the transition so the animation cannot be cut in half.
- With `prefers-reduced-motion` enabled, the animation degrades to instantaneous.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const selected = ref([])
</script>

<template>
  <div style="height: 600px">
    <button @click="treeRef?.expandAll()">Expand all</button>
    <button @click="treeRef?.collapseAll()">Collapse all</button>
    <VueGiantTree ref="treeRef" :tree="rows" root="root" v-model="selected" />
  </div>
</template>
```

## Try it

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="virtual-scroll" />

Try it: switch "Data size" to `10k`, press "Expand all", then scroll. The tree holds thousands of
rows, but the number of DOM rows always depends only on the viewport height.
