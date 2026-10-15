# vue3-giant-tree-wasm

A WebAssembly-powered virtual tree component for Vue 3, built for 100K–1M-node datasets. Tree building, traversal, fuzzy search and check propagation run in AssemblyScript-compiled WASM, using MPTT for O(1) subtree checks and O(k) viewport slicing. Only the rows in view are rendered to the DOM, so interaction stays responsive at a million nodes.

```bash
npm install vue3-giant-tree-wasm
```

```ts
import { VueGiantTree } from 'vue3-giant-tree-wasm'
import 'vue3-giant-tree-wasm/style.css'
```

📖 <a href="https://jktantan.github.io/vue3-giant-tree-wasm/" target="_blank" rel="noopener noreferrer">Full documentation and live demo</a>

[中文](#中文) | [English](#english) | [Русский](#русский)

---

## 中文

### 简介

面向 10 万至百万级节点数据的 Vue 3 + WebAssembly 虚拟树组件。核心树算法使用 AssemblyScript 编写并编译为 WASM，利用 MPTT（改进的前序遍历树）数据结构实现 O(1) 子树判定和 O(k) 可视区域切片，专注大规模树的交互性能。

### 性能

以下数据来自 release WASM、本机 Chromium 环境的可重复基准；实际结果会受数据形状、浏览器、硬件、启用功能和行内容复杂度影响。

- 容量基准覆盖最多 100 万节点数据集
- 100,000 节点滚动动作 P95：约 0.1 ms
- 4,620 节点浏览器工作负载滚动动作 P95：约 0.4 ms
- 仅将视口内的行渲染到 DOM

完整测试方法、环境和结果见 <a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md" target="_blank" rel="noopener noreferrer">性能门禁归档</a>。

### 开发者注意事项

下面几条都有实测依据（release WASM + 本机 Chromium），不注意容易出现「本地很快、上线很慢」这类问题。

**1. 大树数据用 `shallowRef`，不要用 `ref`。** 组件会全量遍历 `tree`，深度响应式数组的每次属性读取都要过 Proxy 的 get trap，并为嵌套对象惰性创建代理。10 万节点实测 `JSON.stringify`：原始数组 17.1ms、`ref().value` **277.2ms**、`shallowRef().value` 19.6ms。组件内部已用 `toRaw()` 兜底，但宿主侧用 `shallowRef` 更省——树数据只会整体替换，不需要深层响应式。

**2. 10 万节点以上建议开 `workerMode`：**

| 数据量 | `workerMode: false` | `workerMode: true` |
| --- | --- | --- |
| 1 万 | total 22.8ms | roundTrip 42.7ms |
| 10 万 | total 242ms，主线程阻塞 249ms | roundTrip **53.4ms**，主线程无阻塞 |
| 100 万 | total 2697ms，主线程阻塞 2749ms | roundTrip 584ms |

1 万以下走主线程更快（省一次往返）；Worker 首次开启有一笔一次性加载成本，之后复用。

**3. 换数据直接改 `tree` prop，不要用 `:key` 强制重挂载。** 前者复用 Worker 与 WASM 实例（100 万节点约 600ms）；后者每次都要销毁并重建 Worker。

**4. `chunkedBuild` 只在 `outputIdOnly` 为 `true` 且未使用 `filterFn` 时生效**，否则退回整棵 JSON 路径。`getBuildMetrics().inputBridgeMs` 为 0 就是没走分批的信号。

### 缺陷与诊断

最近一轮对 `Assembly/` 与 `lib/` 目录的代码审查产出 10 项发现（2 个 🔴、3 个 🟠、5 个 🟡），已在
<a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/diagnostics.md" target="_blank" rel="noopener noreferrer"><code>docs/diagnostics.md</code></a> 中按优先级与修复计划列出。引用本文档时请同步引用
诊断报告，以确保读者了解已修复的边界条件与剩余的可优化项。

### 特性

- **WASM 加速** — 树构建、遍历、搜索、选中等核心运算在 WebAssembly 中执行
- **虚拟滚动** — 仅渲染可视区域内的节点，DOM 占用极低
- **MPTT 算法** — O(1) 子树判定，O(k) 视口切片，O(subtree + log N) 展开/折叠
- **平滑展开/收起动画** — 在不渲染完整子树的前提下，为视口内分支提供流畅过渡；自动遵循系统“减少动态效果”偏好
- **三种选择模式** — 多选 (Checkbox)、单选 (Radio)、点击选中 (Select)
- **模糊搜索** — 关键词过滤并自动补全祖先链；搜索视图支持独立展开/收起，不影响主树状态
- **批量展开/收起** — 通过组件实例 API 一键展开或收起当前视图
- **可配置字段名** — 支持自定义输入 JSON 的字段映射（id / name / parentId / leftNode / rightNode）
- **统一树构建** — 无论输入是邻接表还是 MPTT 格式，始终自动重建 MPTT，避免 stale leftNode/rightNode
- **JSON 缓存** — 滚动位置不变时直接返回缓存，避免重复序列化
- **TypeScript 类型支持** — 完整的类型定义导出

展开或收起节点时，组件仅为当前视口中已有的分支行创建短暂的过渡层，不会因此将整棵子树加入 DOM。动画时长为约 220ms；为保持过渡稳定，滚动会在动画完成前暂时冻结。

### 安装

```bash
npm install vue3-giant-tree-wasm
# 或
pnpm add vue3-giant-tree-wasm
# 或
yarn add vue3-giant-tree-wasm
```

组件样式以独立 CSS 文件随包发布，需要在应用入口引入一次：

```ts
import 'vue3-giant-tree-wasm/style.css'
```

### 快速上手

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = [
  { id: '1', name: '根节点', parentId: 'root' },
  { id: '2', name: '子节点 A', parentId: '1' },
  { id: '3', name: '子节点 B', parentId: '1' },
  { id: '4', name: '孙节点 A-1', parentId: '2' },
]

const selected = ref([])
</script>

<template>
  <div style="width: 400px; height: 600px">
    <VueGiantTree :tree="treeData" root="root" v-model="selected" />
  </div>
</template>
```

### 组件实例方法

为组件设置 `ref` 后，可以调用以下方法。`expandAll()` 和 `collapseAll()` 会作用于当前视图：普通树视图操作完整树，搜索视图只操作当前搜索结果；搜索视图中的操作不会改变主树的收起状态。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeRef = ref<InstanceType<typeof VueGiantTree>>()

const expandAll = () => treeRef.value?.expandAll()
const collapseAll = () => treeRef.value?.collapseAll()
const search = (keyword: string) => treeRef.value?.fuzzySearch(keyword)
</script>

<template>
  <button @click="expandAll">全部展开</button>
  <button @click="collapseAll">全部收起</button>
  <VueGiantTree ref="treeRef" :tree="treeData" root="root" v-model="selected" />
</template>
```

| 方法                                      | 说明                                       |
| ----------------------------------------- | ------------------------------------------ |
| `expandAll()`                             | 展开当前视图中的所有可展开节点             |
| `collapseAll()`                           | 收起当前视图中的所有可展开节点             |
| `fuzzySearch(keyword)`                    | 300ms 防抖的模糊搜索；传入空字符串清除搜索 |
| `fuzzySearchRaw(keyword)`                 | 立即执行模糊搜索；传入空字符串清除搜索     |
| `getTreeSize()`                           | 返回树节点总数                             |
| `getBuildReady()`                         | 返回首次构建是否已完成（布尔值）           |
| `getBuildMetrics()`                       | 返回最近一次构建各阶段耗时（毫秒）         |
| `getWorkerMetrics()`                      | 返回 Worker 队列、往返、序列化与结构批次指标 |
| `setChecked(id)` / `setCheckedByIds(ids)` | 以编程方式设置选中节点                     |
| `clearAllChecked()`                       | 清除所有选中状态                           |
| `switchDisplay(displayType)`              | 切换 `TREE` 或 `SEARCH` 视图               |
| `refreshCheckedResult()`                  | 按当前输出配置重新触发 `v-model` 结果      |
| `updateNode(id, patch)`                   | 更新节点原始字段；节点 ID 不可修改         |
| `addNode(node)`                           | 在根或已有父节点下新增节点                  |
| `removeNode(id)`                          | 删除节点及其全部子树                       |

`chunkedBuild` 默认关闭。开启后会分批把节点写入 WASM，降低大输入首次构建时的主线程阻塞；它只在 `outputIdOnly` 为 `true` 且未设置 `filterFn` 时生效（这两种情况下组件才无需保留完整原始行数据），每批节点数由 `buildBatchSize` 控制（默认 2000）。

`workerMode` 默认关闭。开启后树算法在 Web Worker 中执行，主线程只负责渲染，适合超大输入或频繁结构变更；Worker 相关指标由 `getWorkerMetrics()` 返回。

`getBuildReady()` 返回首次构建是否已完成；`getBuildMetrics()` 返回最近一次构建的各阶段耗时（`inputBridgeMs`、`finalizeMs`、`cacheAssemblyMs`、`totalMs` 等），用于定位构建瓶颈。

`preorderedInput` 默认是 `false`。当输入严格按深度优先前序排列（父节点在前，且节点的整个子树连续）时可设为 `true`，首次构建会跳过通用父子分组；若数据不符合该顺序，组件会自动回退到通用构建。

`getWorkerMetrics()` 仅在启用 `workerMode` 时有实际数据。可用它区分主线程感知的往返时间（`lastRoundTripMs`）、Worker 处理等待/计算时间（`lastWorkerResponseMs`）、可视行序列化时间（`lastWorkerSerializeMs`），以及连续结构操作的合并效果（`structuralBatches`、`structuralOperations`、`lastBatchSize`）。

### 节点增删改

通过 `v-model:tree` 接收更新后的输入数组。编辑只更新节点内容；新增和删除会在同一组件实例中重算 MPTT 左右边界，并恢复滚动位置、展开和选中状态，不会通过 `key` 重挂载组件。

```vue
<VueGiantTree ref="treeRef" v-model:tree="treeData" v-model="selected" />

<!-- treeRef.value?.addNode({ id: crypto.randomUUID(), name: '新节点', parentId }) -->
<!-- treeRef.value?.updateNode(id, { name: '新名称' }) -->
<!-- treeRef.value?.removeNode(id)  // 删除全部子孙节点 -->
```

### Props

| 属性                | 类型                             | 默认值     | 说明                                                                                    |
| ------------------- | -------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `tree`              | `TreeInputItem[]`                | `[]`       | 树数据，邻接表格式                                                                      |
| `root`              | `string`                         | `''`       | 根节点标识，顶层节点的 `parentId` 应等于此值                                            |
| `modelValue`        | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | —          | 选中结果 (v-model)                                                                      |
| `width`             | `string`                         | `'100%'`   | 容器宽度                                                                                |
| `height`            | `string`                         | `'100%'`   | 容器高度                                                                                |
| `lineHeight`        | `number`                         | `26`       | 每行高度（像素）                                                                        |
| `fontSize`          | `string`                         | `'14px'`   | 字体大小                                                                                |
| `selectType`        | `SelectType`                     | `CHECKBOX` | 选择模式：`CHECKBOX` / `RADIO` / `SELECT`                                               |
| `fieldKeys`         | `TreeFieldKeys`                  | `{}`       | JSON 字段名映射，见下方说明                                                             |
| `outputIdOnly`      | `boolean`                        | `true`     | `true` 时 v-model 只传选中节点的 ID（默认）；`false` 时传完整 JSON                      |
| `checkedOutputMode` | `CheckedOutputMode`              | `All`      | CHECKBOX 输出 ID 过滤模式：`All` / `RootOnly` / `LeafOnly` / `Custom`                   |
| `filterFn`          | `FilterFn`                       | —          | 自定义过滤回调。CHECKBOX + Custom 模式下过滤输出；RADIO 模式下判断节点是否显示 Radio 框 |
| `nodeIcon`          | `boolean \| NodeIconResolver`   | `false`    | 节点图标：`true` 使用内置图标；回调可按节点指定或隐藏 CSS 图标类                        |
| `showLine`          | `boolean \| ShowLineOptions`     | `false`    | 连接线展示模式：`false` 关闭；`true` 用默认（实线 + `#d0d4dc` + 1px）；对象可切换 `style: 'solid' \| 'dashed' \| 'dotted'`、`color`、`width`（像素） |
| `chunkedBuild`      | `boolean`                        | `false`    | 显式启用分批 WASM 输入；仅在 `outputIdOnly` 为 `true` 且未设置 `filterFn` 时生效 |
| `buildBatchSize`    | `number`                         | `2000`     | 分批构建时每批写入 WASM 的节点数 |
| `workerMode`        | `boolean`                        | `false`    | 将树算法放入 Web Worker；适合大树或频繁结构变更 |
| `preorderedInput`   | `boolean`                        | `false`    | 输入已按深度优先前序排列时，跳过通用父子分组构建 |

### 插槽

两个插槽都接收 `{ node }`，其中 `node` 为当前的 `TreeNodeData`。

| 插槽 | 说明 |
| --- | --- |
| `#node` | 替换节点名称所在的主体内容区；未传入时默认显示 `node.name`。 |
| `#actions` | 节点行末的操作区，例如编辑、删除和更多菜单；未传入时不渲染也不占空间。操作区的点击会自动阻止触发行点击/选中。 |

`#actions` 只提供操作入口，不会修改或重建树数据；编辑、删除后的数据同步由业务方自行处理。

```vue
<VueGiantTree :tree="treeData" root="root" v-model="selected">
  <template #node="{ node }">
    <strong>{{ node.name }}</strong>
    <span v-if="node.disabled">禁用</span>
  </template>

  <template #actions="{ node }">
    <button @click="edit(node)">编辑</button>
    <button @click="remove(node)">删除</button>
  </template>
</VueGiantTree>
```

### 右键菜单 (item-contextmenu)

组件只抛出事件，不内置菜单 UI。在行上右键会触发 `item-contextmenu(node, event)`，`node` 为该行 `TreeNodeData`，`event` 为原生 `MouseEvent`。组件**不会**自动调用 `preventDefault()`，浏览器原生菜单照常弹出；如需替换为自定义菜单，请在回调里自行 `event.preventDefault()`。菜单的渲染、定位与关闭由业务方负责，常见做法是 `Teleport` 到 `body` 并用 `event.clientX/clientY` 定位。右键不会触发行点击/选中。

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
      <li @click="edit(menu.node)">编辑</li>
      <li @click="remove(menu.node)">删除</li>
    </ul>
  </Teleport>
</template>
```

### 节点图标 (nodeIcon)

`nodeIcon` 默认关闭，因此不会改变现有行布局。设为 `true` 后，父节点收起时显示关闭文件夹、展开时显示打开文件夹，叶子节点显示文件图标。

若图标取决于业务类型，使用回调在前端将后端返回的业务字段映射为 CSS 图标类；后端无需、也不应知道具体的前端图标资源。

```typescript
import type { NodeIconResolver } from 'vue3-giant-tree-wasm'

const nodeIcon: NodeIconResolver = node => {
  switch (node.extendData?.nodeType) {
    case 'directory':
      return {
        collapsed: 'app-icon-folder',
        expanded: 'app-icon-folder-open',
      }
    case 'document':
      return 'app-icon-document' // 两种状态共用
    case 'hidden':
      return false // 此节点不显示图标
    default:
      return true // 回退到组件的默认图标
  }
}
```

```vue
<VueGiantTree :tree="treeData" :node-icon="nodeIcon" />
```

回调返回值为 `true | false | string | { collapsed: string; expanded?: string }`。对象缺少 `expanded` 时自动复用 `collapsed`；叶子节点也使用 `collapsed`。自定义类负责提供完整图标样式，例如 `background-image: url(...)`；这种方式会保留 SVG 的多色填充。暗色主题可在主题选择器中为相同的图标类覆盖 `background-image`。

### 连接线 (showLine)

`showLine` 默认关闭，因此不会改变现有行布局。开启后会按以下形式渲染：

- `true` / `undefined`：使用默认线样式（`#d0d4dc` / 1px）；
- `false`：关闭；
- 对象 `{ style?, color?, width? }`：分别切换样式、颜色、粗细；缺省字段沿用默认。

样式有三种：

- `'solid'`（默认）：连续的实线，最常见的层级连接线；
- `'dashed'`：`linear-gradient` 把线条切成 4px 实线 + 4px 间隔的循环，画中等节奏的虚线；
- `'dotted'`：`radial-gradient` 在 4×4 网格里密铺一个紧凑点，整条线呈现虚线点状；适合深色主题或密集层级。

颜色接受任意 CSS color（如 `#3b82f6`、`rgb(255,0,0)`），粗细为像素（正数，缺省 `1`）。

规则：

- **只有叶子节点**在标记列（箭头所在那一格）画连向父节点的折线；**分支节点只用箭头**，不画折线。
- 缩进格会为「仍有后续兄弟」的祖先列画一条贯穿竖线，把上下的结构连起来。
- 叶子折线的收尾形态取决于它在兄弟中的位置，**且顶层与内层不同**：

| 位置 | 顶层（最外层） | 内层 |
| --- | --- | --- |
| 首位叶子 | `┌`（下半段竖线） | `├`（全高竖线） |
| 中间叶子 | `├`（全高竖线） | `├` |
| 末位叶子 | `└`（上半段竖线） | `└` |
| 独子叶子 | — | `└` |

只有**最外层**的首位叶子用 `┌` 开顶；内层首位叶子左上方已有缩进竖线接住，所以用 `├`。

```vue
<VueGiantTree :tree="treeData" :show-line="true" />
<!-- 自定义点样式 + 颜色 + 粗细 -->
<VueGiantTree
  :tree="treeData"
  :show-line="{ style: 'dotted', color: '#3b82f6', width: 2 }"
/>
```

视觉样例（顶层 `┌`、分支只有箭头、内层 `├`/`└`）：

```
┌ □ 顶层叶·首
▼ □ 顶部分支
│  ├ □ 内层叶·首
│  ├ □ 内层叶·中
│  └ □ 内层叶·末
└ □ 顶层叶·末
```

连接线仅在开启时渲染（组件对该配置做一次性预计算，几何只取决于层级结构、与折叠状态无关），关闭时行 DOM 与开启前完全一致。开发测试页的「数据规模 → `guide 连接线样例`」提供了覆盖各位置组合的样例，配合「功能开关 → 显示连接线」即可逐行核对。

### CheckedOutputMode

CHECKBOX 模式下控制 `getCheckedIds` 和 `getCheckedNodes` 的输出内容：

| 值         | 说明                                               |
| ---------- | -------------------------------------------------- |
| `All`      | 所有选中节点（默认）                               |
| `RootOnly` | 仅返回全选子树的根节点（去重）                     |
| `LeafOnly` | 仅返回叶子节点                                     |
| `Custom`   | 自定义模式：由 `filterFn` 回调决定输出哪些选中节点 |

### filterFn 自定义过滤

`filterFn` 是一个回调函数，接收节点的 `extendData`（原始数据对象），返回 `boolean`：

```typescript
type FilterFn = (extendData: Record<string, unknown>) => boolean
```

**两种用法：**

| 模式                  | 行为                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| `CHECKBOX` + `Custom` | 过滤输出结果，只有 filterFn 返回 `true` 的已选中节点会出现在 v-model 中           |
| `RADIO`               | 过滤可选节点，只有 filterFn 返回 `true` 的节点才显示 Radio 框，其余节点无法被选中 |
| `SELECT`              | 不受影响                                                                          |

**示例：** 只输出/选中 `category` 为 `'A'` 的节点

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree, CheckedOutputMode } from 'vue3-giant-tree-wasm'
import type { FilterFn } from 'vue3-giant-tree-wasm'

