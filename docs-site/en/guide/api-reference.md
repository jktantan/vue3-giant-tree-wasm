# API reference

These four tables mirror `lib/VueGiantTree.vue`'s `defineProps` / `defineExpose` / slots and
`defineEmits`; defaults come from `withDefaults`.

## Props

| prop | Type | Default | Description |
| --- | --- | --- | --- |
| `modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | — | The selection (v-model) |
| `tree` | `TreeInputItem[]` | `[]` | Tree data in adjacency-list form |
| `root` | `string` | `''` | Root identifier; top-level nodes' `parentId` must equal it |
| `width` | `string` | `'100%'` | Container width |
| `height` | `string` | `'100%'` | Container height |
| `lineHeight` | `number` | `26` | Row height in pixels |
| `fontSize` | `string` | `'14px'` | Font size |
| `selectType` | `SelectType` | `SelectType.CHECKBOX` | `CHECKBOX` / `RADIO` / `SELECT` |
| `fieldKeys` | `TreeFieldKeys` | `{}` | Field-name mapping for the input JSON |
| `outputIdOnly` | `boolean` | `true` | `true` gives IDs in v-model; `false` gives full nodes |
| `checkedOutputMode` | `CheckedOutputMode` | `CheckedOutputMode.All` | Output filter mode for CHECKBOX |
| `filterFn` | `FilterFn` | — | Custom filter (filters output in CHECKBOX+Custom; filters selectability in RADIO) |
| `nodeIcon` | `boolean \| NodeIconResolver` | `false` | Node icons: `true` for built-ins, or a per-node callback |
| `showLine` | `boolean \| ShowLineOptions` | `false` | Guide-line mode |
| `chunkedBuild` | `boolean` | `false` | Write WASM input in batches |
| `buildBatchSize` | `number` | `2000` | Nodes per batch |
| `workerMode` | `boolean` | `false` | Run tree algorithms in a Web Worker |
| `preorderedInput` | `boolean` | `false` | Skip generic grouping when input is already depth-first preorder |

## Methods

Call them through a component `ref`.

| Method | Description |
| --- | --- |
| `expandAll()` | Expands every expandable node in the current view |
| `collapseAll()` | Collapses every expandable node in the current view |
| `fuzzySearch(keyword)` | Debounced (300ms) fuzzy search; an empty string clears it |
| `fuzzySearchRaw(keyword)` | Immediate fuzzy search; an empty string clears it |
| `switchDisplay(displayType)` | Switches between the `TREE` and `SEARCH` views |
| `getTreeSize()` | Total node count |
| `getBuildReady()` | Whether the initial build has completed |
| `getBuildMetrics()` | Per-phase timings of the latest build |
| `getWorkerMetrics()` | Worker queue, round-trip, serialization and structural-batch metrics |
| `setChecked(id)` | Sets a single checked node |
| `setCheckedByIds(ids)` | Sets checked nodes in bulk |
| `clearAllChecked()` | Clears all checked state |
| `refreshCheckedResult()` | Re-emits the current v-model result using the active output settings |
| `updateNode(id, patch)` | Updates raw node fields; the ID cannot be changed |
| `addNode(node)` | Adds a node under root or an existing parent |
| `removeNode(id)` | Removes a node and its entire subtree |

## Slots

Both slots receive `{ node }` — the current row's `TreeNodeData`.

| Slot | Description |
| --- | --- |
| `#node` | Replaces the node-content area; defaults to `node.name` |
| `#actions` | End-of-row actions area; omitted when unused, and its clicks never select the row |

`#actions` does not mutate data on its own. The consuming application can use the instance APIs below with `v-model:tree` when an action should change data.

```vue
<VueGiantTree :tree="treeData" root="root" v-model="selected">
  <template #actions="{ node }">
    <button @click="edit(node)">Edit</button>
    <button @click="remove(node)">Delete</button>
  </template>
</VueGiantTree>
```

## Events

| Event | Payload | Description |
| --- | --- | --- |
| `update:modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | The selection changed |
| `update:tree` | `TreeInputItem[]` | The new input array after an edit |
| `item-contextmenu` | `(node: TreeNodeData, event: MouseEvent)` | Right-click on a row; the component does **not** call `preventDefault()` for you |

The component only emits an event; it ships no menu UI. Right-clicking a row emits `item-contextmenu(node, event)`, where `node` is the row's `TreeNodeData` and `event` is the native `MouseEvent`. The component does **not** call `preventDefault()`, so the browser's native menu still opens — call `event.preventDefault()` in your handler to replace it. Rendering, positioning and closing the menu are the consumer's responsibility; a common approach is `Teleport` to `body` positioned with `event.clientX/clientY`. Right-click never triggers row click/selection.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { TreeNodeData } from 'vue3-giant-tree-wasm'

const menu = ref<{ x: number; y: number; node: TreeNodeData } | null>(null)

const onContextMenu = (node: TreeNodeData, event: MouseEvent) => {
  event.preventDefault()
  menu.value = { x: event.clientX, y: event.clientY, node }
}
</script>

<template>
  <VueGiantTree :tree="treeData" root="root" v-model="selected" @item-contextmenu="onContextMenu" />

  <Teleport to="body">
    <ul v-if="menu" class="my-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <li @click="edit(menu.node)">Edit</li>
      <li @click="remove(menu.node)">Delete</li>
    </ul>
  </Teleport>
</template>
```

## Try it

Every capability above can be switched live in the [full playground](/en/playground).
