# 可见索引表（`shownIndices`）退役记录：2026-10-09

## 背景：这张表当年为什么存在

`CompactNodeStore.shownIndices` / `shownLength` 是 `6ea3df2「核心算法更新」（2026-09-19）` 引入的，
属于 `performance-refactor-plan.md` 里的「阶段 3：紧凑线性布局」重构。

它是一张预计算缓存：**「可见行序号 → fullTree 下标」**。

引入根因在序列化方式的切换：

- `6ea3df2` 之前，`serializeShownSlice` 直接从 `shownNodes[i]` 这个 `MpttTree`
  读取 `node.leftNode` 等字段。
- `6ea3df2` 之后，滚动热路径改走 compact 序列化 `nodeToJsonCompact`，数值全部从
  typed array 按**整型下标**取：`store.left[index]`。

问题：`_shownNodes` 存的是**对象引用**，而 `store.left[index]` 需要**整型下标**。
对象数组拿不到下标，只能回查 `idToIndex.get(node.id)`（一次字符串哈希）。
为了不让序列化每帧查哈希，当年就把「可见行 → fullTree 下标」预计算成 `shownIndices` 缓存。

这笔取舍当年就被明确记录为**性能回退**：

> compact 可见索引在 1M 展开/折叠 P95 约 26.6/27.9 ms，**高于旧对象增量基线**，作为明确取舍记录。
> ……不宣称全面加速。
> —— `docs/performance-refactor-plan.md`

即：`shownIndices` 从不是「好用」才要，而是「为 compact 序列化的整型寻址不得不维护的缓存」，
代价是每次 expand/collapse 都要 O(N) 全量重建，且文档记录其 P95 高于旧基线。

## 关键转折：`fullIndex` 让表变冗余

2026-10-09 的「建议 1」（`MpttTree.fullIndex` 字段，由 `buildIdIndex` 在每次 fullTree 重建后回填）
让 `_shownNodes[i].fullIndex` **直接等于** `shownIndices[i]`。

于是：

- 对象数组本身已等价于下标数组；
- 预计算表的前提消失，只剩冗余；
- 而它的维护成本（`_syncCompactShownIndices` 每次 O(N) 重建）成为唯一残留的 O(N) 热点。

## 本次改动：让表退役，而非增量维护

不采用「增量维护 `shownIndices`」（会产生「`_shownNodes` 与 `shownIndices` 双份状态必须严格同步」
的错位风险），而是**删除该表**，让消费方直接读 `_shownNodes[i].fullIndex`——只剩一份真源。

### 改动文件

- `assembly/compact-store.ts`：删字段 `shownIndices` / `shownLength`，删方法
  `setShownIndices` / `getShownIndices`，`load()` 重置与 `memoryBytes()` 对应项一并移除。
- `assembly/tree-serializer.ts`：`serializeShownIndicesCompact(tree, indices, shownLength, ...)`
  → `serializeShownNodesCompact(shownNodes, store, ...)`，内部改用 `node.fullIndex`。
- `assembly/giant-tree.ts`：删 `_syncCompactShownIndices()` 及 7 处调用点；
  `getShownIndices()`、`_syncLazyShownStates()` 改读 `_shownNodes`；`clear()` 删 `setShownIndices([])`。
- `tests/wasm/giant-tree.test.ts`：`getCompactMemoryBytes` 断言 `94 → 86`（去掉 2 节点 × 4B）。
- `assembly/models.ts`：`fullIndex` 字段（建议 1 引入）。

### 公开 API 面：零变化

`getShownIndices`、`getCompactMemoryBytes`、`getCompactMirrorBytes` 的签名与语义均不变，
前端 `lib/VueGiantTree.vue` 与 `scripts/benchmark-*.mjs` 无需改动。

### 正确性论证

`fullIndex` 由 `buildIdIndex` 填充，而 `buildIdIndex` 是**所有** fullTree 重建的唯一汇聚点：
`setMpttTree`、`_convertToMpttTree`、`popMptt`、`_syncAfterStructureMutation`
（覆盖 `appendChild` / `removeSubtree` 批量）。
搜索模式下 `searchTree` 节点是 fullTree 的对象引用，`fullIndex` 精确指向 fullTree 位置，
与原 `idToIndex.get` 语义一致。故 `_shownNodes[i].fullIndex ≡ 原 shownIndices[i]`。

## 验证结果

命令与环境：release WASM，本机 Node v26.7.0，2026-10-09。

- `npm run asbuild:release`：编译通过。
- `npx vitest run`：**9 文件 / 136 tests 全通过**（wasm 96 + 组件 40）。
- `npm run lib:build`：通过。
- 容量矩阵（node）：
  - `--single 100000`：build `340ms`，shown `0.11ms`。
  - `--deep 512 / 1024`：build `6.7ms / 11.9ms`。
  - `--compact-ab 1000000`：compact/legacy 对拍完成；
    expand P95 `16.1ms` / collapse P95 `8.5ms`，**低于文档记录的旧基线 26.6/27.9ms**。
- `benchmark:visibility`（1M 可见节点，每次 expand→collapse 中位耗时）：

| 阶段 | 建议 1 之后 | 本次改动后 |
| --- | --- | --- |
| begin | 0.15–0.23 ms | 0.079 / 0.087 ms |
| middle | — | 0.037 / 0.046 ms |
| end | — | 0.002 / 0.005 ms |

100k 可见节点：begin `0.023 / 0.010 ms`，middle/end 均 < `0.006 ms`。

`_syncCompactShownIndices` 的每次 O(N) 重建已彻底消失，1M 规模较建议 1 再降约一半。

## 内存与诊断口径

- `getCompactMemoryBytes` 相应减少 `4 bytes × N`（去掉 `shownIndices` 的 `Int32Array`）。
- 两节点测试树由 `94` 变为 `86` bytes。
- `CompactNodeStore.mirrorBytes()` 本就不含 `shownIndices`，不受影响。

## 回滚

改动为纯内存结构删除，无数据迁移、无外部状态。`git revert` 本提交即可恢复。

## 后续

文档口径中「阶段 3 单一状态来源」原记录：若要删除镜像，需另立架构项目。
本次退役的虽非 `fullTree` 对象镜像本身（字符串 / `extendData` 仍保留），
但属同类架构收口，故单独一个提交、单独留档，不夹带其他改动。