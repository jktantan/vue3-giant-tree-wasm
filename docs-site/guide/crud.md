# 节点增删改

## 这一页讲什么

三种修改都通过 `v-model:tree` 双向同步：组件抛出更新后的输入数组，父组件写回 `tree`。

- **编辑**只改节点内容，不动结构；
- **新增**与**删除**会在**同一个组件实例内**重算 MPTT 左右边界，并恢复滚动位置、展开状态与选中状态 ——
  不会用 `key` 重新挂载整个组件（那样会把滚动位置和展开状态一起丢掉）；
- **节点 ID 不可修改**：`updateNode` 的 `patch` 里若带上 ID 字段且与原值不同，操作会被拒绝；
- **删除是连同整棵子树**：`removeNode(id)` 按 `parentId` 关系收集全部后代一并移除。

## 方法

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `addNode` | `(node: TreeMutationItem) => boolean` | 在根或已有父节点下新增；ID 已存在或父节点不存在时返回 `false` |
| `updateNode` | `(id: string, patch: TreeNodePatch) => boolean` | 只改字段，不改结构；ID 不可修改 |
| `removeNode` | `(id: string) => boolean` | 删除该节点及其全部子树 |

一个容易踩的点：`TreeMutationItem` 就是原始的输入行（`Record<string, unknown>`）。
用了 `fieldKeys` 时，这里要传**映射后**的字段名 —— 例如把 `idField` 配成 `key`，新增节点就得给 `key` 而不是 `id`。

## 用法

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = ref([
  { id: '1', name: '根节点', parentId: 'root' },
  { id: '2', name: '子节点 A', parentId: '1' },
])
const selected = ref([])
const treeRef = ref<InstanceType<typeof VueGiantTree>>()

const rename = () => treeRef.value?.updateNode('2', { name: '新名称' })
const addChild = () =>
  treeRef.value?.addNode({ id: crypto.randomUUID(), name: '新节点', parentId: '1' })
const remove = () => treeRef.value?.removeNode('2') // 连同子树一起删
</script>

<template>
  <VueGiantTree ref="treeRef" v-model:tree="treeData" v-model="selected" root="root" />
</template>
```

## 动手试试

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="crud" />

增删改的完整操作（`addNode` / `updateNode` / `removeNode` 各一个按钮，右侧还有调用日志）在
[完整演示场](/playground)里。
