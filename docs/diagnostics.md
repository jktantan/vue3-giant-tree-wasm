# 漏洞与优化诊断报告

> 范围：仅审查 `Assembly/` 与 `lib/` 目录。
> 审查时间：基于当前工作区版本。
> 评级：🔴 高 / 🟠 中 / 🟡 低。

---

## 1. 总览

| # | 优先级 | 位置 | 类别 | 摘要 |
|---|--------|------|------|------|
| 1 | 🔴 | `Assembly/giant-tree.ts` `appendChild` | 逻辑 Bug | 顶层（`parentId === root`）追加时给所有节点 `±2` 偏移，导致新节点位置冲突 |
| 2 | 🔴 | `Assembly/tree-check.ts` `checkNodeInTree` | 性能 Bug | 父节点回溯没有 `break`，对每个祖先都重复重算 |
| 3 | 🟠 | `Assembly/compact-store.ts` `checkCheckbox` | 冗余调用 | 自身与子树调用已经写回 `checked`/`tree[i].checked`，但回溯时仍对同一节点重复走 `updateChildState` |
| 4 | 🟠 | `Assembly/giant-tree.ts` `_syncAfterStructureMutation` | 性能 Bug | RADIO/SELECT 路径用全树 O(N) 扫描恢复索引，与注释承诺的 O(1) 不一致 |
| 5 | 🟠 | `lib/VueGiantTree.vue` `refreshAllNodesCache` | 一致性 / 鲁棒性 | `inputById` 缺失 id 的 fallback 让 `extendData` 为 `undefined`，下游 `filterFn` 可能崩溃 |
| 6 | 🟡 | `Assembly/tree-builder.ts` `skipValue` | 鲁棒性 | `MAX_NESTING_DEPTH` 触发时静默返回 `len`，上层继续写入半截对象 |
| 7 | 🟡 | `Assembly/compact-store.ts` `updateChildState` | 可读性 | 同一函数身兼 "child→parent 计数变化" 与 "传 previous & next"，阅读路径不清晰 |
| 8 | 🟡 | `Assembly/tree-check.ts` `getParentNodeCheckType` | 性能 | 没有跳过禁用子节点，直接遍历整段子树（含忽略节点） |
| 9 | 🟡 | `lib/TreeItem.vue` `guideCells` | 性能 | `computed` 每次 `prop` 变化都 `Array.from`，虚拟滚动中频繁创建数组 |
| 10 | 🟡 | `lib/tree.worker.ts` `flushStructure` | 顺序 | 每次非 add/remove 命令前都 flush，与 worker 内的 16ms 节流形成回弹放大 |

---

## 2. 详细说明

### 2.1 🔴 `appendChild` 顶层子节点边界重排错误

**位置**：`Assembly/giant-tree.ts:312–356`

```ts
let insertIndex = this.fullTree.length
let left =
  this.fullTree.length > 0
    ? this.fullTree[this.fullTree.length - 1].rightNode
    : 1
let depth: i32 = 0
if (parentId !== this.root) {
  ... insertIndex 与 left 走 “子节点插入到父节点边界” 路径 ...
}
for (let i: i32 = 0; i < this.fullTree.length; i++) {
  const node = this.fullTree[i]
  if (node.leftNode >= left) node.leftNode += 2
  if (node.rightNode >= left) node.rightNode += 2
}
```

**问题**：
- 当 `parentId === root`（顶层追加）时，`left = last.rightNode`。后续循环对**所有**现存节点做 `±2`，期望新节点落在 `left`，但 `left` 自身已被推到了 `(last.rightNode + 2)`，新节点的 leftNode 又被设置为 `left`，最终 left/rightNode 会**与现有节点冲突**。
- 仅当 `parentId !== root` 时才需要整体重排；顶层追加应该直接 `left = last.rightNode + 1`，并把新节点 push 到末尾。

**影响**：在顶层追加会破坏 MPTT 编号，后续范围查询、check/collapse 全部失真。

---

### 2.2 🔴 `checkNodeInTree` 父回溯多次重复

**位置**：`Assembly/tree-check.ts:20–43`