const selected = ref([])

const filterFn: FilterFn = extendData => {
  return extendData.category === 'A'
}
</script>

<template>
  <!-- CHECKBOX 模式：按 filterFn 过滤输出 -->
  <VueGiantTree
    :tree="treeData"
    root="root"
    :checked-output-mode="CheckedOutputMode.Custom"
    :filter-fn="filterFn"
    v-model="selected"
  />

  <!-- RADIO 模式：只有 category='A' 的节点显示 Radio 框 -->
  <VueGiantTree
    :tree="treeData"
    root="root"
    :select-type="SelectType.RADIO"
    :filter-fn="filterFn"
    v-model="selected"
  />
</template>
```

> **注意：** `filterFn` 接收的是原始行数据（即输入 JSON 中除 id/name/parentId 外的所有字段）。组件解析输入时会自动将每行的完整 JSON 保存为 `extendData`，filterFn 直接拿到这个对象。

### 字段名映射 (fieldKeys)

当输入数据的 JSON 字段名不是默认的 `id`/`name`/`parentId`/`leftNode`/`rightNode`时，可通过`fieldKeys` 指定映射关系：

```typescript
interface TreeFieldKeys {
  idField?: string // 默认 'id'
  nameField?: string // 默认 'name'
  parentIdField?: string // 默认 'parentId'
  leftNodeField?: string // 默认 'leftNode'
  rightNodeField?: string // 默认 'rightNode'
}
```

**示例：** 数据字段名为 `key` / `label` / `parent` / `lft` / `rgt`

```vue
<template>
  <VueGiantTree
    :tree="treeData"
    root="root"
    :fieldKeys="{
      idField: 'key',
      nameField: 'label',
      parentIdField: 'parent',
      leftNodeField: 'lft',
      rightNodeField: 'rgt',
    }"
  />
