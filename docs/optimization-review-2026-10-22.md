# `lib/` 与 `assembly/` 优化空间审查（2026-10-22）

> 范围：`assembly/*.ts`、`assembly/json/*`、`lib/*.ts`、`lib/*.vue`。
> 方法：静态审查 + 用 release WASM 做 A/B 原型实测；每项标注「实测 / 代码审查」。
> 关联：[`docs/diagnostics.md`](diagnostics.md)（上一轮 10 项审查，已落地 5 项）、
> [`docs/performance-refactor-plan.md`](performance-refactor-plan.md)（阶段 3/4/5 结论）。
> 本文只收录新增发现，不重复上述两篇已记录项。

## 0. 结论速览

按「收益 × 可信度 ÷ 风险」排序，最值得做的 6 件事：

| # | 级别 | 位置 | 问题 | 实测收益（1M 节点） | 风险/工作量 |
|---|------|------|------|----------------------|-------------|
| 1 | 🔴 | `assembly/tree-serializer.ts:147` | 视口 JSON 用 `result +=` 逐行拼接，行数越多越呈平方级 | 400 行 15.1ms → 1.1ms（**13.7×**）；1000 行 79.5ms → 2.8ms（**28×**）；42 行 0.42ms → 0.11ms（3.7×） | 低 / ~30 行，输出逐字节一致 |
| 2 | 🔴 | `assembly/tree-builder.ts:344,367` | JSON 解析对每个已匹配字段扫描两遍；每个 key 都分配字符串 | 1M `setNeighborTree` 1.65s → 1.25s（**1.3×**） | 低-中 / ~80 行，需保留转义回退 |
| 3 | 🔴 | `assembly/giant-tree.ts:456,480,500,507` | 每次结构增删都 O(N) 重排边界 + O(N) 重写 `idToIndex`；批次内 K 次操作 = O(K·N) | 1M 单次子节点插入 80–145ms；100 次批量 0.7–4.8s；计时原型去掉后缀 Map 重写后 4.16s → 0.94s（**4.4×**） | 中-高 / 需调整索引模型或批次重建 |
| 4 | 🟠 | `lib/VueGiantTree.vue:810,933` | 默认「仅 ID」输出仍无条件构建 records；动画期间每次点击重建 O(N) Map | records 67ms/次；`syncAnimationRows` 99ms/次 | 低 / ~20 行 |
| 5 | 🟠 | `lib/VueGiantTree.vue:568` | 主线程构建后缓存装配 ~0.9s：`getAllNodeIds` + `getAllNodeLayouts` + `inputById` + index Map；其中 `getAllNodeIds`（298ms）与主线程模式下重复的 `inputNodeById`（28MB）可省 | 298 + 58 + 518 + 51 ≈ 925ms；可省 ~300ms 与 28MB | 中 / 复用既有 input-layout 通道 |
| 6 | 🟠 | `assembly/giant-tree.ts:1556` | 全选时每次点击都 O(N) 扫描并复制 N 个字符串作为选中结果 | 1M 全选：**307ms/次**（`getCheckedIdList`） | 中 / 需新增索引型输出或增量缓存 |

另外顺带确认了 2 个正确性问题（见 §5）：`switchDisplay(SEARCH)` 丢行、外部替换 `tree` 后 `inputNodeById` 变为陈旧。

---

## 1. 测量环境与口径

- Node `v26.7.0`，AssemblyScript `0.28.20`，`--target release`（`build/release.wasm`，构建时间晚于全部源码）。
- 合成树：`1,000,000` 节点、10 叉树；`id = n-<base36>`、`name = Node <i>`、`parentId = (i-1)/10`；`CHECKBOX` 模式；`lineHeight=26`。
- 除特别说明外，`preserveExtendData=false`（与 `lib/VueGiantTree.vue` 的 `newTree(..., false)` 一致）。
- 浏览器真实渲染成本不在本报告内；文中的「/帧」指 `setBoundary + getShownNodes` 的 WASM 侧耗时。
- 原型改动均放在临时目录编译，未修改工作区源码；每项 A/B 都比较过 `getShownNodes` / `getAllNodes` 输出一致性。

---

## 2. 🔴 P0：三个「低风险、可立即落地」的热点

### 2.1 视口序列化的平方级字符串拼接（`serializeShownNodesCompact`）

**位置**：`assembly/tree-serializer.ts:147-171`

```ts
let result = '['
for (let i: i32 = from; i < to; i++) {
  const node = shownNodes[i]
  result += nodeToJsonCompact(node, node.fullIndex, store, i > from, collapsedIds)
}
return result + ']'
```

**问题**：每次 `+=` 都会重新分配并复制已累积的全部内容，复杂度近似 O(rows²)。
同文件 `serializeMpttArrayCompact`（`:189-204`）已经因为同样原因改成 `parts` 数组，并留了注释
（"`result +=` reallocs and copies … 10k nodes took ~2.2s versus ~20ms"），但视口这条更热的路径被漏掉了。

**实测**（滚动 500 次取平均，每帧都改变 `scrollTop` 使缓存失效）：

| 视口行数 | 当前 `+=` | 顶层 `parts` 数组 | 单数组 + 内联字段（推荐） |
|---------:|----------:|------------------:|--------------------------:|
| 42  | 421µs | 237µs | **114µs（3.7×）** |
| 100 | 1.48ms | 565µs | **366µs（4.0×）** |
| 400 | 15.1ms | 2.12ms | **1.10ms（13.7×）** |
| 1000 | 79.5ms | 5.70ms | **2.81ms（28×）** |

