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

## Things to watch out for

These are all measured; ignoring them tends to produce "fast locally, slow in production".

### Use `shallowRef` for large arrays

The component walks and serialises the whole `tree`. If the host keeps it in a deep-reactive `ref`, every property read goes through a Proxy get trap that lazily creates a proxy per nested object — measured on 100,000 nodes:

| Form | `JSON.stringify(100,000 objects)` |
| --- | --- |
| raw array | 17.1ms |
| `ref(...).value` | **277.2ms** |
| `shallowRef(...).value` | 19.6ms |

The component calls `toRaw()` internally, so both work, but `shallowRef` is cheaper — tree data is only ever replaced wholesale.

```ts
// Recommended
const rows = shallowRef(buildRows())
// Not recommended
const rows = ref(buildRows())
```

### Let the dataset size decide whether to use the Worker

Measured with release WASM on local Chromium:

| Dataset | `workerMode: false` | `workerMode: true` |
| --- | --- | --- |
| 10,000 | total **22.8ms**, no blocking | roundTrip 42.7ms, no blocking |
| 100,000 | total 242ms, main thread blocked 249ms | roundTrip **53.4ms**, no blocking |
| 1,000,000 | total 2697ms, main thread blocked 2749ms | roundTrip 584ms |

**Below 10,000 the main thread is faster** (one less round trip); **above ~100,000 prefer the Worker**. First enabling it loads the worker script and the WASM once; it is reused afterwards.

### Replace data by changing `tree`, not by remounting with `:key`

```vue
<!-- Recommended: the Worker and WASM instance are reused; ~600ms for 1M nodes -->
<VueGiantTree :tree="rows" worker-mode />

<!-- Not recommended: every rebuild destroys and recreates the Worker -->
<VueGiantTree :key="reloadKey" :tree="rows" worker-mode />
```

Replacing `tree` goes through the binary streaming channel (UTF-8 + `transfer`), while a remount has to re-initialise the Worker.

### `outputIdOnly` / `filterFn` disable `chunkedBuild`

`chunkedBuild` only applies when `outputIdOnly === true` and no `filterFn` is used. Otherwise the component falls back to the whole-tree JSON path and the main thread is occupied in one go. An `inputBridgeMs` of 0 in `getBuildMetrics()` means the chunked path was not taken.

### Vite needs `worker.format = 'es'`

The component's Worker is an ES module worker (`new Worker(new URL(...), { type: 'module' })`), while Vite bundles workers as `iife` by default and fails at build time:

```ts
// vite.config.ts
export default defineConfig({ worker: { format: 'es' } })
```

## Try it

Both the `workerMode` switch and the two metric methods live in the
[full playground](/en/playground): turn on "workerMode", then press
"getBuildMetrics / getWorkerMetrics" and the panel shows `enabled=true` with real round-trip times.