</template>
```

> **注意：** leftNode/rightNode 字段仅用于自动检测输入类型。无论输入是否包含这两个字段，组件始终基于 parentId 关系重新构建 MPTT 树，以确保 leftNode/rightNode 值准确无误。

### 数据格式

#### 输入数据 (TreeInputItem)

```typescript
interface TreeInputItem {
  id: string // 节点唯一 ID
  name: string // 节点显示名称
  parentId: string // 父节点 ID
  disabled?: boolean // 是否禁用；禁用节点不可选中
}
```

#### 节点数据 (TreeNodeData)

```typescript
interface TreeNodeData {
  id: string
  name: string
  parentId: string
  leftNode: number // MPTT 左边界
  rightNode: number // MPTT 右边界
  deep: number // 节点深度
  checked: CheckType // 选中状态
  selected: CheckType
  collapsed: boolean // 是否折叠
  disabled: boolean // 是否禁用
  extendData?: Record<string, unknown> // 原始行数据（输入 JSON 的完整副本）
  // 以下连接线字段仅在启用 showLine 时写入，用于渲染缩进与折线
  isLastChild?: boolean // 是否为父节点的最后一个子节点
  guideMask?: number // 祖先列贯穿位掩码
  markerLine?: 'none' | 'upper' | 'lower' | 'full' // 标记列（箭头格）竖线段形态
}
```

### 选择模式

| 模式       | 说明                                                        |
| ---------- | ----------------------------------------------------------- |
| `CHECKBOX` | 多选复选框，支持半选状态，选中/取消自动传播至子节点和父节点 |
| `RADIO`    | 单选模式，同一时刻只能选中一个节点                          |
| `SELECT`   | 点击选中模式，点击节点行即选中                              |

### 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建 WASM
pnpm asbuild

# 构建组件库
pnpm lib:build
```

### 许可证

<a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">BSD 2-Clause</a>

---

## English

### Introduction

A WebAssembly-powered virtual tree for Vue 3, designed for responsive interaction with 100K–1M-node datasets. The core tree algorithms are written in AssemblyScript and compiled to WASM, leveraging the MPTT (Modified Preorder Tree Traversal) data structure to achieve O(1) subtree checks and O(k) viewport slicing.

### Performance

The following reproducible benchmarks use release WASM and local Chromium. Results depend on data shape, browser, hardware, enabled features, and rendering complexity.

- Capacity benchmarks cover datasets up to 1M nodes
- 100K-node scroll action P95: ~0.1 ms
- 4,620-node browser-workload scroll action P95: ~0.4 ms
- Only viewport rows are rendered to the DOM

See the <a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md" target="_blank" rel="noopener noreferrer">performance-gate archive</a> for methodology, environment, and complete results.

### Developer notes

The following are all measured (release WASM + local Chromium); ignoring them tends to produce "fast locally, slow in production" surprises.

**1. Use `shallowRef` for large datasets, not `ref`.** The component walks the whole `tree`, and every property read on a deep-reactive array goes through a Proxy get trap that lazily creates a proxy for each nested object. Measured on 100,000 nodes, `JSON.stringify`: raw array 17.1ms, `ref().value` **277.2ms**, `shallowRef().value` 19.6ms. The component already calls `toRaw()` internally, but `shallowRef` on the host side is cheaper — tree data is only ever replaced wholesale, so it needs no deep reactivity.

**2. Enable `workerMode` from ~100,000 nodes upward:**

| Dataset | `workerMode: false` | `workerMode: true` |
| --- | --- | --- |
| 10,000 | total 22.8ms | roundTrip 42.7ms |
| 100,000 | total 242ms, main thread blocked 249ms | roundTrip **53.4ms**, no blocking |
| 1,000,000 | total 2697ms, main thread blocked 2749ms | roundTrip 584ms |

Below 10,000 the main-thread path is faster (it skips a round trip). Turning the Worker on for the first time carries a one-off load cost; it is reused afterwards.