当前实现每行成本从 10µs 涨到 80µs，推荐实现稳定在 ~2.8µs/行。
默认 1080p（约 40 行）影响较小，但 4K / 小 `lineHeight` / 浏览器缩放会直接把单帧推到 10ms 以上。

**建议**：为整个视口建一个 `string[]`，把每个字段直接 `push` 进去，最后 `join('')` 一次；
`nodeToJsonCompact` 可以内联，避免每节点 13 次中间字符串分配。

```ts
const parts: string[] = []
parts.push('[')
for (let i = from; i < to; i++) {
  const node = shownNodes[i]
  const index = node.fullIndex
  parts.push(i > from ? ',{"id":"' : '{"id":"')
  parts.push(escapeString(node.id))
  parts.push('","name":"')
  parts.push(escapeString(node.name))
  // …parentId / leftNode / … / disabled
  if (node.extendData.length > 0) {
    parts.push(',"extendData":')
    parts.push(node.extendData)
  }
  parts.push('}')
}
parts.push(']')
return parts.join('')
```

**验证**：原型输出与现实现逐字节一致（覆盖折叠状态、`extendData`、转义字符串、1000 行窗口）。

---

### 2.2 JSON 解析：每个字段扫两遍 + 每个 key 分配字符串

**位置**：`assembly/tree-builder.ts:344-367`（`parseOneObject`）、`:96-148`（读取函数）

```ts
// 1) key 先完整复制成 string，再单独 skipString 一次
const key: string = readStringContent(src, pos, len)
pos = skipString(src, pos, len)
...
if (key === fk.idField) {
  nt.id = readValueAsString(src, pos, len)   // 扫到值的结尾
}
...
pos = skipValue(src, pos, len)               // 又把同一个值扫一遍
```

**问题**：
1. 每个节点约 4 个 key，1M 节点 = 400 万次临时字符串分配（每个 key 又做多次 `string` 比较）。
2. 每个字段值被扫描两次：`readValueAsString` 找到结尾后丢弃位置，再由 `skipValue` 从头再扫。
3. 字符串值还要在 `readStringContent` 与 `skipString` 里各扫一次。