```ts
for (let j = i - 1; j >= 0; j--) {
  const prevNode = fullTree[j]
  if (
    prevNode.leftNode <= node.leftNode &&
    prevNode.rightNode >= node.rightNode
  ) {
    prevNode.checked = getParentNodeCheckType(...)
  }
}
```

**问题**：
- 由于 `fullTree` 按 `leftNode` 升序，**所有祖先都满足该条件**，循环会把所有祖先逐个更新。
- 最近的那个祖先一定是第一个匹配项，之后的循环只会重复同样的 `getParentNodeCheckType`（递归扫子树）。
- 应当：找到 "最近祖先" 后 `break`。

**影响**：结果仍然正确，但**性能浪费**。深且大的树上 `checkNode` 会被拖到 O(N × depth)。

---

### 2.3 🟠 `checkCheckbox` 内部冗余写入

**位置**：`Assembly/compact-store.ts:152–181`

```ts
const subtreeEnd = this.subtreeEnd[targetIndex]
for (let i = targetIndex + 1; i < subtreeEnd; i++) {
  if (this.disabled[i] === 0) {
    const previous = this.checked[i]
    this.updateChildState(this.parent[i], previous, value)
    this.checked[i] = value
    tree[i].checked = value
  }
}
let ancestor = this.parent[targetIndex]
while (ancestor >= 0) {
  const next = this.getAggregateState(ancestor)
  const previous = this.checked[ancestor]
  this.updateChildState(this.parent[ancestor], previous, next)
  this.checked[ancestor] = next
  tree[ancestor].checked = next
  ancestor = this.parent[ancestor]
}
```

**问题**：
- 当子树中的节点 i **就是**当前回溯的 ancestor 时，会重复触发 `updateChildState`。
- 当前实现不会出错（`updateChildState` 检查 `previous === next` 直接返回），但仍然多读了 `checked[ancestor]` 与 `parent[ancestor]`。
- 改进建议：回溯链路只针对不在子树中的节点，跳过 `targetIndex <= ancestor < subtreeEnd` 的情况。

**影响**：O(N) 节点 + 一次跳过即可，读写路径变干净。

---

### 2.4 🟠 RADIO/SELECT 索引恢复违反 O(1) 承诺

**位置**：`Assembly/giant-tree.ts:289–298`

```ts
} else {
  this._radioCheckedIdx = -1
  this._selectSelectedIdx = -1
  for (let i: i32 = 0; i < this.fullTree.length; i++) {
    if (this.fullTree[i].checked === CheckType.CHECKED)
      this._radioCheckedIdx = i
    if (this.fullTree[i].selected === CheckType.CHECKED)
      this._selectSelectedIdx = i
  }
}
```

**问题**：
- 文件顶部 `// State management strategy` 注释强调 "RADIO 模式：用缓存索引 O(1) 替代全树 O(N) 扫描"。
- 此处 `_syncAfterStructureMutation` 每次结构变更都全树扫描，违反承诺。应当通过 `idToIndex` 反查，或用 `compactStore.checked` 的局部扫描（常数时间）。

**影响**：结构变更后立刻做 N 步扫描，破坏嵌套批量编辑的性能。

---

### 2.5 🟠 `refreshAllNodesCache` 让 `extendData` 变 undefined

**位置**：`lib/VueGiantTree.vue:357–391`

```ts
const inputById = new Map<...>()
for (const item of props.tree as ...) {
  inputById.set(String(item[idField] ?? ''), item)
}
allNodesCache = ids.map((id, index) => {
  const item = inputById.get(id)   // <-- 可能 undefined
  ...
  return {
    ...
    extendData: item,               // <-- 当 item 是 undefined 时，extendData = undefined
  }
})
```

**问题**：
- 当输入（邻接表）出现重复 id、孤立 id 或节点在 `props.tree` 中不存在时（例如 `trackInputLayouts = false` 时丢节点），`inputById.get(id)` 返回 `undefined`。
- 行对象后续 `props.item.extendData` 进入业务回调 `filterFn`、`node-icon resolver`，会触发 `Cannot read properties of undefined (reading '...')`。
- 应当：fallback 给 `{}`，并记录 `console.warn` 或把节点 id 抛错。

