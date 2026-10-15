# 勾选与输出模式

## 这一页讲什么

勾选逻辑在 `assembly/tree-check.ts`，按 `selectType` 分派成三种完全不同的语义：

| `SelectType` | 行为 |
| --- | --- |
| `CHECKBOX` | 设置目标节点**及其整棵子树**，然后自下而上回溯每个祖先，按直接子节点的聚合结果重算 `checked`（`CHECKED` / `HALF_CHECKED` / `UNCHECKED`） |
| `RADIO` | 全树同一时刻只有一个节点被选中 |
| `SELECT` | 点击选中；与 `RADIO` 一样是全树唯一，但走 `selected` 字段，不影响复选框状态 |

两个容易忽略的行为：

- **禁用节点不可选中**：目标节点 `disabled` 时，这次操作直接返回，连子树都不动。
- **祖先回溯是幂等的**：每个祖先都按「直接子节点当前值」重算，而不是累加增量。
  因此重复勾选同一节点不会让半选状态漂移。

## 参数

| prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `selectType` | `SelectType` | `SelectType.CHECKBOX` | `CHECKBOX` / `RADIO` / `SELECT` |
| `outputIdOnly` | `boolean` | `true` | `true` 时 v-model 只给选中节点的 ID；`false` 给完整 `TreeNodeData` |
| `checkedOutputMode` | `CheckedOutputMode` | `CheckedOutputMode.All` | CHECKBOX 模式下「哪些选中节点进入输出」 |
| `filterFn` | `FilterFn` | — | 自定义过滤回调，作用见下表 |
| `modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | — | 选中结果（v-model） |

### `CheckedOutputMode`

| 值 | 输出 |
| --- | --- |
| `All` | 所有选中节点 |
| `RootOnly` | 只给全选子树的根（去重后的最上层） |
| `LeafOnly` | 只给叶子节点 |
| `Custom` | 由 `filterFn` 决定 |

### `filterFn` 在三种模式下的作用

| 模式 | 作用 |
| --- | --- |
| `CHECKBOX` + `Custom` | 过滤**输出**：`filterFn` 返回 `false` 的已选中节点不会出现在 v-model 里 |
| `RADIO` | 过滤**可选**：`filterFn` 返回 `false` 的节点不显示单选按钮 |
| `SELECT` | 不受影响 |

`filterFn` 收到的是节点的 `extendData`（原始行数据的完整副本），不是 `TreeNodeData`。

## 用法

只关心选中了哪些 id（默认）：

```vue
<VueGiantTree :tree="rows" root="root" v-model="selectedIds" />
<!-- selectedIds: ['2', '3'] -->
```

需要完整节点内容：

```vue
<VueGiantTree :tree="rows" root="root" :output-id-only="false" v-model="selectedRows" />
<!-- selectedRows: [{ id: '2', name: '子节点 A', ... }] -->
```

只输出全选子树的根：

```vue
<VueGiantTree
  :tree="rows"
  root="root"
  :checked-output-mode="CheckedOutputMode.RootOnly"
  v-model="selectedIds"
/>
```

## 动手试试

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="check-and-output" />

试一下：勾选根节点后切换 `checkedOutputMode`，输出区会从「全部选中节点」变成「只有根」或「只有叶子」；
再切到 `RADIO`，同样的数据下只有单选按钮，且随时只有一个被选中。
