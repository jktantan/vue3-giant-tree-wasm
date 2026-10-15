# 已知限制与诊断

仓库会对 `assembly/` 与 `lib/` 做代码审查，把发现按优先级记录在
[`docs/diagnostics.md`](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/diagnostics.md)。
本页是那份报告的摘要：**6 项已修复，4 项保留**。

其它页面讲「功能怎么用」，这里讲**已知会出问题、或已知不够优雅的地方**。

## 已修复（6）

| # | 优先级 | 问题 | 处理方式 |
| --- | --- | --- | --- |
| 1 | 🔴 | `appendChild` 顶层追加时给所有节点 ±2 偏移，导致新节点位置冲突 | `needsShift` 标志，跳过 O(N) 改写 |
| 2 | 🔴 | `checkNodeInTree` 父回溯可能误用 `break` | 保留循环（`break` 会破坏外层祖先聚合），补文档说明 |
| 3 | 🟠 | `checkCheckbox` 每轮重复读取 `disabled` | fast path，复用 `hasDisabledInSubtree` |
| 4 | 🟠 | `_syncAfterStructureMutation` 的 RADIO / SELECT 全树扫描 | `_locateCheckedIndex` 等 helper，O(N) → O(checkedCount) |
| 5 | 🟠 | `refreshAllNodesCache` 可能产出 `extendData: undefined` | 兜底 + 控制台告警，便于定位数据不一致 |
| 6 | 🟡 | `skipValue` 深度上限静默失败 | `_skipValueOverflowed` 标志，由 `parseOneObject` 丢弃半截对象 |

## 保留（4）

| # | 优先级 | 问题 | 为什么可以后置 |
| --- | --- | --- | --- |
| 7 | 🟡 | `updateChildState` 可读性 | 不是运行期 bug，待命名清理 |
| 8 | 🟡 | `getParentNodeCheckType` 不跳过禁用子节点 | 只在 legacy 路径使用 |
| 9 | 🟡 | `TreeItem.vue` 的 `guideCells` 频繁 `Array.from` | 性能敏感但非阻塞 |
| 10 | 🟡 | `tree.worker.ts` 的 `flushStructure` 节流回弹 | 行为正确，属可优化项 |

## 相关文档

- [诊断报告（仓库原文）](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/diagnostics.md)
- [性能重构计划](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-refactor-plan.md)
- [性能门禁归档](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md)

## 遇到问题时

如果实际行为与本站其它页面的描述不符，以**代码**与**诊断报告**为准，并欢迎提
[issue](https://github.com/jktantan/vue3-giant-tree-wasm/issues)。
