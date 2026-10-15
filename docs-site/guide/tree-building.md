# 树构建与数据格式

## 这一页讲什么

输入是**邻接表**：每行只要 `id` / `name` / `parentId`。组件不要求你提供 MPTT 边界，
`assembly/tree-builder.ts` 会在 WASM 里完成下面这些事：

1. 逐行流式解析 JSON —— 普通字段走零分配快路径，只有真的出现反斜杠才走转义解码；
2. 按 `parentId` 把节点分组为父子关系；
3. 用**单次深度优先遍历**重算 MPTT 的 `leftNode` / `rightNode`，也就是让每棵子树在编号上占一段连续区间。

> **为什么总是重建 MPTT**：只要输入和上次不同，输入里可能自带的 `leftNode`/`rightNode` 就可能是过期的。
> 拿过期边界做子树判定，会出现「明明在子树里却查不到」这类静默错误。因此组件不信任输入里的边界字段，
> 一律按 `parentId` 重算；`leftNodeField` / `rightNodeField` 只参与输入格式探测，不影响结果。

## 参数

| prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `tree` | `TreeInputItem[]` | `[]` | 邻接表数据。除 `id`/`name`/`parentId` 外的字段会原样保留进 `extendData` |
| `root` | `string` | `''` | 根标识；顶层节点的 `parentId` 应等于它 |
| `fieldKeys` | `TreeFieldKeys` | `{}` | 自定义字段名映射，见下 |
| `preorderedInput` | `boolean` | `false` | 输入已严格按深度优先前序排列时置 `true`，跳过通用分组 |
| `chunkedBuild` | `boolean` | `false` | 分批把节点写进 WASM，降低大输入首帧的阻塞 |
| `buildBatchSize` | `number` | `2000` | 每批节点数（`chunkedBuild` 生效时使用） |

### 字段名映射

```ts
interface TreeFieldKeys {
  idField?: string // 默认 'id'
  nameField?: string // 默认 'name'
  parentIdField?: string // 默认 'parentId'
  leftNodeField?: string // 默认 'leftNode'（仅用于输入格式探测）
  rightNodeField?: string // 默认 'rightNode'（仅用于输入格式探测）
}
```

两条容易踩的行为：

- `chunkedBuild` 只在 `outputIdOnly` 为 `true` **且**没有 `filterFn` 时生效 —— 只有这两种情况下组件不需要保留完整原始行数据。
- `preorderedInput` 打开但数据顺序不符时，组件会自动退回通用构建，不会给出错误的树。

## 用法

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const selected = ref([])
const rows = [
  { id: '1', name: '根节点', parentId: 'root' },
  { id: '2', name: '子节点 A', parentId: '1' },
  { id: '3', name: '子节点 B', parentId: '1' },
]
</script>

<template>
  <div style="height: 400px">
    <VueGiantTree :tree="rows" root="root" v-model="selected" />
  </div>
</template>
```

字段名不叫 `id`/`name`/`parentId` 时：

```vue
<VueGiantTree
  :tree="rows"
  root="root"
  :field-keys="{ idField: 'key', nameField: 'label', parentIdField: 'parent' }"
  v-model="selected"
/>
```

## 动手试试

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="tree-building" />

DEMO 里的「数据规模」切到 `10k` 时，组件会按同样的流程重建整棵 MPTT，
注意观察 `getTreeSize()` 与首帧的耗时差别。