**3. Replace data by re-assigning the `tree` prop, not by forcing a remount with `:key`.** The former reuses the Worker and WASM instance (~600ms for 1M nodes); the latter tears down and rebuilds the Worker every time.

**4. `chunkedBuild` only takes effect when `outputIdOnly` is `true` and no `filterFn` is used** — otherwise the component falls back to the whole-tree JSON path. An `inputBridgeMs` of 0 in `getBuildMetrics()` means the chunked path was not taken.

### Diagnostics

A recent review of the `Assembly/` and `lib/` directories produced ten findings
(2 🔴, 3 🟠, 5 🟡). They are catalogued in
<a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/diagnostics.md" target="_blank" rel="noopener noreferrer"><code>docs/diagnostics.md</code></a> with their priority and fix plan.
When citing this README, link the diagnostics report together so readers know
which edge cases are already addressed and which remain as future optimizations.

### Features

- **WASM-Accelerated** — Tree building, traversal, search, and check operations run in WebAssembly
- **Virtual Scrolling** — Only renders nodes within the visible viewport, minimal DOM footprint
- **MPTT Algorithm** — O(1) subtree checks, O(k) viewport slicing, O(subtree + log N) expand/collapse
- **Smooth Expand/Collapse Animation** — Animates branches already in the viewport without materializing entire subtrees; respects the system reduced-motion preference
- **Three Selection Modes** — Checkbox (multi-select), Radio (single-select), Click-to-Select
- **Fuzzy Search** — Keyword filtering with automatic ancestor chain completion; search-view expand/collapse state is independent from the main tree
- **Expand/Collapse All** — Component instance APIs expand or collapse the current view in one operation
- **Configurable Field Keys** — Custom JSON field name mapping for id / name / parentId / leftNode / rightNode
- **Unified Tree Building** — Always rebuilds MPTT from parentId regardless of input format, avoiding stale leftNode/rightNode
- **JSON Caching** — Returns cached results when scroll position is unchanged
- **TypeScript Support** — Full type definitions exported

When a node expands or collapses, the component creates a short-lived transition layer only for branch rows already in the viewport; it never adds the entire subtree to the DOM for animation. The transition lasts about 220ms, and scrolling is temporarily frozen until it completes to keep the animation stable.

### Installation

```bash
npm install vue3-giant-tree-wasm
# or
pnpm add vue3-giant-tree-wasm
# or
yarn add vue3-giant-tree-wasm
```

Component styles ship as a separate CSS file and must be imported once in your app entry:

```ts
import 'vue3-giant-tree-wasm/style.css'
```

### Quick Start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = [
  { id: '1', name: 'Root', parentId: 'root' },
  { id: '2', name: 'Child A', parentId: '1' },
  { id: '3', name: 'Child B', parentId: '1' },
  { id: '4', name: 'Grandchild A-1', parentId: '2' },
]

const selected = ref([])
</script>

<template>
  <div style="width: 400px; height: 600px">
    <VueGiantTree :tree="treeData" root="root" v-model="selected" />
  </div>
</template>
```

### Component Instance Methods

Set a component `ref` to call these methods. `expandAll()` and `collapseAll()` apply to the current view: they operate on the full tree normally, or only the current results while searching. Search-view expansion state never changes the main tree's collapse state.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const expandAll = () => treeRef.value?.expandAll()
const collapseAll = () => treeRef.value?.collapseAll()
const search = (keyword: string) => treeRef.value?.fuzzySearch(keyword)
</script>

<template>
  <button @click="expandAll">Expand all</button>
  <button @click="collapseAll">Collapse all</button>
  <VueGiantTree ref="treeRef" :tree="treeData" root="root" v-model="selected" />
</template>
```

| Method                                    | Description                                                          |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `expandAll()`                             | Expands every expandable node in the current view                    |
| `collapseAll()`                           | Collapses every expandable node in the current view                  |
| `fuzzySearch(keyword)`                    | Debounced (300ms) fuzzy search; pass an empty string to clear it     |
| `fuzzySearchRaw(keyword)`                 | Immediate fuzzy search; pass an empty string to clear it             |
| `getTreeSize()`                           | Returns the total node count                                         |
| `getBuildReady()`                         | Returns whether the initial build has completed                      |
| `getBuildMetrics()`                       | Returns per-phase timings of the latest build (ms)                   |
| `getWorkerMetrics()`                      | Returns worker queue, round-trip and serialization metrics           |
| `setChecked(id)` / `setCheckedByIds(ids)` | Sets checked nodes programmatically                                  |
| `clearAllChecked()`                       | Clears all checked state                                             |
| `switchDisplay(displayType)`              | Switches to `TREE` or `SEARCH` view                                  |
| `refreshCheckedResult()`                  | Re-emits the current v-model result using the active output settings |
| `updateNode(id, patch)`                   | Updates raw node fields; node IDs are immutable                       |
| `addNode(node)`                           | Adds a node under root or an existing parent                          |
| `removeNode(id)`                          | Removes a node and its entire subtree                                 |

`chunkedBuild` is off by default. Enabling it writes nodes to WASM in batches, reducing main-thread blocking during the first build of large inputs; it only takes effect when `outputIdOnly` is `true` and no `filterFn` is set (the only cases where the component does not need the full raw rows), and `buildBatchSize` controls the batch size (default 2000).

`workerMode` is off by default. When enabled, the tree algorithms run in a Web Worker so the main thread only renders; it suits very large inputs or frequent structural changes. Worker metrics are returned by `getWorkerMetrics()`.

`getBuildReady()` reports whether the initial build has completed; `getBuildMetrics()` returns per-phase timings of the latest build (`inputBridgeMs`, `finalizeMs`, `cacheAssemblyMs`, `totalMs`, …) for locating build bottlenecks.

`preorderedInput` defaults to `false`. Set it to `true` when the input is strictly in depth-first preorder (parents before children, each subtree contiguous) to skip generic parent-child grouping on the first build; the component falls back to generic building automatically when the data does not match that order.

`getWorkerMetrics()` only has meaningful data when `workerMode` is enabled. Use it to separate main-thread round-trip time (`lastRoundTripMs`), worker wait/compute time (`lastWorkerResponseMs`), visible-row serialization time (`lastWorkerSerializeMs`), and the effect of coalescing consecutive structural operations (`structuralBatches`, `structuralOperations`, `lastBatchSize`).

### Add, Edit, and Delete Nodes

Use `v-model:tree` to receive the updated input array. Editing only updates node content; adding or deleting recomputes MPTT boundaries within the same component instance and restores scroll position, expanded and selected state, without remounting the component via `key`.

```vue
<VueGiantTree ref="treeRef" v-model:tree="treeData" v-model="selected" />

<!-- treeRef.value?.addNode({ id: crypto.randomUUID(), name: 'New node', parentId }) -->
<!-- treeRef.value?.updateNode(id, { name: 'Renamed' }) -->
<!-- treeRef.value?.removeNode(id)  // removes all descendants -->
```

### Props

| Prop                | Type                             | Default    | Description                                                                                                 |
| ------------------- | -------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `tree`              | `TreeInputItem[]`                | `[]`       | Tree data in adjacency list format                                                                          |
| `root`              | `string`                         | `''`       | Root identifier; top-level nodes' `parentId` should equal this                                              |
| `modelValue`        | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | —          | Selected result (v-model)                                                                                   |
| `width`             | `string`                         | `'100%'`   | Container width                                                                                             |
| `height`            | `string`                         | `'100%'`   | Container height                                                                                            |
| `lineHeight`        | `number`                         | `26`       | Row height in pixels                                                                                        |
| `fontSize`          | `string`                         | `'14px'`   | Font size                                                                                                   |
| `selectType`        | `SelectType`                     | `CHECKBOX` | Selection mode: `CHECKBOX` / `RADIO` / `SELECT`                                                             |
| `fieldKeys`         | `TreeFieldKeys`                  | `{}`       | JSON field name mapping, see below                                                                          |
| `outputIdOnly`      | `boolean`                        | `true`     | When `true` (default), v-model emits only selected node IDs; `false` emits full JSON                        |
| `checkedOutputMode` | `CheckedOutputMode`              | `All`      | CHECKBOX output ID filter mode: `All` / `RootOnly` / `LeafOnly` / `Custom`                                  |
| `filterFn`          | `FilterFn`                       | —          | Custom filter callback. CHECKBOX + Custom mode filters output; RADIO mode determines which nodes show Radio |
| `nodeIcon`          | `boolean \| NodeIconResolver`   | `false`    | Node icons: `true` uses built-in icons; a callback picks or hides the CSS icon class per node |
| `showLine`          | `boolean \| ShowLineOptions`     | `false`    | Guide-line mode: `false` disables; `true` uses defaults (solid + `#d0d4dc` + 1px); an object enables `style: 'solid' \| 'dashed' \| 'dotted'`, `color`, and `width` (px) |
| `chunkedBuild`      | `boolean`                        | `false`    | Explicitly enables batched WASM input; only effective when `outputIdOnly` is `true` and no `filterFn` is set |
| `buildBatchSize`    | `number`                         | `2000`     | Nodes written to WASM per batch |
| `workerMode`        | `boolean`                        | `false`    | Runs tree algorithms in a Web Worker; suited to very large trees or frequent structural changes |
| `preorderedInput`   | `boolean`                        | `false`    | Skips generic parent-child grouping when input is already in depth-first preorder |

