# Adding, editing and deleting nodes

## What this page covers

All three edits go through `v-model:tree`: the component emits the updated input array and the parent
writes it back into `tree`.

- **Editing** changes node content only, never structure;
- **Adding** and **deleting** recompute MPTT boundaries **inside the same component instance** and
  restore scroll position, expansion state and selection — the component is never remounted with a
  `key` (which would throw away scroll position and expansion along with it);
- **Node IDs are immutable**: if `updateNode`'s `patch` carries the ID field with a different value,
  the operation is rejected;
- **Deleting removes the whole subtree**: `removeNode(id)` collects every descendant through the
  `parentId` relationships and removes them together.

## Methods

| Method | Signature | Description |
| --- | --- | --- |
| `addNode` | `(node: TreeMutationItem) => boolean` | Adds under root or an existing parent; `false` when the ID already exists or the parent does not |
| `updateNode` | `(id: string, patch: TreeNodePatch) => boolean` | Fields only, never structure; the ID cannot be changed |
| `removeNode` | `(id: string) => boolean` | Removes the node and its entire subtree |

One easy trap: `TreeMutationItem` is just the raw input row (`Record<string, unknown>`). When
`fieldKeys` is configured, pass the **mapped** field names — if `idField` is `key`, a new node needs
`key`, not `id`.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = ref([
  { id: '1', name: 'Root', parentId: 'root' },
  { id: '2', name: 'Child A', parentId: '1' },
])
const selected = ref([])
const treeRef = ref<InstanceType<typeof VueGiantTree>>()

const rename = () => treeRef.value?.updateNode('2', { name: 'Renamed' })
const addChild = () =>
  treeRef.value?.addNode({ id: crypto.randomUUID(), name: 'New node', parentId: '1' })
const remove = () => treeRef.value?.removeNode('2') // removes the subtree too
</script>

<template>
  <VueGiantTree ref="treeRef" v-model:tree="treeData" v-model="selected" root="root" />
</template>
```

## Try it

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="crud" />

The full set of edit operations (`addNode` / `updateNode` / `removeNode` buttons plus a call log)
lives in the [full playground](/en/playground).