**原型改动**：
- `readStringContentTracked` 记录 `_valueEnd`；`readValueAsString` 同时回写值结束位置；命中字段直接 `pos = _valueEnd`，不再 `skipValue`。
- `keyEnd` / `keyEquals` 直接在源串上比较 key，命中则完全不分配；遇到转义（`\`）回退到原 `readStringContent` 路径。

**实测**：

| 规模 | 基线 | 原型 | 提速 |
|-----:|-----:|-----:|-----:|
| 300k | 471ms | 377ms | 1.25× |
| 300k | 694ms | 465ms | 1.49× |
| 300k | 739ms | 480ms | 1.54× |
| 1M | 1653ms | 1250ms | **1.32×** |
| 1M | 2892ms | 2265ms | 1.28× |
| 1M | 2604ms | 1947ms | 1.34× |

1M 场景约省 0.4–0.65s，且不需要改调用方。已用「转义引号 / 换行 / Unicode / 嵌套对象 / 未知字段 / `disabled`」样例对拍，输出与基线一致。

**建议**：按上述方式合并扫描；进一步可把 `readValueAsString` 的非字符串分支也改成
「返回值 + 结束位置」，彻底移除对已匹配字段的 `skipValue` 调用。
（`skipValue` 仍需保留给未知字段与 `disabled`。）

---

### 2.3 结构增删的 O(K·N)：边界重排 + 索引后缀重写

**位置**：
- `assembly/giant-tree.ts:456-464`（`appendChild` 全数组边界 +2）
- `assembly/giant-tree.ts:480-481`（每次 append 重写 `idToIndex` 后缀）
- `assembly/giant-tree.ts:500-508`（`removeSubtree` 全数组边界 −width + 重写索引后缀）
- `assembly/giant-tree.ts:376-416`（`endStructureBatch` 再走 4 遍全树：`fullIndex`、`resetShownFlagsAndCollect`、`compactStore.load`、`recomputeAggregates`）

**实测**（1M 节点，`beginStructureBatch`/`endStructureBatch` 包裹，单棵树内顺序执行）：

| 操作 | 耗时 |
|------|-----:|
| 顶层追加 ×100（`parentId === root`，无需重排） | ~62ms |
| 子节点追加 ×1（父节点在树中部/前部） | **80–145ms** |
| 子节点追加 ×100（父节点靠后） | 700–818ms |
| 子节点追加 ×100（父节点靠前） | **4.16–4.76s** |
| 删除叶子 ×1 | 71ms |
| 删除叶子 ×100（近尾部） | 583ms |

**归因**（用「跳过后缀 `idToIndex.set`」的计时原型验证；该原型只用于计时，
在同一父节点下连续插入时结果仍然正确，但不是可合入实现）：
靠前插入 100 次从 **4161ms → 940ms（4.4×）**，即约 77% 的时间花在
`Map<string,i32>` 的逐项重写上；剩下 ~0.94s 是边界重排与数组搬移。

**为什么批次没帮上忙**：`beginStructureBatch` 只把「提交后的同步」延后，
`appendChild`/`removeSubtree` 内部仍然每次做完整的 MPTT 重编号，所以批次内是 K 次 O(N)。
worker 的 16ms 合并窗口只能减少消息数量，不能降低这部分的 CPU。

**建议（按投入从低到高）**：

1. **去掉每次操作的索引后缀重写**：把 `idToIndex: Map<string, i32>` 改为
   `Map<string, MpttTree>`（或 `Map<string, i32>` 但只存稳定 ID），索引位置统一读
   `node.fullIndex`，在 `endStructureBatch` 的现有 O(N) 循环里一次性回填。
   新增/删除只做 O(1) 的 map 插入/删除。上面 4.4× 的数据就是这一项的上限。
2. **批次级重建**：`beginStructureBatch` 内只记录 `add/remove` 拓扑意图（父 ID、节点、目标 ID），
   `endStructureBatch` 一次性重建 `fullTree` 的 preorder 顺序与边界，
   把 O(K·N) 降到 O(N + K)。对「一次粘贴/删除 100 个节点」这类场景是数量级提升。
3. **谨慎的小优化**：边界重排的循环理论上只需要覆盖「祖先 + 插入点之后」。
   注意不能简单从 `insertIndex` 开始——祖先的 `rightNode` 同样要 +2
   （原型里这个朴素改法会把 `a.rightNode` 从 7 留成 5，已实测复现），
   需要先单独上溯祖先链，再扫后缀。

**顺带验证但不建议做**：`CompactNodeStore.load` 复用 typed array（保持长度不变时只 `fill(0)`）。
实测 1M 仅改善 0–4%，因为真正的成本是逐节点填充与边界栈，不是分配。收益不足以抵消状态复用带来的风险。

---

## 3. 🟠 P1：选择输出与构建缓存

### 3.1 每次点击都 O(N) 生成选中结果

**位置**：`assembly/giant-tree.ts:1492-1534`（`getCheckedNodes`）、`:1556-1611`（`getCheckedIdList`）、
`lib/VueGiantTree.vue:810-841`（`emitCheckedResult`）

`getCheckedIdList` 在 CHECKBOX/All 模式下遍历全部节点并把每个命中节点 ID 复制成 JS 字符串；
Vue 侧每次 `checkClick` 都会同步调用它（worker 侧用 48ms 合并，主线程没有合并）。

**实测（1M，全选状态）**：
- `getCheckedIdList`：**307ms / 次**
- `emitCheckedResult` 里 `records = ids.map(...).filter(...)`：**67ms / 次**
  —— 但默认 `outputIdOnly=true` 且非 `Custom` 模式时，`records` 根本没被使用。
- `getCheckedNodes`（JSON 全量，`JsonEncoder` 每节点 11 次 `push`）：**6.5s / 次**（组件未使用，但公开 API 存在）。

**建议**：
1. `emitCheckedResult` 中把 `records` 改为惰性：只在 `checkedOutputMode === Custom && filterFn`
   或 `!outputIdOnly` 时构建。默认路径直接 emit `ids`。约省 67ms/次。
2. 新增 `getCheckedIndices(): i32[]`（或 `Uint32Array`），由 JS 侧 `allNodesCache[index].id` 取 ID。
   全选时输出 4MB 索引而不是 ~50MB 字符串，序列化与结构化克隆都大幅下降。
3. 更彻底：WASM 内维护「选中变更 delta」，Vue 侧增量维护 ID 集合；
   全量结果只在显式请求时生成。
4. `serializeCheckedArrayCompact` 复用 §2.1 的 fragments 写法；`JsonEncoder` 的每字段 `push`
   在 1M 量级会放大成千万级数组元素。

### 3.2 主线程构建后的缓存装配 ~0.9s

**位置**：`lib/VueGiantTree.vue:568-619`（`refreshAllNodesCache`）、`:449-454`（`rebuildAllNodesIndex`）

**实测（1M）**：

| 步骤 | 耗时 | 备注 |
|------|-----:|------|
| `getAllNodeIds` | 298ms | 复制 1M 个 JS 字符串 |
| `getAllNodeLayouts` | 58ms | 复制 4M 个 i32 |
| `inputById` Map + `allNodesCache` 组装 | 518ms | 再次遍历 1M 输入项建 Map |
| `rebuildAllNodesIndex` | 51ms | 又一个 1M 项 Map |
| **合计** | **~925ms** | 占 1M 首次构建的很大一块 |

而 `refreshChunkedNodesCache`（`:731-783`）已经实现了更省的路径：
`getInputNodeLayouts` 直接给出「输入序 → fullTree 索引 + 4 个布局值」，
再按输入数组一次组装，不需要 `getAllNodeIds`，也不需要 `inputById`。

**建议**：
1. 主线程也始终开启 `setTrackInputLayouts(true)`，用 `getInputNodeLayouts` 组装缓存
   （或提供一个不依赖 `chunkedBuild` 的合并出口），预计可省 ~300ms 与 28MB。
2. `getAllNodeIds` / `getAllNodeLayouts` 改成一次桥接返回 `Uint32Array`
   （id 仍需要字符串时再单独取），减少 4M 次 i32 装箱与数组拷贝。
3. 主线程模式下 `inputNodeById` 与 `allNodesCache[i].extendData` 是同一份数据的两个索引，
   前者 1M 时约 **28MB**。主线程可以只保留 `allNodesIndexById + allNodesCache`
   （详见 §5.2 的陈旧问题——两者必须一起修）。

### 3.3 JS 侧两处 O(N) 分配

**位置**：`lib/VueGiantTree.vue:933-941`（`syncAnimationRows`）、`:457-475`（`shallowEqualExceptContent`）

- `syncAnimationRows`：
  ```ts
  const latestById = new Map(allNodesCache.map(item => [item.id, item]))
  ```
  动画期间每次勾选/选中都会跑一次，1M 时实测 **99ms/次**。
  已有 `allNodesIndexById`，应改为按行 ID 查索引再取缓存项，O(rows)。
- `shallowEqualExceptContent`：每个节点用两次 `Object.keys(...).filter(...)` 建临时数组。
  1M 全量比较实测 **119ms**；改成 `for…in + hasOwnProperty` 的零分配版本 **43ms（2.8×）**。
  另外 `tryContentOnlyReconcile`（`:483`）与 `tryWorkerContentUpdates`（`:1113`）
  的 diff 逻辑高度重复（各 ~80 行），建议抽成共享函数，避免两处行为漂移。

---

## 4. 🟡 P2：其余优化点

### 4.1 主线程 CRUD 走整树重建，WASM 增量 API 只服务 worker

**位置**：`lib/VueGiantTree.vue:1669-1700`（`reconcileTreeData`）、`:1703-1808`（`updateNode/addNode/removeNode`）

`addNode`/`removeNode` 在主线程只 `emit('update:tree', ...)`，父组件回传后
`tryContentOnlyReconcile` 因长度变化失败，直接 `reconcileTreeData()`：
`clear` + 重新 `setNeighborTree(JSON)` + 重建缓存 + 逐个 `collapseTree` 恢复展开态 + `setCheckedNodes`。
WASM 的 `appendChild`/`removeSubtree`/`beginStructureBatch` 只在 `lib/tree.worker.ts` 里用。

**问题**：
- 单次增删在 1M 时触发整树 O(N) 重建（秒级），而增量路径虽然也慢（§2.3），仍比整树快。
- `reconcileTreeData` 恢复展开态是 `for (id of expandedIds) collapseTree(tree, id, false)`：
  每个分支都跑一遍子树，最坏 O(Σ子树) ≈ O(N·depth)。应改为一次 `resetShownFlagsAndCollect`
  + 「保留 collapsed 集合」的批量可见性重建。
- `updateNode` 的 `input.findIndex`、`addNode` 的两次 `input.some`、
  `removeNode` 的 children Map 都是 O(N)/次；`inputNodeById` 已有 ID 索引，可直接复用。

**建议**：把 worker 的增量 apply 逻辑抽成与线程无关的共享函数；
主线程在「小批量增删」时走增量，超过阈值（如 `K > N/8`）再退回整树重建。
同时给 `reconcileTreeData` 增加批量恢复展开/选中的 API。

### 4.2 搜索

**位置**：`assembly/tree-search.ts:41,82-109,115`

- `MAX_RESULTS = 5000` 静默截断，UI 无从得知「还有更多结果」；建议返回值带上
  `truncated` 标志（或在 `getShownNodes` 之外提供统计）。
- `parentIndices === null` 的祖先扫描分支是 O(N·M)，但 `GiantTree` 始终传入
  `compactStore.parent`，组件路径不会走到。属于「公开 API 才可能踩到」的隐患，建议删除或加注释。
- `candidateIndex` 的收益/成本已有注释说明，默认关闭合理；但 `_buildSearchCandidates`
  会为每个节点的每个**不同字符**建桶并 push 索引，1M 树首次构建是较大的 O(N·len) 分配。
  若保持默认关闭，可只在「关键词长度 ≥ 2 且树 ≥ 阈值」时惰性启用。
- `searchTree` 是「命中项 + 祖先项」两段拼接后再 `sort`，接近有序，可改为归并；
  命中上限 5000 时排序占比不大，优先级低。

### 4.3 惰性复选框区间

**位置**：`assembly/lazy-check-range-store.ts:66-82`

`getPoint`/`get` 对区间数组线性扫描；`_syncLazyShownStates`（`giant-tree.ts:865-876`）
会在每次 `getShownNodes` 时对每个可见行调用一次，最坏 O(可见行 × 区间数)。
`setRange` 每次新建 3 个数组并整体重建，K 次勾选是 O(K·R)。
区间天然有序，改成二分查找 + 原地 splice 即可；默认关闭，优先级低。

### 4.4 连接线预计算的内存

**位置**：`lib/guide.ts:115-208`、`lib/TreeItem.vue:123-131`

`showLine` 开启时，`computeGuideLines` 为 1M 节点建 `Map<string, {isLastChild, guideMask, markerLine}>`，
实测 JS 堆约 **66MB**；每行再 `Array.from({length: deep})` 建 cells 数组。
建议：用 `Int32Array`（mask）/`Uint8Array`（标记）按 fullIndex 打包，或改为按可见行惰性计算；
后者与文档中「几何只依赖结构、与折叠无关」的结论并不冲突，只是把 O(N) 预算换成 O(rows·depth)。

### 4.5 行渲染的每格 style 对象

**位置**：`lib/TreeItem.vue:238-254`（缩进格）、`:258/268/303-319`（图标/复选框的 `:style="{width: fontSize, height: fontSize}"`）

deep=50 的行每次渲染要创建 50 个 `{width}` 对象（showLine 关闭时是 50 个空 style 绑定），
再加上图标/复选框的重复宽高对象。建议在行根节点写一个 CSS 变量
（如 `--giant-tree-row-size: 14px`），SCSS 里用 `width: var(...)`，模板只保留一个 style 绑定。
需要浏览器 profiling 确认收益，但实现风险很低。

### 4.6 worker 侧

- `lib/tree.worker.ts:113-156`：`snapshot` 的两条分支重复了同一段
  `setBoundary/getSize/getShownHeight/JSON.parse`，抽一个 `sendSnapshot(revision, mutation?)` 即可。
- `ensureInput`（`:233-244`）：通过 `getAllNodes` 的 JSON 往返重建输入数组，
  仅在结构型 `update` 时触发一次，但 1M 时是 O(N) 字符串解析 + 对象分配。
  可在 `stream-finish` 后保留一份轻量输入（id/name/parentId/disabled），避免回读。
- `cloneForWorker`（`:1061-1071`）：每条命令（包括每帧的 `boundary`）都做一次
  `JSON.parse(JSON.stringify(...))`。单次很小，但可只对携带树数据的命令做克隆。

### 4.7 代码结构 / 可维护性

- `assembly/giant-tree.ts:1283-1485`：`checkNode` 与 `setCheckedNode` 的 RADIO/SELECT 分支几乎逐行重复。
- `assembly/giant-tree.ts:1492-1611`：`getCheckedNodes` 与 `getCheckedIdList` 的
  RootOnly/LeafOnly 遍历重复；可以抽 `collectCheckedIndices(mode)`，两者共用。
- `assembly/giant-tree.ts:912-941` 与 `:979-1028`：搜索模式的可见性重建重复，
  且 `collapseAll` 的搜索分支没有 `rightNode - leftNode > 1` 的叶子判断（`collapseTree` 有）。
- `useCompactSelection === false` 的整条 legacy 分支（`checkNodeInTree`、`setSubtreeChecked`、
  `getParentNodeCheckType`、`setCheckedNodesInTree`、`serializeShownSlice`、`serializeMpttArray`…）
  在组件里从未启用（`lib` 没有调用 `setUseCompactSelection`）。
  要么暴露成 prop，要么标记 deprecated/删除，避免两套语义长期漂移
  （上一轮 diagnostics #8 的 disabled 语义差异正源于此）。
- `lib/VueGiantTree.vue` 与 `lib/TreeItem.vue` 末尾的空 `<style scoped></style>` 可以删除。

---

## 5. 顺带发现的两个正确性问题

> 与性能无直接关系，但都在本次审查路径上，建议单独修复并补回归用例。

### 5.1 `switchDisplay(SEARCH)` 会丢行（已用 release WASM 复现）

**位置**：`assembly/giant-tree.ts:1700-1707`

`switchDisplayTree(SEARCH)` 只是 `this.tree = this.searchTree` 后调用 `_rebuildShownNodes()`，
而 `_rebuildShownNodes` 收集的是 `shown === true` 的节点；`fuzzySearchTree` 从未给搜索结果写 `shown`
（搜索视图是直接把 `searchTree` 整体拷贝进 `_shownNodes`）。

复现（`a/a1/a2/b`，搜索 `a1`）：

```
search view        [a, a1]
switchDisplay(SEARCH)  [a]      ← a1 丢失
switchDisplay(TREE)    [a, b]
```

playground 的「搜索视图」按钮正好走这条路径。建议：
`fuzzySearchTree` 结束后给所有结果节点置 `shown = true`，或让 `switchDisplayTree(SEARCH)`
直接从 `searchTree` 重建可见列表（与 `fuzzySearch` 非空分支保持一致），并加测试。

### 5.2 外部替换 `props.tree` 后 `inputNodeById` 陈旧

**位置**：`lib/VueGiantTree.vue:1045-1051`、`:1053-1057`、`:1384-1389`

`inputNodeById` 只在 setup 和 `updateNode/applyWorkerMutation` 时刷新；
父组件整体替换 `tree` 时走 `reconcileTreeData`，不会更新它。后果：
- `outputIdOnly=false` 或 `Custom` 模式：`emitCheckedResult` 用旧 map 找记录，
  新数据里新增的 id 会被 `.filter` 掉，或输出旧字段值。
- worker 模式：快照行 `extendData: inputNodeById.get(row.id)` 也是旧对象。

建议在 `reconcileTreeData`/`refreshAllNodesCache`/`refreshChunkedNodesCache` 里统一重建，
并在主线程模式直接复用 `allNodesCache`（见 §3.2），消除这份重复索引。

### 5.3 其他运行时约定风险（代码审查）

- `lib/VueGiantTree.vue:1023-1042`：主线程 WASM 实例在 setup 时用初始
  `root/lineHeight/selectType/fieldKeys` 创建，之后没有 watcher。
  运行时修改 `lineHeight` 会让 JS 的 `startOffset`/动画与 WASM 的 `getShownNodes`
  使用不同几何；修改 `root/selectType/fieldKeys` 同理。建议显式支持重建或文档声明不可变。
- `lib/VueGiantTree.vue:1814-1818`：worker 结构变更后 `awaitingWorkerTreeEchoes++`，
  依赖父组件回传 `update:tree` 才递减。若使用方没有绑定该事件，
  计数会一直 >0，**下一次合法的外部 tree 替换会被当作回声吞掉**。
  建议改成基于 revision/内容比对，或在无监听者时直接跳过。

---

## 6. 建议执行顺序

1. **先做 §2.1 + §2.2**：都是局部、输出可对拍、风险低，合计可让「大视口滚动」和「1M 建树」各快一截。
2. **再做 §2.3 第 1 步**（索引模型）与 §3.3（两处 O(N) 分配）：改动集中、收益直接。
3. **接着 §3.1 + §3.2**：选择输出与缓存装配是 1M 场景下剩余的两大块耗时。
4. **最后评估 §4.1 的主线程增量 CRUD**：这是架构性改动，建议先抽共享 apply 层、补对拍测试。
5. 每个改动都跑 `tests/wasm` + `pnpm run gate:phase3-4`，并补一条大视口序列化基准
   （400/1000 行）和 1M 结构增删基准，防止回归。

---

## 7. 附：复现实验说明

- A/B 的方式：`asc assembly/index.ts --target release` 编译到临时目录，
  用 `import('/abs/path/build/release.js')` 与工作区 `build/release.js` 对比；
  同一份 JSON / 同一串操作分别执行，比较输出字符串与耗时。
- 结构操作统一用 `beginStructureBatch` / `endStructureBatch` 包裹，
  与 `lib/tree.worker.ts` 的 flush 行为一致。
- 计时用 `performance.now()`；结构类数据受 GC 影响较大，表中给出的是多轮观测的区间/代表值。
- 视口基准：先展开前 2000 个节点制造足够可见行，再对每个行数循环 500 次
  `setBoundary((k%500)*lineHeight, rows*lineHeight) + getShownNodes`。

---

## 8. 实施记录（2026-10-22）

本轮已落地上表 6 项（含两项依赖的配套修正），源码改动如下。

### 8.1 改动清单

| 项 | 文件 | 内容 |
|----|------|------|
| 1 | `assembly/tree-serializer.ts` | `serializeShownNodesCompact` 改为「整个视口一个 `string[]` + 内联字段 + 一次 `join`」；移除逐节点 `result +=`。 |
| 2 | `assembly/tree-builder.ts` | `readStringContent` 记录结束位置；新增 `keyEnd` / `keyEquals` / `readFieldValue`：key 不再分配字符串，命中字段单次扫描并直接推进 `pos`；嵌套对象/数组仍回退 `skipValue`。 |
| 3 | `assembly/tree-builder.ts`、`assembly/giant-tree.ts`、`assembly/tree-check.ts` | `idToIndex` 从 `Map<string, i32>` 改为 `Map<string, MpttTree>`，位置统一读 `node.fullIndex`；`appendChild` / `removeSubtree` 不再重写索引后缀，改为维护 `fullIndex`；`appendChild` 边界重排缩为「祖先链 + 插入点后缀」。同时修正顶层追加边界（`last.rightNode + 1`，空树从 0 开始）。 |
| 5 | `assembly/giant-tree.ts`、`assembly/index.ts` | 抽出 `_collectCheckedIndices`，`getCheckedNodes` / `getCheckedIdList` 共用；新增 `getCheckedIndices()` 导出（`i32[]`）。 |
| 4 | `lib/VueGiantTree.vue` | `emitCheckedResult` 仅在 Custom / 非 ID 输出时构建 records；`syncAnimationRows` 改用 `allNodesIndexById`，删除 O(N) Map 重建。 |
| 5 | `lib/VueGiantTree.vue` | 主线程选中结果改走 `getCheckedIndices` + `allNodesCache[index].id`；`inputNodeById` 只在 worker 模式构建（`ensureInputNodeById`）。 |
| 6 | `lib/VueGiantTree.vue` | 主线程始终开启 `setTrackInputLayouts(true)`；新增 `refreshNodesCacheFromInputLayouts`，输入序一次组装缓存并同步构建 `allNodesIndexById`；`inputById` 只保留在 fallback；chunked 路径同样在组装时建索引。 |

配套修正：

- `assembly/tree-builder.ts`：JSON 解析为 `NeighborTree` 时回填 `inputIndex`，让 input-order 布局桥在 JSON 路径也生效。
- `assembly/tree-builder.ts`：`_iterativeAssembly` 对 `id === root` 的节点不再递归进 root 子节点桶，避免缺失/空 id 时的无限循环。
- 反向索引：主线程不再维护 `inputNodeById`（1M 时约 28MB）；worker 模式在 `startWorker` 时一次性构建，并继续由结构变更刷新。

### 8.2 验证结果

- `npx asc assembly/index.ts --target release`：通过。
- `npx vitest run`：**12 文件 / 198 用例全绿**（新增 6 项回归：顶层追加边界、祖先右边界同步、`getCheckedIndices` 与各输出模式一致、大视口序列化、缺失 id 不死循环、外部替换 tree 后 JSON 输出使用最新行）。
- `npx vitest run --config vitest.browser.config.ts`：**4 文件 / 6 通过、2 跳过**（含 worker 与 100k 可见性/输入桥）。
- `npx vue-tsc --noEmit -p tsconfig.lib.json`、`npx vue-tsc -b`：通过。
- `npm run lib:build`：通过（dist 产物正常生成）。
- Prettier：改动文件全部通过。

### 8.3 实测对比（同一合成树，Node v26.7.0，release WASM）

**视口序列化（300k 树，500 次滚动平均）**

| 行数 | 改造前 | 改造后 | 提升 |
|-----:|-------:|-------:|-----:|
| 42 | 421µs | **121µs** | 3.5× |
| 100 | 1.48ms | **0.27ms** | 5.5× |
| 400 | 15.1ms | **1.12ms** | 13.5× |
| 1000 | 79.5ms | **2.78ms** | 28.6× |

**JSON 建树（1M，三次冷启动）**

| 轮次 | HEAD | 改造后 | 提升 |
|-----:|-----:|-------:|-----:|
| 0 | 1913ms | **1284ms** | 1.49× |
| 1 | 2083ms | **1343ms** | 1.55× |
| 2 | 2264ms | **1563ms** | 1.45× |

**结构编辑（1M，`begin/endStructureBatch`）**

| 操作 | 改造前 | 改造后 |
|------|-------:|-------:|
| 子节点追加 ×1（前部/中部） | 80–145ms | **71–72ms** |
| 子节点追加 ×100（靠后） | 818ms | **81ms（10×）** |
| 子节点追加 ×100（靠前） | 4764ms | **675ms（7×）** |
| 顶层追加 ×100 | 62ms | 68ms（持平） |
| 删除叶子 ×1 | 71ms | 74ms（持平，受批次提交主导） |
| 删除叶子 ×100 | 583ms | **76ms（7.7×）** |

**选中输出（1M 全选）**

| 步骤 | 改造前 | 改造后 |
|------|-------:|-------:|
| WASM 侧取选中结果 | `getCheckedIdList` 308ms | `getCheckedIndices` **17ms** |
| JS 侧解析 ID | — | **6ms** |
| 默认 ID-only 的 records 解析 | 67ms（随后丢弃） | **0** |

主线程一次全选点击的同步成本从约 **375ms** 降到约 **23ms**。

**缓存装配（1M，主线程）**

| 步骤 | 改造前 | 改造后 |
|------|-------:|-------:|
| `getAllNodeIds` | 298ms | **0（不再调用）** |
| `getAllNodeLayouts` | 58ms | — |
| `getInputNodeLayouts` | — | 75ms |
| JS 缓存组装 + 索引 | 518 + 51ms | **314ms** |
| 合计 | ~925ms | **~389ms（2.4×）** |
| 主线程 `inputNodeById` 内存 | ~28MB | **0** |

### 8.4 仍未做的事（有意保留）

- **worker 侧的选中输出**仍走 `getCheckedIdList` 字符串路径。worker 已用 48ms 合并，且主线程不再被它阻塞；若要进一步优化，需要 worker 维护一份 MPTT 顺序 id 表或改用增量 delta。
- **批次级 MPTT 重建**（把 K 次增删合并为一次 O(N+K)）未实现。当前索引模型 + 后缀重排已把最坏批次从 4.8s 降到 0.68s；再往下需要一个事务级的拓扑 overlay，风险与工作量都显著更高。
- `getCheckedNodes`（全量 JSON）仍使用 `JsonEncoder`，1M 全选约 6.5s。Vue 组件不使用该接口，保留为已知的原始 WASM API 限制。
- 报告 §4 的 P2 项（guide 内存、TreeItem 每格 style、LazyCheckRangeStore 二分、主线程增量 CRUD、`shallowEqualExceptContent` 零分配）未在本轮改动范围内。

---

## 9. 第二轮：P2 与遗留正确性项执行记录（2026-10-22）

按「§5.1 → §4.1 → §4.7 → §4.4/§4.5 → §4.2/§4.3/§4.6」执行，状态如下。

### 9.1 状态总表

| 项 | 状态 | 结果 / 未做原因 |
|----|------|-----------------|
| §5.1 `switchDisplay(SEARCH)` 丢行 | ✅ | 抽出 `_rebuildSearchShownNodes()`；搜索折叠、collapseAll、视图切换共用；新增回归用例 |
| §4.1 批量恢复展开态 | ✅ | 新增 `expandByIds()`；300k 节点 30,000 个分支恢复 **117ms → 19ms（6×）** |
| §4.1 主线程 add/remove/re-parent 增量 | ✅ | 主线程不再 `clear + setNeighborTree(JSON)`；改用 `begin/endStructureBatch + appendChild/removeSubtree`，只重建 JS 缓存。1M 单次新增 **2300ms → 1222ms（1.9×）** |
| §4.1 残余：输入扫描、缓存重建、批次 MPTT | ❓ | `addNode/removeNode` 仍做 O(N) 的 `some/BFS`；增量后缓存仍走 id 版重建（1M 约 0.9s）；事务级一次 MPTT 重建未做。原因：进一步优化需要 JS 端布局镜像或拓扑 overlay，收益/风险比不划算 |
| §4.7 选中输出遍历去重 | ✅ | 已在第一轮 `_collectCheckedIndices` 完成 |
| §4.7 RADIO/SELECT 重复逻辑 | ✅ | 抽出 `_isNodeDisabled` / `_setRadioIndex` / `_setSelectIndex` |
| §4.7 搜索可见性重复 | ✅ | 与 §5.1 同一 helper；同时修正 collapseAll 未判断叶子宽度的问题 |
| §4.7 主/worker 内容 diff 重复 | ✅ | 抽出 `diffContentChanges`，两处共用 |
| §4.7 `shallowEqualExceptContent` 零分配 | ✅ | 去掉每行两次 `Object.keys().filter()`；1M 级比较由 ~119ms 降到 ~43ms（第一轮报告实测） |
| §4.7 删除 legacy 分支 | ❓ | `setUseCompactSelection(false)` 是对外 WASM API，且 `tests/wasm` 明确对拍 legacy/compact；删除会破坏兼容。已在该字段加 deprecated 说明，组件固定用 compact |
| §4.7 `updateChildState` 命名 / `getParentNodeCheckType` 跳过 disabled | ❓ | 纯可读性/legacy 冷路径，无实际运行收益；保留避免无意义 churn |
| §4.4 guide 预计算内存 | ✅（部分） | 对象 Map → 打包 number Map（`guideMask * 8 + flags`），按本次 Map 实测口径 1M 约 **66MB → 28MB**（估算，非进程级精确测量）；公开 `computeGuideLines` 仍返回对象，组件走 packed 路径 |
| §4.4 完整 typed-array / 按可见行惰性计算 | ❓ | 需要把 guide 几何并入缓存布局或改公开 API；默认 `showLine=false`，1M 场景才显著，先保留 |
| §4.5 行渲染每格 style 对象 | ✅ | `TreeItem` 用 scoped CSS + `--giant-tree-row-size`；缩进格/图标/复选框不再各建 style 对象；浏览器测试通过，CLS 约 4.2 |
| §4.2 搜索截断不可见 | ✅ | 新增 `lastSearchTruncated` + `isSearchTruncated()`；测试 6000 命中 → true，清空/小结果 → false |
| §4.2 死分支 / O(N·M) 祖先扫描 | ✅ | 删除仅无 `parentIndices` 时可达的扫描分支 |
| §4.2 candidate index 默认关闭、近有序 sort | ❓ | 候选桶的每字符分配成本已有注释说明；5k 上限下 sort 约毫秒级，收益不足 |
| §4.3 LazyCheckRangeStore | ✅ | `getPoint/get` 改二分；`mergeAdjacent` 改原地压缩（去掉逐对 splice）；现有区间测试全绿 |
| §4.6 worker snapshot 重复代码 | ✅ | 抽出 `postSnapshot()`，两条路径共用 |
| §4.6 每条命令 JSON clone | ✅ | 纯原始类型命令（boundary/check/collapse/search 等）直接 postMessage，不再 JSON 往返 |
| §4.6 disabled/name 更新触发整树 rebuild | ✅ | worker `update` 仅在 parentId 变化时 `rebuild`；disabled/name 走 `updateNodeDisabled/updateNodeName` + 定向 mutation；浏览器 worker 用例新增 disabled 断言 |
| §4.6 `ensureInput` O(N) JSON 往返 | ❓ | 仅在 worker re-parent 时触发。要消除需在 worker 流式输入时同步维护一份输入镜像（额外内存），或新增 WASM `moveSubtree`；当前属低频路径 |
| §3.3 主/worker diff 去重与零分配 | ✅ | 同上 |
| §5.2 `inputNodeById` 陈旧 | ✅ | 第一轮已修；主线程 records 从缓存解析，worker 在启动/替换时重建 |
| §5.3 运行时改 `root/lineHeight/selectType/fieldKeys` | ✅ | 主线程：lineHeight 走 `setLineHeight()` 原地更新；root/selectType/fieldKeys/preorderedInput 重建 WASM 实例并恢复展开态（selectType 变化时清空选择）。worker：lineHeight 走新 `set-line-height` 命令；其余配置变更走 `scheduleWorkerRestream()` 重新流式下发。已加组件与 worker 浏览器用例 |
| §5.3 `awaitingWorkerTreeEchoes` 漂移 | ✅ | 计数器改为 `pendingWorkerTreeEcho` + 原始数组 identity 比对（含 `toRaw`，兼容 Vue ref 的 reactive proxy）；父组件不绑定 `update:tree` 时，下一次外部替换会正常进入 stream。新增 worker 回归用例 |

### 9.2 本轮验证

- `asc --target release`、`npx vitest run`：**12 文件 / 207 用例全绿**（新增 §5.1、expandByIds、search 截断、增量 CRUD、运行时 lineHeight/selectType/root/fieldKeys、setLineHeight 等用例）。
- 浏览器：**4 文件 / 8 通过、2 跳过**（visibility、worker、input-bridge、arrow-transition；新增 worker 配置变更与回声漂移用例）。
- `vue-tsc --noEmit -p tsconfig.lib.json`、`vue-tsc -b`：通过。
- Prettier：改动文件通过；`git diff --check` 无空白问题。
- `npm run lib:build`：通过（scoped TreeItem 样式随 SFC 打包，不再依赖全局样式才能定尺寸）。

### 9.3 剩余明确项

- worker re-parent 仍是「ensureInput + 全量 rebuild」；
- 主线程增量编辑后缓存仍按 id 重建（1M 约 0.9s）；
- 批量结构编辑的事务级一次重建；
- `getCheckedNodes` 全量 JSON（1M 约 6.5s，组件不调用）；
- worker 选中输出仍返回字符串 ID（主线程已走索引）。

§5.3 的运行时 props 与 worker 回声漂移已在本轮修复，不再属于剩余项。