### Node Icon (nodeIcon)

`nodeIcon` is off by default and therefore does not change the existing row layout. Set it to `true` to show a closed folder for collapsed parents, an open folder for expanded parents, and a file icon for leaves.

When the icon depends on business type, use a callback to map backend fields to CSS icon classes on the front end; the backend neither needs to know nor should know about the concrete front-end icon assets.

```typescript
import type { NodeIconResolver } from 'vue3-giant-tree-wasm'

const nodeIcon: NodeIconResolver = node => {
  switch (node.extendData?.nodeType) {
    case 'directory':
      return {
        collapsed: 'app-icon-folder',
        expanded: 'app-icon-folder-open',
      }
    case 'document':
      return 'app-icon-document' // Shared by both states
    case 'hidden':
      return false // Hide the icon for this node
    default:
      return true // Fall back to the component's default icon
  }
}
```

```vue
<VueGiantTree :tree="treeData" :node-icon="nodeIcon" />
```

The callback returns `true | false | string | { collapsed: string; expanded?: string }`. An object without `expanded` reuses `collapsed`; leaves also use `collapsed`. Custom classes are responsible for the complete icon styling, e.g. `background-image: url(...)`, which preserves multi-color SVG fills. Dark themes can override `background-image` for the same icon classes in a theme selector.

### Guide Lines (showLine)

`showLine` is off by default and therefore does not change the existing row layout. Once enabled, the prop accepts:

- `true` / `undefined`: default style (solid + `#d0d4dc` + 1px);
- `false`: disabled;
- `{ style?, color?, width? }`: pick style, color and width; missing fields fall back to defaults.

Three shapes are supported:

- `'solid'` (default): a continuous line, the most common tree connector;
- `'dashed'`: a `linear-gradient` cycles a 4px stroke and a 4px gap, giving a moderate-rhythm dashed line;
- `'dotted'`: a `radial-gradient` tiles a tight dot on a 4×4 grid, producing a dotted line that suits dark themes or dense hierarchies.

`color` accepts any CSS color (e.g. `#3b82f6`, `rgb(255, 0, 0)`); `width` is in pixels (positive, defaults to `1`).

Rules:

- Only **leaf nodes** draw the connector to their parent in the marker column (the arrow cell); **branch nodes show just the arrow**, with no connector.
- Indent cells draw a full-height vertical for each ancestor column that still has later siblings, tying the structure together.
- The leaf connector's shape depends on the node's position among its siblings, **and differs between the top level and inner levels**:

| Position | Top level | Inner level |
| --- | --- | --- |
| First leaf | `┌` (lower half) | `├` (full height) |
| Middle leaf | `├` (full height) | `├` |
| Last leaf | `└` (upper half) | `└` |
| Only child | — | `└` |

Only the **topmost** first leaf opens with `┌`; an inner first leaf already has an indent vertical above it, so it uses `├`.

```vue
<VueGiantTree :tree="treeData" :show-line="true" />
<!-- Custom shape, color, width -->
<VueGiantTree
  :tree="treeData"
  :show-line="{ style: 'dotted', color: '#3b82f6', width: 2 }"
/>
```

Visual sample (top `┌`, branch arrows only, inner `├`/`└`):

```
┌ □ Top leaf (first)
▼ □ Top branch
│  ├ □ Inner leaf (first)
│  ├ □ Inner leaf (middle)
│  └ □ Inner leaf (last)
└ □ Top leaf (last)
```

Guide lines render only when enabled (one-time precompute whose geometry depends solely on the hierarchy, never on the collapsed state); when off, row DOM is identical to before. On the dev page, "Data size → `guide 连接线样例`" provides a sample covering every position, ready to inspect line by line with "Feature toggles → 显示连接线".

### Slots

Both slots receive `{ node }`, where `node` is the current `TreeNodeData`.

| Slot | Description |
| --- | --- |
| `#node` | Replaces the main node-content area; the default is `node.name`. |
| `#actions` | An end-of-row area for actions such as edit, delete, or a menu. It is omitted without a slot and its clicks do not select the node. |

`#actions` does not mutate data on its own. The consuming application can use the instance APIs below with `v-model:tree` when an action should change data.

```vue
<VueGiantTree :tree="treeData" root="root" v-model="selected">
  <template #actions="{ node }">
    <button @click="edit(node)">Edit</button>
    <button @click="remove(node)">Delete</button>
  </template>
</VueGiantTree>
```

### Context Menu (item-contextmenu)

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

### CheckedOutputMode

Controls the output of `getCheckedIds` and `getCheckedNodes` in CHECKBOX mode:

| Value      | Description                                                               |
| ---------- | ------------------------------------------------------------------------- |
| `All`      | All checked nodes (default)                                               |
| `RootOnly` | Only root nodes of fully-checked subtrees (deduped)                       |
| `LeafOnly` | Only leaf nodes                                                           |
| `Custom`   | Custom mode: `filterFn` callback determines which checked nodes to output |

### filterFn Custom Filter

`filterFn` is a callback that receives the node's `extendData` (raw data object) and returns `boolean`:

```typescript
type FilterFn = (extendData: Record<string, unknown>) => boolean
```

**Two use cases:**

| Mode                  | Behavior                                                                                |
| --------------------- | --------------------------------------------------------------------------------------- |
| `CHECKBOX` + `Custom` | Filters output — only checked nodes where filterFn returns `true` appear in v-model     |
| `RADIO`               | Filters selectable nodes — only nodes where filterFn returns `true` show a Radio button |
| `SELECT`              | Not affected                                                                            |

**Example:** only output/select nodes with `category === 'A'`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree, CheckedOutputMode } from 'vue3-giant-tree-wasm'
import type { FilterFn } from 'vue3-giant-tree-wasm'

const selected = ref([])

const filterFn: FilterFn = extendData => {
  return extendData.category === 'A'
}
</script>

<template>
  <!-- CHECKBOX mode: filter output via filterFn -->
  <VueGiantTree
    :tree="treeData"
    root="root"
    :checked-output-mode="CheckedOutputMode.Custom"
    :filter-fn="filterFn"
    v-model="selected"
  />

  <!-- RADIO mode: only nodes with category='A' show Radio -->
  <VueGiantTree
    :tree="treeData"
    root="root"
    :select-type="SelectType.RADIO"
    :filter-fn="filterFn"
    v-model="selected"
  />
</template>
```

> **Note:** `filterFn` receives the raw row data (all fields from input JSON except id/name/parentId). The component automatically saves each row's full JSON as `extendData` during parsing, which is passed directly to filterFn.

### Field Key Mapping (fieldKeys)

When your input data uses custom JSON field names instead of the default `id`/`name`/`parentId`/`leftNode`/`rightNode`, use `fieldKeys` to specify the mapping:

```typescript
interface TreeFieldKeys {
  idField?: string // default 'id'
  nameField?: string // default 'name'
  parentIdField?: string // default 'parentId'
  leftNodeField?: string // default 'leftNode'
  rightNodeField?: string // default 'rightNode'
}
```

**Example:** data with `key` / `label` / `parent` / `lft` / `rgt` fields

```vue
<template>
  <VueGiantTree
    :tree="treeData"
    root="root"
    :fieldKeys="{
      idField: 'key',
      nameField: 'label',
      parentIdField: 'parent',
      leftNodeField: 'lft',
      rightNodeField: 'rgt',
    }"
  />
