# Tree building and data format

## What this page covers

Input is an **adjacency list**: each row only needs `id` / `name` / `parentId`. You never have to
supply MPTT boundaries — `assembly/tree-builder.ts` does the following inside WASM:

1. Streams the JSON row by row — ordinary fields take a zero-allocation fast path, and escape
   decoding only runs when a backslash is actually present;
2. Groups nodes by `parentId`;
3. Recomputes MPTT's `leftNode` / `rightNode` in a **single depth-first pass**, so every subtree
   occupies one contiguous range of numbers.

> **Why MPTT is always rebuilt**: whenever the input differs from last time, any `leftNode` /
> `rightNode` shipped with it may already be stale. Subtree checks against stale boundaries fail
> silently ("it is inside the subtree but not found"). The component therefore ignores boundary
> fields in the input and always recomputes them from `parentId`. `leftNodeField` /
> `rightNodeField` only take part in detecting the input format.

## Parameters

| prop | Type | Default | Description |
| --- | --- | --- | --- |
| `tree` | `TreeInputItem[]` | `[]` | Adjacency-list data. Fields other than `id`/`name`/`parentId` are copied into `extendData` |
| `root` | `string` | `''` | Root identifier; top-level nodes' `parentId` must equal it |
| `fieldKeys` | `TreeFieldKeys` | `{}` | Custom field-name mapping, see below |
| `preorderedInput` | `boolean` | `false` | Set `true` when the input is already in strict depth-first preorder |
| `chunkedBuild` | `boolean` | `false` | Writes nodes to WASM in batches, reducing first-frame blocking on large input |
| `buildBatchSize` | `number` | `2000` | Nodes per batch (used when `chunkedBuild` is on) |

### Field-key mapping

```ts
interface TreeFieldKeys {
  idField?: string // default 'id'
  nameField?: string // default 'name'
  parentIdField?: string // default 'parentId'
  leftNodeField?: string // default 'leftNode' (format detection only)
  rightNodeField?: string // default 'rightNode' (format detection only)
}
```

Two behaviours worth knowing:

- `chunkedBuild` only takes effect when `outputIdOnly` is `true` **and** no `filterFn` is set —
  the only two cases where the component does not need the full raw rows.
- If `preorderedInput` is on but the data does not match that order, the component falls back to
  the general build instead of producing a wrong tree.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const selected = ref([])
const rows = [
  { id: '1', name: 'Root', parentId: 'root' },
  { id: '2', name: 'Child A', parentId: '1' },
  { id: '3', name: 'Child B', parentId: '1' },
]
</script>

<template>
  <div style="height: 400px">
    <VueGiantTree :tree="rows" root="root" v-model="selected" />
  </div>
</template>
```

When your fields are not named `id` / `name` / `parentId`:

```vue
<VueGiantTree
  :tree="rows"
  root="root"
  :field-keys="{ idField: 'key', nameField: 'label', parentIdField: 'parent' }"
  v-model="selected"
/>
```

## Try it

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="tree-building" />

Switch "Data size" to `10k` and the component rebuilds the whole MPTT the same way — watch
`getTreeSize()` and how long the first frame takes.
