# Performance Gate Archive: 2026-09-19

Command:

```text
pnpm run gate:phase3-4
```

Environment: release WASM, local system Chromium, Vitest browser runner, 10 samples per workload.

## Node/WASM

- Node tests: 9 files, 112 tests passed.
- 100k capacity: build `432ms`, first shown-index sample `0.14ms`, WASM memory `267,911,168B`.
- Deep width-2 trees: depth 512 build `8.29ms`, depth 1024 build `14.03ms`.
- 1M compact/legacy benchmark: both modes completed; compact root checkbox P95 `30.79ms`, leaf `0.05ms`, batch `49.00ms`.

## Browser Workload

4,620-node workload:

- Scroll action P95 `0.4ms`, render P95 `33.3ms`.
- Collapse action P95 `69.4ms`, render P95 `33.4ms`.
- Checkbox action P95 `18.3ms`, render P95 `33.0ms`.
- Search action P95 `3.7ms`, render P95 `34.0ms`.

100k-node workload:

- Mount to first paint `2742.6ms`.
- Expanded phantom height `262,340px`.
- Scroll action P95 `0.1ms`, render P95 `39.2ms`.
- Checkbox action P95 `81.4ms`, render P95 `33.6ms`.

The Vitest iframe reported scripted layout shifts, but Playwright scripted input was not marked as recent user input. Those shifts are retained for attribution only and are not product CLS.

## Decision

Keep `_shownNodes` as the compatibility/incremental-maintenance structure. Current action timings show that scrolling is not the bottleneck; the dominant cost is browser rendering and, for large checkbox operations, selection propagation. Do not introduce a bitmap or Fenwick structure without a new real-input foreground trace showing a visibility-maintenance bottleneck.

The compact index serialization path remains enabled for numeric/state output. The full index-native visibility rewrite is recorded as a future architecture task because its current rebuild implementation raises 1M expand/collapse P95 to roughly `26/28ms` versus the object incremental baseline around `21/7ms`.