</template>
```

> **Note:** The leftNode/rightNode fields are only used for input type auto-detection. Regardless of whether these fields are present, the component always rebuilds the MPTT tree from parentId relationships to ensure accurate leftNode/rightNode values.

### Data Format

#### Input Data (TreeInputItem)

```typescript
interface TreeInputItem {
  id: string // Unique node ID
  name: string // Display name
  parentId: string // Parent node ID
  disabled?: boolean // Whether disabled; disabled nodes cannot be selected
}
```

#### Node Data (TreeNodeData)

```typescript
interface TreeNodeData {
  id: string
  name: string
  parentId: string
  leftNode: number // MPTT left boundary
  rightNode: number // MPTT right boundary
  deep: number // Node depth
  checked: CheckType // Check state
  selected: CheckType
  collapsed: boolean // Whether collapsed
  disabled: boolean // Whether disabled
  extendData?: Record<string, unknown> // Raw row data (full copy of the input JSON)
  // The following guide-line fields are written only when showLine is enabled
  isLastChild?: boolean // Whether this is the parent's last child
  guideMask?: number // Ancestor-column continuation bitmask
  markerLine?: 'none' | 'upper' | 'lower' | 'full' // Marker-column (arrow cell) vertical segment
}
```

### Selection Modes

| Mode       | Description                                                                            |
| ---------- | -------------------------------------------------------------------------------------- |
| `CHECKBOX` | Multi-select with half-check support; check/uncheck propagates to children and parents |
| `RADIO`    | Single-select; only one node can be selected at a time                                 |
| `SELECT`   | Click-to-select; clicking a node row selects it                                        |

### Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build WASM
pnpm asbuild

# Build component library
pnpm lib:build
```

### License

<a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">BSD 2-Clause</a>

---

## Русский

### Введение

Высокопроизводительный компонент дерева с виртуальной прокруткой на основе Vue 3 + WebAssembly, спроектированный для работы с массивными наборами данных. Основные алгоритмы дерева написаны на AssemblyScript и скомпилированы в WASM, используя структуру данных MPTT (Modified Preorder Tree Traversal) для достижения проверки поддерева за O(1) и среза видимой области за O(k) — легко справляясь с сотнями тысяч и даже миллионами узлов.

### Производительность

Приведённые данные получены на release-WASM в локальном Chromium с воспроизводимыми бенчмарками; фактические результаты зависят от формы данных, браузера, оборудования, включённых функций и сложности содержимого строк.

- Бенчмарки ёмкости покрывают наборы данных до 1 млн узлов
- P95 действия прокрутки на 100 000 узлах: ~0,1 мс
- P95 действия прокрутки в браузерной нагрузке на 4 620 узлах: ~0,4 мс
- В DOM рендерятся только строки в области просмотра

Методика, окружение и полные результаты — в <a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md" target="_blank" rel="noopener noreferrer">архиве performance-gate</a>.

### Замечания для разработчиков

Всё ниже измерено (release WASM + локальный Chromium); без учёта этих пунктов легко получить «локально быстро, в продакшене медленно».

**1. Для больших наборов данных используйте `shallowRef`, а не `ref`.** Компонент обходит весь `tree`, и каждое чтение свойства в глубоко реактивном массиве проходит через get trap прокси, лениво создавая прокси для вложенных объектов. Замер на 100 000 узлов, `JSON.stringify`: обычный массив 17.1ms, `ref().value` **277.2ms**, `shallowRef().value` 19.6ms. Внутри компонента уже есть `toRaw()`, но `shallowRef` на стороне хоста дешевле — данные дерева всегда заменяются целиком, глубокая реактивность не нужна.

**2. Включайте `workerMode` начиная примерно со 100 000 узлов:**

| Данные | `workerMode: false` | `workerMode: true` |
| --- | --- | --- |
| 10 000 | total 22.8ms | roundTrip 42.7ms |
| 100 000 | total 242ms, главный поток заблокирован 249ms | roundTrip **53.4ms**, без блокировки |
| 1 000 000 | total 2697ms, главный поток заблокирован 2749ms | roundTrip 584ms |

До 10 000 узлов основной поток быстрее (не тратится round-trip). Первое включение Worker несёт разовую стоимость загрузки, дальше он переиспользуется.

**3. Меняйте данные, переприсваивая prop `tree`, а не принудительным ремаунтом через `:key`.** Первый способ переиспользует Worker и экземпляр WASM (~600ms для 1 млн узлов); второй каждый раз уничтожает и создаёт Worker заново.

**4. `chunkedBuild` действует только при `outputIdOnly === true` и без `filterFn`** — иначе компонент возвращается к JSON-пути для всего дерева. `inputBridgeMs === 0` в `getBuildMetrics()` означает, что пакетный путь не использовался.

### Диагностика

Последний обзор каталогов `Assembly/` и `lib/` дал десять находок (2 🔴, 3 🟠, 5 🟡); они перечислены в <a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/diagnostics.md" target="_blank" rel="noopener noreferrer"><code>docs/diagnostics.md</code></a> с приоритетом и планом исправлений. Ссылаясь на этот README, указывайте и отчёт диагностики, чтобы читатель видел, какие граничные случаи уже закрыты, а какие остаются оптимизациями на будущее.

### Возможности

- **Ускорение через WASM** — Построение дерева, обход, поиск и выбор выполняются в WebAssembly
- **Виртуальная прокрутка** — Рендерятся только узлы в видимой области, минимальное использование DOM
- **Алгоритм MPTT** — Проверка поддерева за O(1), срез viewport за O(k), развёртывание/свёртывание за O(поддерево + log N)
- **Плавная анимация развёртывания/свёртывания** — Анимирует ветви в текущей области просмотра, не добавляя в DOM всё поддерево; учитывает системное предпочтение уменьшения анимации
- **Три режима выбора** — Чекбокс (множественный), Радиокнопка (одиночный), Выбор по клику
- **Нечёткий поиск** — Фильтрация по ключевому слову с автоматическим дополнением цепочки предков; состояние развёртывания в режиме поиска не влияет на основное дерево
- **Массовое развёртывание/свёртывание** — Методы экземпляра разворачивают или свёртывают текущее представление одним вызовом
- **Настраиваемые ключи полей** — Сопоставление пользовательских имён полей JSON (id / name / parentId / leftNode / rightNode)
- **Единое построение дерева** — Всегда перестраивает MPTT из parentId независимо от формата входных данных, избегая устаревших leftNode/rightNode
- **Кэширование JSON** — При неизменной позиции прокрутки возвращается кэшированный результат
- **Поддержка TypeScript** — Полные определения типов

При развёртывании или свёртывании компонента создаётся кратковременный слой перехода только для строк ветви, уже находящихся в области просмотра; всё поддерево не добавляется в DOM ради анимации. Переход длится около 220 мс, а прокрутка временно блокируется до его завершения для стабильности анимации.

### Установка

```bash
npm install vue3-giant-tree-wasm
# или
pnpm add vue3-giant-tree-wasm
# или
yarn add vue3-giant-tree-wasm
```

Стили компонента поставляются отдельным CSS-файлом — подключите их один раз в точке входа приложения:

```ts
import 'vue3-giant-tree-wasm/style.css'
```

### Быстрый старт

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = [
  { id: '1', name: 'Корень', parentId: 'root' },
  { id: '2', name: 'Дочерний A', parentId: '1' },
  { id: '3', name: 'Дочерний B', parentId: '1' },
  { id: '4', name: 'Внук A-1', parentId: '2' },
]

const selected = ref([])
</script>

<template>
  <div style="width: 400px; height: 600px">
    <VueGiantTree :tree="treeData" root="root" v-model="selected" />
  </div>
</template>
```

### Методы экземпляра компонента

Задайте `ref` компонента, чтобы вызывать эти методы. `expandAll()` и `collapseAll()` применяются к текущему представлению: обычно к полному дереву, а во время поиска — только к текущим результатам. Состояние развёртывания в режиме поиска никогда не меняет состояние свёртки основного дерева.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const expandAll = () => treeRef.value?.expandAll()
const collapseAll = () => treeRef.value?.collapseAll()
const search = (keyword: string) => treeRef.value?.fuzzySearch(keyword)
</script>

<template>
  <button @click="expandAll">Развернуть всё</button>
  <button @click="collapseAll">Свернуть всё</button>
  <VueGiantTree ref="treeRef" :tree="treeData" root="root" v-model="selected" />
</template>
```

