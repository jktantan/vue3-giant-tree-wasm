# Worker 与性能

## 这一页讲什么

`workerMode` 打开后，树算法跑在 Web Worker 里：主线程只负责渲染，结构变更、搜索、勾选以命令形式发给 Worker，
结果以「可视行快照」回来。适合两类场景：

- 输入非常大，首次构建会明显占用主线程；
- 结构变更频繁，连续增删改会持续触发 MPTT 重算。

代价是每次交互多一次 `postMessage` 往返。小数据量下主线程模式反而更快 —— 这也是 `workerMode` 默认关闭的原因。

## 参数

| prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `workerMode` | `boolean` | `false` | 把树算法放进 Web Worker |
| `chunkedBuild` | `boolean` | `false` | 分批写入 WASM；只在 `outputIdOnly` 为 `true` 且无 `filterFn` 时生效 |
| `buildBatchSize` | `number` | `2000` | 每批写入的节点数（`chunkedBuild` 生效时） |

## 指标

### getBuildMetrics()

返回上一次构建的各阶段耗时（毫秒）：`inputBridgeMs`、`inputYieldMs`、`finalizeMs`、`layoutBridgeMs`、
`cacheAssemblyMs`、`cacheYieldMs`、`layoutReleaseMs`、`cacheIndexMs`、`cacheRefreshMs`、`shownIndicesMs`、
`selectionStatesMs`、`totalMs`。

排查「首帧为什么慢」时先看 `totalMs`，再按上面的顺序定位是哪一段。

### getWorkerMetrics()

| 字段 | 含义 |
| --- | --- |
| `enabled` | 是否真的在用 Worker |
| `pendingCommands` / `commandsSent` / `snapshotsReceived` | 队列深度与累计计数 |
| `lastRoundTripMs` | 主线程感知的一次往返总时间 |
| `lastWorkerResponseMs` | Worker 内部处理耗时 |
| `lastWorkerSerializeMs` | 可视行序列化耗时 |
| `structuralBatches` / `structuralOperations` / `lastBatchSize` | 连续结构操作被合并的批次统计 |

**命令合并**：连续的结构变更不会一条一条发，而是在一个短帧窗口内合并成一批，
所以 `structuralOperations` 通常大于 `structuralBatches` —— 这正是它要解决的问题。

## 用法

```vue
<VueGiantTree :tree="rows" root="root" worker-mode v-model="selected" />
```

```ts
const metrics = treeRef.value?.getWorkerMetrics()
if (metrics?.enabled) {
  console.log('一次往返', metrics.lastRoundTripMs, 'ms', '合并批次', metrics.structuralBatches)
}
```

基准数据（release WASM + 本机 Chromium）见仓库里的
[性能门禁归档](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md)。

## 动手试试

`workerMode` 开关与两个指标方法都在[完整演示场](/playground)里：打开「workerMode」，
再点「getBuildMetrics / getWorkerMetrics」，输出区会显示 `enabled=true` 与真实的往返时间。
