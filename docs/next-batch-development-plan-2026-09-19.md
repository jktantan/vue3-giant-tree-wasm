# Next Batch Development Plan: Remote Tree Loading and Product Boundary

## Context and Corrected Positioning

`VueGiantTree` is suitable for small permission trees as well as large local
trees. When an application needs its existing feature set (checkbox cascade,
search, expand/collapse, field mapping, disabled nodes, and a node slot), a
few hundred or a few thousand nodes are not a reason to choose another tree
component. The integration API is already a normal Vue component API.

For small trees, a mature UI-library tree can have a lower total cost only
when the product needs capabilities that `VueGiantTree` does not yet provide,
such as remote child loading, drag-and-drop, dynamic row heights, complete tree
keyboard navigation, or SSR support. Performance alone is not a reason to
avoid `VueGiantTree`.

## Current `chunkedBuild` Boundary

`chunkedBuild` is an opt-in local-input bridge optimization, not remote lazy
loading:

1. The caller supplies the complete `tree` array before mount.
2. The component slices that array into `buildBatchSize` batches and sends each
   batch through `pushNeighborNodesUtf8`.
3. It yields between batches, then calls `popNeighbor` once after the final
   batch to build MPTT and render the tree.

The WASM layer accumulates batches in a temporary adjacency-list buffer until
`popNeighbor`. It cannot render an early batch, request a node's children, or
merge a newly fetched page into a built tree. The component also does not yet
provide a public append API or a `tree`-change reconciliation path.

Documentation and release notes must therefore describe the current feature as
"chunked local tree build". Do not describe it as remote loading, streaming
rendering, or lazy loading.

## Goal

Add an opt-in remote-tree mode that can fetch and append a node's direct
children without rebuilding the entire tree, while retaining the current
static-tree API and behavior.

The first release is a remote **child-loading tree**, not arbitrary paginated
search across a server-side corpus. Search semantics must be explicit rather
than implying that client fuzzy search covers unloaded nodes.

## Proposed Public API

Use a callback-based API so transport, authorization, pagination, and cache
ownership remain with the application:

```ts
type LoadChildren = (context: {
  node: TreeNodeData | null // null means the configured root
  signal: AbortSignal
}) => Promise<TreeInputItem[]>

interface RemoteTreeOptions {
  loadChildren: LoadChildren
  hasChildren?: (node: TreeInputItem) => boolean
  cachePolicy?: 'component' | 'none'
}
```

- A root load occurs on mount when `remoteTree` is configured.
- Expanding an unloaded node invokes `loadChildren` once; a repeated expand
  reuses the resolved component cache by default.
- A rejected request exposes an error state and supports an explicit retry.
- Collapsing a node aborts no request by default. Unmount and replacement of a
  tree session must abort outstanding requests.
- The first API must keep one source of truth: remote rows are appended to the
  component's internal normalized store, not written directly into the
  caller's `tree` prop.

Before implementation, decide whether `remoteTree` is a dedicated prop or a
headless controller/composable. Do not expose raw `pushNeighborNodesUtf8` as a
component API: it is a transport-efficient build primitive, not a stable UI
contract.

## Data and State Semantics

Each node needs independent child-load state:

```text
unknown -> loading -> loaded
                  -> error
```

Additional requirements:

- Distinguish `unknown` from a loaded empty child list; otherwise leaves cannot
  be rendered correctly.
- Keep selection and collapsed state when children arrive.
- Define disabled-node cascade behavior for children loaded after an ancestor
  has been checked or disabled.
- Reject duplicate IDs and orphan records deterministically, with a documented
  developer-facing error path.
- Preserve input order for siblings unless a sorter is explicitly added later.
- Client fuzzy search searches loaded nodes only. A future server-search API
  must return ancestor context and must not silently mix incomplete results
  with the current local-search view.

## Implementation Phases

### Phase 1: Architecture and Compatibility

- Specify the `remoteTree` API, event names, loading/error slot contract, and
  cache invalidation behavior.
- Add an explicit capability matrix to the README: static local tree,
  `chunkedBuild`, remote children, and server search.
- Verify that static `tree` behavior remains unchanged; do not make remote
  mode the default.

Acceptance: API review includes request cancellation, duplicate IDs, empty
children, retry, selected ancestor, and unloaded-search cases.

### Phase 2: Incremental Core Mutation

- Add a WASM operation that inserts validated direct children into an existing
  parent and updates MPTT boundaries, ID indexes, compact layout, visible
  indices, and selection aggregates.
- Do not implement insertion as `tmpTree + popNeighbor` or a full-tree rebuild.
- Add a batch insert operation to retain a low JS/WASM crossing count.

Acceptance: randomized differential tests compare incremental insertion with a
fresh full build for ordering, MPTT boundaries, visibility, selection states,
disabled propagation, and checked-output modes.

### Phase 3: Vue Remote Controller

- Implement root loading, expand-triggered child loading, deduplication of
  concurrent requests, error/retry, abort on unmount, and component cache.
- Add loading and error presentation through slots or documented row states;
  keep the default UI minimal.
- Refresh only affected virtual rows and preserve scroll position where the
  insertion does not precede the viewport.

Acceptance: browser tests cover root load, child load, repeated expand,
concurrent expand, rejection/retry, unmount during request, and selection
before/after child arrival.

### Phase 4: Performance and Release Gate

- Benchmark remote appends at 1k, 10k, and 100k accumulated nodes with
  representative branch widths.
- Measure request completion to visible-row paint, affected expand P95, heap,
  WASM memory, and JS/WASM bridge volume.
- Run existing static-tree Node, component, and browser gates unchanged.
- Publish migration guidance from `chunkedBuild` and static trees to remote
  mode, including limitations of client-only search.

Acceptance: no static regression beyond an agreed threshold; remote append
does not rebuild the full tree; all current tests and the new remote suite pass.

## Non-Goals for This Batch

- Server-side global fuzzy search.
- Drag-and-drop or arbitrary node moves.
- Dynamic row-height virtualization.
- SSR support and full WAI-ARIA tree keyboard navigation.
- Replacing the current `chunkedBuild` path; it remains the preferred path for
  an already available, large local array.

## Product Messaging After Completion

Use two clear supported scenarios:

1. **Static local tree:** use `tree`; enable `chunkedBuild` for a large local
   array when keeping the main thread responsive matters.
2. **Remote child-loading tree:** use `remoteTree`; children load on demand and
   are incrementally integrated without rebuilding the entire tree.

Do not claim that either mode is universally faster than a mature UI-library
tree. The differentiator is a combination of large-tree capability and the
needed interaction semantics.