| Метод                                     | Описание                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `expandAll()`                             | Разворачивает все разворачиваемые узлы текущего представления                                  |
| `collapseAll()`                           | Сворачивает все сворачиваемые узлы текущего представления                                      |
| `fuzzySearch(keyword)`                    | Нечёткий поиск с антидребезгом 300 мс; пустая строка очищает поиск                              |
| `fuzzySearchRaw(keyword)`                 | Немедленный нечёткий поиск; пустая строка очищает поиск                                         |
| `getTreeSize()`                           | Возвращает общее количество узлов дерева                                                        |
| `getBuildReady()`                         | Возвращает, завершено ли первое построение (boolean)                                            |
| `getBuildMetrics()`                       | Возвращает длительности фаз последнего построения (мс)                                          |
| `getWorkerMetrics()`                      | Возвращает метрики очереди Worker, round-trip и сериализации                                    |
| `setChecked(id)` / `setCheckedByIds(ids)` | Программно устанавливает выбранные узлы                                                         |
| `clearAllChecked()`                       | Очищает всё состояние выбора                                                                    |
| `switchDisplay(displayType)`              | Переключает вид `TREE` или `SEARCH`                                                             |
| `refreshCheckedResult()`                  | Повторно испускает текущий результат v-model по активным настройкам вывода                      |
| `updateNode(id, patch)`                   | Обновляет исходные поля узла; ID узла неизменяем                                                |
| `addNode(node)`                           | Добавляет узел под корнем или под существующим родителем                                        |
| `removeNode(id)`                          | Удаляет узел и всё его поддерево                                                                |

`chunkedBuild` по умолчанию выключен. При включении узлы записываются в WASM пакетами, снижая блокировку главного потока при первом построении больших входных данных; он действует только когда `outputIdOnly` равен `true` и `filterFn` не задан (только в этих случаях компоненту не нужны полные исходные строки), а размер пакета задаёт `buildBatchSize` (по умолчанию 2000).

`workerMode` по умолчанию выключен. При включении алгоритмы дерева выполняются в Web Worker, а главный поток только рендерит; подходит для очень больших входных данных или частых структурных изменений. Метрики Worker возвращает `getWorkerMetrics()`.

`getBuildReady()` сообщает, завершено ли первое построение; `getBuildMetrics()` возвращает длительности фаз последнего построения (`inputBridgeMs`, `finalizeMs`, `cacheAssemblyMs`, `totalMs` и т. д.) для поиска узких мест.

`preorderedInput` по умолчанию `false`. Установите `true`, если входные данные строго в порядке глубинного обхода (родители раньше потомков, поддерево непрерывно), чтобы пропустить общую группировку родитель-потомок при первом построении; при несоответствии данных компонент автоматически вернётся к общей сборке.

`getWorkerMetrics()` содержит реальные данные только при включённом `workerMode`. С его помощью можно разделить время round-trip на главном потоке (`lastRoundTripMs`), время ожидания/вычислений Worker (`lastWorkerResponseMs`), время сериализации видимых строк (`lastWorkerSerializeMs`) и эффект объединения подряд идущих структурных операций (`structuralBatches`, `structuralOperations`, `lastBatchSize`).

### Добавление, изменение и удаление узлов

Используйте `v-model:tree`, чтобы получать обновлённый входной массив. Изменение обновляет только содержимое узла; добавление и удаление пересчитывают границы MPTT в том же экземпляре компонента и восстанавливают позицию прокрутки, развёртывание и выбор, не перемонтируя компонент через `key`.

```vue
<VueGiantTree ref="treeRef" v-model:tree="treeData" v-model="selected" />

<!-- treeRef.value?.addNode({ id: crypto.randomUUID(), name: 'Новый узел', parentId }) -->
<!-- treeRef.value?.updateNode(id, { name: 'Новое имя' }) -->
<!-- treeRef.value?.removeNode(id)  // удаляет всех потомков -->
```

### Свойства (Props)

| Свойство            | Тип                              | По умолчанию | Описание                                                                                                           |
| ------------------- | -------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `tree`              | `TreeInputItem[]`                | `[]`         | Данные дерева в формате списка смежности                                                                           |
| `root`              | `string`                         | `''`         | Идентификатор корня; `parentId` узлов верхнего уровня должен быть равен этому значению                             |
| `modelValue`        | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | —            | Результат выбора (v-model)                                                                                         |
| `width`             | `string`                         | `'100%'`     | Ширина контейнера                                                                                                  |
| `height`            | `string`                         | `'100%'`     | Высота контейнера                                                                                                  |
| `lineHeight`        | `number`                         | `26`         | Высота строки в пикселях                                                                                           |
| `fontSize`          | `string`                         | `'14px'`     | Размер шрифта                                                                                                      |
| `selectType`        | `SelectType`                     | `CHECKBOX`   | Режим выбора: `CHECKBOX` / `RADIO` / `SELECT`                                                                      |
| `fieldKeys`         | `TreeFieldKeys`                  | `{}`         | Сопоставление имён полей JSON, см. ниже                                                                            |
| `outputIdOnly`      | `boolean`                        | `true`       | Если `true` (по умолч.), v-model передаёт только ID выбранных узлов; `false` — полные данные                       |
| `checkedOutputMode` | `CheckedOutputMode`              | `All`        | Режим фильтрации вывода ID для CHECKBOX: `All` / `RootOnly` / `LeafOnly` / `Custom`                                |
| `filterFn`          | `FilterFn`                       | —            | Пользовательский callback фильтрации. CHECKBOX + Custom — фильтрует вывод; RADIO — определяет, показывать ли Radio |
| `nodeIcon`          | `boolean \| NodeIconResolver`   | `false`      | Значки узлов: `true` — встроенные; callback выбирает или скрывает CSS-класс значка для узла |
| `showLine`          | `boolean \| ShowLineOptions`     | `false`      | Режим направляющих линий: `false` выкл.; `true` использует значения по умолчанию (сплошная + `#d0d4dc` + 1px); объект задаёт `style: 'solid' \| 'dashed' \| 'dotted'`, `color`, `width` (пиксели) |
| `chunkedBuild`      | `boolean`                        | `false`      | Явно включает пакетную запись входных данных в WASM; действует только при `outputIdOnly` = `true` и без `filterFn` |
| `buildBatchSize`    | `number`                         | `2000`       | Количество узлов, записываемых в WASM за пакет |
| `workerMode`        | `boolean`                        | `false`      | Выполняет алгоритмы дерева в Web Worker; подходит для очень больших данных или частых структурных изменений |
| `preorderedInput`   | `boolean`                        | `false`      | Пропускает общую группировку родитель-потомок, если данные уже в порядке глубинного обхода |

### Значки узлов (nodeIcon)

`nodeIcon` по умолчанию выключен и потому не меняет текущую раскладку строк. При `true` свёрнутый родитель показывает закрытую папку, развёрнутый — открытую, а листья — значок файла.

Если значок зависит от бизнес-типа, используйте callback, чтобы на фронте сопоставить поля бэкенда с CSS-классами значков; бэкенду не нужно и не следует знать конкретные фронтенд-ресурсы значков.

```typescript
import type { NodeIconResolver } from 'vue3-giant-tree-wasm'

const nodeIcon: NodeIconResolver = node => {
  switch (node.extendData?.nodeType) {
    case 'directory':
      return {
        collapsed: 'app-icon-folder',
        expanded: 'app-icon-folder-open',
      }
    case 'document':
      return 'app-icon-document' // общий для обоих состояний
    case 'hidden':
      return false // не показывать значок для этого узла
    default:
      return true // вернуться к значку по умолчанию
  }
}
```

```vue
<VueGiantTree :tree="treeData" :node-icon="nodeIcon" />
```

Callback возвращает `true | false | string | { collapsed: string; expanded?: string }`. Объект без `expanded` переиспользует `collapsed`; листья также используют `collapsed`. Пользовательские классы отвечают за полный стиль значка, например `background-image: url(...)`, что сохраняет многоцветную заливку SVG. Тёмная тема может переопределить `background-image` для тех же классов значков в переключателе тем.

### Направляющие линии (showLine)

`showLine` по умолчанию выключен и потому не меняет текущую раскладку строк. После включения параметр принимает:

- `true` / `undefined`: стиль по умолчанию (сплошная + `#d0d4dc` + 1px);
- `false`: выключено;
- `{ style?, color?, width? }`: выбор формы, цвета и толщины; пропущенные поля возвращаются к значениям по умолчанию.

Поддерживаются три формы:

- `'solid'` (по умолчанию): непрерывная линия — самый распространённый вариант;
- `'dashed'`: `linear-gradient` циклически рисует штрих 4px и пропуск 4px, давая пунктир среднего ритма;
- `'dotted'`: `radial-gradient` плотно укладывает точку в сетке 4×4, превращая линию в плотную точечную — удобно для тёмных тем и плотных иерархий.

`color` принимает любой CSS-цвет (например `#3b82f6`, `rgb(255, 0, 0)`); `width` — в пикселях (положительное число, по умолчанию `1`).

Правила:

- Связку с родителем в маркерном столбце (ячейка стрелки) рисуют **только листья**; **ветви показывают лишь стрелку**, без связки.
- Ячейки отступа рисуют вертикаль на всю высоту для каждого столбца-предка, у которого ещё есть последующие братья, — так структура связывается воедино.
- Форма связки листа зависит от его позиции среди братьев и **различается для верхнего и внутренних уровней**:

| Позиция | Верхний уровень | Внутренний уровень |
| --- | --- | --- |
| Первый лист | `┌` (нижняя половина) | `├` (на всю высоту) |
| Средний лист | `├` (на всю высоту) | `├` |
| Последний лист | `└` (верхняя половина) | `└` |
| Единственный ребёнок | — | `└` |

Только **самый верхний** первый лист открывается символом `┌`; у внутреннего первого листа сверху уже идёт вертикаль отступа, поэтому используется `├`.

```vue
<VueGiantTree :tree="treeData" :show-line="true" />
<!-- Произвольная форма, цвет и толщина -->
<VueGiantTree
  :tree="treeData"
  :show-line="{ style: 'dotted', color: '#3b82f6', width: 2 }"
/>
```

Наглядный пример (верх `┌`, у ветвей только стрелки, внутри `├`/`└`):

```
┌ □ Верхний лист (первый)
▼ □ Верхняя ветвь
│  ├ □ Внутренний лист (первый)
│  ├ □ Внутренний лист (средний)
│  └ □ Внутренний лист (последний)
└ □ Верхний лист (последний)
```

Линии рисуются только при включении (однократный предрасчёт; геометрия зависит исключительно от иерархии, но не от состояния свёртки); при выключении DOM строк идентичен прежнему. На странице разработки в разделе «Размер данных → `guide 连接线样例`» есть пример, покрывающий все позиции, — сверяйте построчно вместе с «Переключатели → 显示连接线».

### Слоты

Оба слота получают `{ node }`, где `node` — текущий `TreeNodeData`.

| Слот | Описание |
| --- | --- |
| `#node` | Заменяет основную область содержимого узла; по умолчанию отображается `node.name`. |
| `#actions` | Область в конце строки для действий (редактирование, удаление, меню). Без слота не рендерится и не занимает место; клики не выбирают узел. |

`#actions` сам по себе не изменяет данные. Для изменения данных приложение может вызывать API экземпляра вместе с `v-model:tree`.

```vue
<VueGiantTree :tree="treeData" root="root" v-model="selected">
  <template #actions="{ node }">
    <button @click="edit(node)">Изменить</button>
    <button @click="remove(node)">Удалить</button>
  </template>
</VueGiantTree>
```

### Контекстное меню (item-contextmenu)

Компонент только испускает событие и не содержит UI меню. Правый клик по строке вызывает `item-contextmenu(node, event)`, где `node` — это `TreeNodeData` строки, а `event` — исходное `MouseEvent`. Компонент **не** вызывает `preventDefault()`, поэтому браузерное меню открывается как обычно; чтобы заменить его, вызовите `event.preventDefault()` в обработчике. Рендеринг, позиционирование и закрытие меню — задача потребителя; типичный подход — `Teleport` в `body` с позицией по `event.clientX/clientY`. Правый клик не вызывает выбор строки.

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
      <li @click="edit(menu.node)">Изменить</li>
      <li @click="remove(menu.node)">Удалить</li>
    </ul>
  </Teleport>
</template>
```

### CheckedOutputMode

Управляет выводом `getCheckedIds` и `getCheckedNodes` в режиме CHECKBOX:

| Значение   | Описание                                                                    |
| ---------- | --------------------------------------------------------------------------- |
| `All`      | Все выбранные узлы (по умолчанию)                                           |
| `RootOnly` | Только корни полностью выбранных поддеревьев (без дублей)                   |
| `LeafOnly` | Только листовые узлы                                                        |
| `Custom`   | Пользовательский режим: callback `filterFn` определяет, какие узлы выводить |

### filterFn — пользовательский фильтр

`filterFn` — callback, получающий `extendData` узла (исходный объект данных) и возвращающий `boolean`:

```typescript
type FilterFn = (extendData: Record<string, unknown>) => boolean
```

**Два сценария:**

| Режим                 | Поведение                                                                               |
| --------------------- | --------------------------------------------------------------------------------------- |
| `CHECKBOX` + `Custom` | Фильтрует вывод — только выбранные узлы, где filterFn вернул `true`, попадают в v-model |
| `RADIO`               | Фильтрует выбираемые узлы — только узлы, где filterFn вернул `true`, показывают Radio   |
| `SELECT`              | Не затрагивается                                                                        |

**Пример:** только узлы с `category === 'A'`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree, CheckedOutputMode } from 'vue3-giant-tree-wasm'
import type { FilterFn } from 'vue3-giant-tree-wasm'

const selected = ref([])

const filterFn: FilterFn = extendData => {
  return extendData.category === 'A'
}
</script>

<template>
  <!-- CHECKBOX: фильтрация вывода через filterFn -->
  <VueGiantTree
    :tree="treeData"
    root="root"
    :checked-output-mode="CheckedOutputMode.Custom"
    :filter-fn="filterFn"
    v-model="selected"
  />

  <!-- RADIO: только узлы с category='A' показывают Radio -->
  <VueGiantTree
    :tree="treeData"
    root="root"
    :select-type="SelectType.RADIO"
    :filter-fn="filterFn"
    v-model="selected"
  />
</template>
```

> **Примечание:** `filterFn` получает исходные данные строки (все поля входного JSON кроме id/name/parentId). При разборе входных данных полный JSON каждой строки сохраняется как `extendData` и передаётся напрямую в filterFn.

### Сопоставление ключей полей (fieldKeys)

Если во входных данных используются пользовательские имена полей JSON вместо стандартных `id`/`name`/`parentId`/`leftNode`/`rightNode`, используйте `fieldKeys` для указания соответствия:

```typescript
interface TreeFieldKeys {
  idField?: string // по умолчанию 'id'
  nameField?: string // по умолчанию 'name'
  parentIdField?: string // по умолчанию 'parentId'
  leftNodeField?: string // по умолчанию 'leftNode'
  rightNodeField?: string // по умолчанию 'rightNode'
}
```

**Пример:** данные с полями `key` / `label` / `parent` / `lft` / `rgt`

```vue
<template>
  <VueGiantTree
    :tree="treeData"
    root="root"
    :fieldKeys="{
      idField: 'key',
      nameField: 'label',
      parentIdField: 'parent',
      leftNodeField: 'lft',
      rightNodeField: 'rgt',
    }"
  />
</template>
```

> **Примечание:** Поля leftNode/rightNode используются только для автоопределения типа входных данных. Независимо от их наличия, компонент всегда перестраивает дерево MPTT на основе parentId для обеспечения точности значений leftNode/rightNode.

### Формат данных

#### Входные данные (TreeInputItem)

```typescript
interface TreeInputItem {
  id: string // Уникальный ID узла
  name: string // Отображаемое имя
  parentId: string // ID родительского узла
  disabled?: boolean // Отключён ли; отключённые узлы нельзя выбрать
}
```

#### Данные узла (TreeNodeData)

```typescript
interface TreeNodeData {
  id: string
  name: string
  parentId: string
  leftNode: number // Левая граница MPTT
  rightNode: number // Правая граница MPTT
  deep: number // Глубина узла
  checked: CheckType // Состояние выбора
  selected: CheckType
  collapsed: boolean // Свёрнут ли узел
  disabled: boolean // Отключён ли
  extendData?: Record<string, unknown> // Исходные данные строки (полная копия входного JSON)
  // Следующие поля направляющих линий записываются только при включённом showLine
  isLastChild?: boolean // Последний ли дочерний узел у родителя
  guideMask?: number // Битовая маска продолжения столбцов предков
  markerLine?: 'none' | 'upper' | 'lower' | 'full' // Вертикальный отрезок в маркерном столбце (ячейка стрелки)
}
```

### Режимы выбора

| Режим      | Описание                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `CHECKBOX` | Множественный выбор с поддержкой полувыбора; выбор/отмена распространяется на дочерние и родительские узлы |
| `RADIO`    | Одиночный выбор; одновременно может быть выбран только один узел                                           |
| `SELECT`   | Выбор по клику; клик по строке узла выбирает его                                                           |

### Разработка

```bash
# Установка зависимостей
pnpm install

# Запуск сервера разработки
pnpm dev

# Сборка WASM
pnpm asbuild

# Сборка библиотеки компонентов
pnpm lib:build
```

### Лицензия

<a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">BSD 2-Clause</a>