**影响**：极端输入下整棵树渲染崩溃。

---

### 2.6 🟡 `skipValue` 深度上限触发时静默失败

**位置**：`Assembly/tree-builder.ts:174–282`

```ts
if (depth > MAX_NESTING_DEPTH) return len
```

**问题**：
- 上层 `parseOneObject` 仍会 `result.push(nt)`，但 nt 的字段大多没填充。
- 应当把这种异常显式化（抛错 / 返回值），至少在该路径上不写坏 `nt`。

**影响**：构造畸形输入时整棵树不完整，又不报错，难定位。

---

### 2.7 🟡 `compact-store.ts` `updateChildState` 可读性

**位置**：`Assembly/compact-store.ts:86–92`

```ts
updateChildState(parent: i32, previous: u8, next: u8): void {
  if (parent < 0 || previous === next) return
  if (previous === 2) this.childChecked[parent]--
  else if (previous === 1) this.childHalf[parent]--
  if (next === 2) this.childChecked[parent]++
  else if (next === 1) this.childHalf[parent]++
}
```

**问题**：
- 函数语义是 "更新某子节点对父节点的贡献"；参数却用一个父索引 + 前/后状态。
- 阅读时容易把 previous 当成 parent 的前状态。
- 改进：拆成 `updateChildContribution(parent, childPreviousValue, childNextValue)`，清晰度立刻提升。

**影响**：纯可读性；非运行期 bug。

---

### 2.8 🟡 `getParentNodeCheckType` 不跳过禁用子节点

**位置**：`Assembly/tree-check.ts:86–122`

- 当前实现遍历所有 `deep === node.deep + 1` 的子节点，不管是否禁用。逻辑 OK（只在 compact 路径外用），但当 disabled 节点很多时，做了无效比较。
- 改进：在 CHECKBOX 路径下 `if (currentNode.disabled) continue`。

**影响**：冷路径，但与 compact 路径对齐可减少分支。

---

### 2.9 🟡 `TreeItem.vue` `guideCells` 频繁创建数组

**位置**：`lib/TreeItem.vue:64–72`

```ts
const guideCells = computed(() => {
  ...
  return Array.from({ length: deep }, (_, i) => ({ ... }))
})
```

**问题**：
- virtual scroll 中每一行进入视口都会重算 computed；`deep` 不变也会返回新数组。
- 应当在 `guide` 不变的情况下 keepRef。

**影响**：性能，但看不出明显崩塌，属于优化空间。

---

### 2.10 🟡 `flushStructure` 在每个非结构命令前都 flush

**位置**：`lib/tree.worker.ts:281–288`

```ts
if (m.type === 'add' || m.type === 'remove') {
  enqueueStructure(m)
  return
}
// Preserve command order: a check/collapse/search after an add or delete
// must observe that structural change, even before the timer fires.
flushStructure()
```

**问题**：
- 如果同一帧来了 100 次 add + 1 次 collapse，整体 flush 100 次，每次都触达 WASM。
- 因为 `pendingStructure.splice(0)` 已排空，再次 flush 是 no-op；性能不致命，但分散的 setTimeout reset 影响可观测性。

**影响**：行为正确性 OK，性能微妙。

---

## 3. 已确认 OK 的部分

- `lazy-check-range-store.ts` setRange/getPoint 语义正确，`mergeAdjacent` 合并相邻区间无误。
- `compact-store.ts load` 中 MPTT 边界栈和父子计数同步在单次遍历中完成，OK。
- `tree-visibility.ts` `setCollapsedShown` 在折叠与展开两种方向上都正确维护了 `shown` 标志与 `collapsedBoundaries` 栈。
- `tree-builder.ts` `convertPreorderedNeighborToMptt` 的容错回退与 deep 计算一致。
- `models.ts` 枚举与字段默认值与 JS/WASM 侧一致。
- `lib/types.ts` 与 `lib/guide.ts` 的连接线字段类型对齐。
- `VueGiantTree.vue` 行 key=item.id，virtual scroll 的 reconcile 路径稳定。
- `tree.worker.ts` 已通过 `treeSignature` 复用 wasm 实例，避免"内存棘轮"。
