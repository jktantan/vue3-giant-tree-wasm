# Worker mode and performance

## What this page covers

With `workerMode` on, the tree algorithms run in a Web Worker: the main thread only renders, while
structural changes, searches and checks are sent to the worker as commands, and results come back as
"visible row snapshots". It fits two situations:

- very large input, where the first build would occupy the main thread;
- frequent structural changes, where repeated edits keep triggering MPTT recomputation.

The cost is one extra `postMessage` round trip per interaction. On small datasets the main-thread
mode is actually faster — which is why `workerMode` is off by default.

## Parameters

| prop | Type | Default | Description |
| --- | --- | --- | --- |
| `workerMode` | `boolean` | `false` | Run the tree algorithms in a Web Worker |
| `chunkedBuild` | `boolean` | `false` | Write nodes to WASM in batches; only effective when `outputIdOnly` is `true` and no `filterFn` is set |
| `buildBatchSize` | `number` | `2000` | Nodes per batch (used when `chunkedBuild` is on) |

## Metrics

### getBuildMetrics()

Returns per-phase timings of the latest build (milliseconds): `inputBridgeMs`, `inputYieldMs`,
`finalizeMs`, `layoutBridgeMs`, `cacheAssemblyMs`, `cacheYieldMs`, `layoutReleaseMs`, `cacheIndexMs`,
`cacheRefreshMs`, `shownIndicesMs`, `selectionStatesMs`, `totalMs`.

When asking "why is the first frame slow", read `totalMs` first and then walk the list above to find
which phase it is.

### getWorkerMetrics()

| Field | Meaning |
| --- | --- |
| `enabled` | Whether the worker is actually in use |
| `pendingCommands` / `commandsSent` / `snapshotsReceived` | Queue depth and cumulative counters |
| `lastRoundTripMs` | Main-thread-observed round trip |
| `lastWorkerResponseMs` | Time spent inside the worker |
| `lastWorkerSerializeMs` | Visible-row serialization time |
| `structuralBatches` / `structuralOperations` / `lastBatchSize` | How consecutive structural operations were coalesced |

**Command merging**: consecutive structural changes are not sent one by one — they are merged into a
batch within a short frame window, so `structuralOperations` is normally larger than
`structuralBatches`, which is exactly the problem it solves.

## Usage

```vue
<VueGiantTree :tree="rows" root="root" worker-mode v-model="selected" />
```

```ts
const metrics = treeRef.value?.getWorkerMetrics()
if (metrics?.enabled) {
  console.log('round trip', metrics.lastRoundTripMs, 'ms', 'batches', metrics.structuralBatches)
}
```

Benchmarks (release WASM, local Chromium) are in the repository's
[performance gate archive](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md).

## Try it

Both the `workerMode` switch and the two metric methods live in the
[full playground](/en/playground): turn on "workerMode", then press
"getBuildMetrics / getWorkerMetrics" and the panel shows `enabled=true` with real round-trip times.
