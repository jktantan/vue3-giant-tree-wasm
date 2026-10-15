# 序列化与节点数据

## 这一页讲什么

渲染层拿到的是**可视行的 JSON**，由 `assembly/tree-serializer.ts` 生成。它没有走通用的 `JSON.stringify`：

- 每个字段按固定模板拼接，避免通用序列化器遍历对象、逐个判断类型；
- 小整数走 **ITOA 查表**（预计算 `0..4095` 的字符串），`leftNode` / `rightNode` / `deep` / `checked` / `selected`
  基本都落在范围内 —— 滚动时不会为每一行产生一次 `.toString()` 的堆分配；
- 字符串只在真的有特殊字符时才做转义。

组件层再叠一层 **JSON 缓存**：滚动位置与可见集合都没变时，直接复用上一次的序列化结果。

## 节点数据（TreeNodeData）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` / `name` / `parentId` | `string` | 原始标识与显示名 |
| `leftNode` / `rightNode` | `number` | MPTT 边界，由构建阶段按 `parentId` 重算 |
| `deep` | `number` | 深度；根的子节点为 `0` |
| `checked` | `CheckType` | 复选框状态：`UNCHECKED` / `CHECKED` / `HALF_CHECKED` |
| `selected` | `CheckType` | 点击选中状态（`SELECT` 模式） |
| `collapsed` | `boolean` | 是否折叠 |
| `disabled` | `boolean` | 是否禁用 |
| `extendData` | `Record<string, unknown>` | 原始行数据的完整副本；`filterFn` 收到的就是它 |
| `isLastChild` | `boolean?` | 是否为父节点最后一个子节点（仅开启 `showLine` 时写入） |
| `guideMask` | `number?` | 祖先列贯穿位掩码（仅开启 `showLine` 时写入） |
| `markerLine` | `'none' \| 'upper' \| 'lower' \| 'full'?` | 标记列竖线段形态（仅开启 `showLine` 时写入） |

最后三个字段是**渲染层预计算**的（见 `lib/guide.ts`），不是 WASM 数据；`showLine` 关闭时不写入，行对象保持轻量。

## 用法

序列化这一层由组件内部封装，业务侧通常不需要直接调用它。真正需要关心的是两件事：

```vue
<!-- 1) 只要 ID：序列化与传输成本最低 -->
<VueGiantTree :tree="rows" root="root" v-model="selectedIds" />

<!-- 2) 需要完整节点（含 extendData）：outputIdOnly = false -->
<VueGiantTree :tree="rows" root="root" :output-id-only="false" v-model="selectedNodes" />
```

`extendData` 是每行输入 JSON 的完整副本，所以后端返回的业务字段不需要额外映射就能在
`filterFn`、`#node` 插槽、`#actions` 插槽里直接用。

## 动手试试

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="serialization" />

切换「数据规模」到 `10k`，滚动时留意 DOM 里的行数始终只与视口高度有关 ——
序列化只发生在可视行上。
