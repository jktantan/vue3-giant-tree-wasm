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

## 注意事项

下面几条都是实测踩出来的，不注意很容易出现「本地很快、上线很慢」这类问题。

### 大数组请用 `shallowRef`

组件的 `tree` 会被全量遍历并序列化。如果宿主把它放在 Vue 的深度响应式 `ref` 里，
每次属性读取都要过 Proxy 的 get trap，并为嵌套对象惰性创建代理 —— 10 万节点实测：

| 写法 | `JSON.stringify(10 万个对象)` |
| --- | --- |
| 原始数组 | 17.1ms |
| `ref(...).value` | **277.2ms** |
| `shallowRef(...).value` | 19.6ms |

组件内部已经用 `toRaw()` 兜底，所以两种写法都能跑，但 `shallowRef` 更省 ——
树数据只会整体替换，不需要深层响应式。

```ts
// 推荐
const rows = shallowRef(buildRows())
// 不推荐
const rows = ref(buildRows())
```

### 数据量决定要不要开 Worker

release WASM + 本机 Chromium 实测：

| 数据量 | `workerMode: false` | `workerMode: true` |
| --- | --- | --- |
| 1 万 | total **22.8ms**，无阻塞 | roundTrip 42.7ms，无阻塞 |
| 10 万 | total 242ms，主线程阻塞 249ms | roundTrip **53.4ms**，无阻塞 |
| 100 万 | total 2697ms，主线程阻塞 2749ms | roundTrip 584ms |

**1 万以下主线程更快**（省一次往返）；**10 万以上建议开 Worker**。
Worker 首次开启时要加载自己的脚本与 WASM，有一次性成本，之后复用。

### 换数据直接改 `tree`，不要用 `:key` 重挂载

```vue
<!-- 推荐：复用 Worker 与 WASM 实例，100 万节点约 600ms -->
<VueGiantTree :tree="rows" worker-mode />

<!-- 不推荐：每次重建都销毁并新建 Worker -->
<VueGiantTree :key="reloadKey" :tree="rows" worker-mode />
```

组件对 `tree` 的替换走二进制流式通道（UTF-8 + `transfer`）；而销毁重建要重新初始化 Worker。

### `outputIdOnly` / `filterFn` 会让 `chunkedBuild` 失效

`chunkedBuild` 只在 `outputIdOnly === true` 且未使用 `filterFn` 时生效，
条件不满足就退回「整棵 JSON 路径」，主线程会被一次性占满。
`getBuildMetrics().inputBridgeMs` 为 0 就是没走分批的信号。

## 动手试试

`workerMode` 开关与两个指标方法都在[完整演示场](/playground)里：打开「workerMode」，
再点「getBuildMetrics / getWorkerMetrics」，输出区会显示 `enabled=true` 与真实的往返时间。
