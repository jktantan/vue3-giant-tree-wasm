# API 汇总

四张表对应 `lib/VueGiantTree.vue` 的 `defineProps` / `defineExpose` / 插槽与 `defineEmits`，
默认值取自 `withDefaults`。

## Props

| prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | — | 选中结果（v-model） |
| `tree` | `TreeInputItem[]` | `[]` | 树数据，邻接表格式 |
| `root` | `string` | `''` | 根标识；顶层节点的 `parentId` 应等于它 |
| `width` | `string` | `'100%'` | 容器宽度 |
| `height` | `string` | `'100%'` | 容器高度 |
| `lineHeight` | `number` | `26` | 每行高度（像素） |
| `fontSize` | `string` | `'14px'` | 字体大小 |
| `selectType` | `SelectType` | `SelectType.CHECKBOX` | `CHECKBOX` / `RADIO` / `SELECT` |
| `fieldKeys` | `TreeFieldKeys` | `{}` | 输入 JSON 的字段名映射 |
| `outputIdOnly` | `boolean` | `true` | `true` 时 v-model 只给 ID；`false` 给完整节点 |
| `checkedOutputMode` | `CheckedOutputMode` | `CheckedOutputMode.All` | CHECKBOX 的输出过滤模式 |
| `filterFn` | `FilterFn` | — | 自定义过滤回调（CHECKBOX+Custom 过滤输出；RADIO 过滤可选） |
| `nodeIcon` | `boolean \| NodeIconResolver` | `false` | 节点图标：`true` 内置，或按节点回调 |
| `showLine` | `boolean \| ShowLineOptions` | `false` | 连接线展示模式 |
| `chunkedBuild` | `boolean` | `false` | 分批写入 WASM 输入 |
| `buildBatchSize` | `number` | `2000` | 每批节点数 |
| `workerMode` | `boolean` | `false` | 树算法跑在 Web Worker |
| `preorderedInput` | `boolean` | `false` | 输入已按深度优先前序排列时跳过通用分组 |

## 方法

通过组件 `ref` 调用。

| 方法 | 说明 |
| --- | --- |
| `expandAll()` | 展开当前视图中的所有可展开节点 |
| `collapseAll()` | 收起当前视图中的所有可展开节点 |
| `fuzzySearch(keyword)` | 300ms 防抖的模糊搜索；空字符串清除 |
| `fuzzySearchRaw(keyword)` | 立即执行的模糊搜索；空字符串清除 |
| `switchDisplay(displayType)` | 切换 `TREE` / `SEARCH` 视图 |
| `getTreeSize()` | 返回树节点总数 |
| `getBuildReady()` | 首次构建是否已完成 |
| `getBuildMetrics()` | 最近一次构建的各阶段耗时 |
| `getWorkerMetrics()` | Worker 队列、往返、序列化与结构批次指标 |
| `setChecked(id)` | 设置单个选中节点 |
| `setCheckedByIds(ids)` | 批量设置选中节点 |
| `clearAllChecked()` | 清除所有选中状态 |
| `refreshCheckedResult()` | 按当前输出配置重新触发 `v-model` 结果 |
| `updateNode(id, patch)` | 更新节点原始字段；ID 不可修改 |
| `addNode(node)` | 在根或已有父节点下新增节点 |
| `removeNode(id)` | 删除节点及其全部子树 |

## 插槽

两个插槽都接收 `{ node }`（当前行的 `TreeNodeData`）。

| 插槽 | 说明 |
| --- | --- |
| `#node` | 替换节点名称所在的主体内容区；未传时显示 `node.name` |
| `#actions` | 行末操作区；未传时不渲染也不占空间，其点击不会触发行选中 |

## 事件

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `update:modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | 选中结果变化 |
| `update:tree` | `TreeInputItem[]` | 增删改后的新输入数组 |
| `item-contextmenu` | `(node: TreeNodeData, event: MouseEvent)` | 行上右键；组件**不会**自动 `preventDefault()` |

## 动手试试

以上所有能力都可以在[完整演示场](/playground)里现场切换。
