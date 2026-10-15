# Checking and output modes

## What this page covers

Checking lives in `assembly/tree-check.ts` and dispatches on `selectType` into three quite
different semantics:

| `SelectType` | Behaviour |
| --- | --- |
| `CHECKBOX` | Sets the target node **and its whole subtree**, then walks every ancestor once, recomputing `checked` (`CHECKED` / `HALF_CHECKED` / `UNCHECKED`) from its direct children |
| `RADIO` | Exactly one node in the whole tree is checked at a time |
| `SELECT` | Click-to-select; also unique tree-wide, but it uses the `selected` field and leaves checkbox state alone |

Two behaviours that are easy to miss:

- **Disabled nodes cannot be selected**: if the target node is `disabled`, the operation returns
  immediately — not even its subtree changes.
- **Ancestor recomputation is idempotent**: every ancestor is recomputed from its children's
  current values rather than by accumulating deltas, so checking the same node twice cannot drift
  the half-checked state.

## Parameters

| prop | Type | Default | Description |
| --- | --- | --- | --- |
| `selectType` | `SelectType` | `SelectType.CHECKBOX` | `CHECKBOX` / `RADIO` / `SELECT` |
| `outputIdOnly` | `boolean` | `true` | `true` gives only the IDs of checked nodes in v-model; `false` gives full `TreeNodeData` |
| `checkedOutputMode` | `CheckedOutputMode` | `CheckedOutputMode.All` | In CHECKBOX mode, which checked nodes reach the output |
| `filterFn` | `FilterFn` | — | Custom filter callback, see the table below |
| `modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | — | The selection (v-model) |

### `CheckedOutputMode`

| Value | Output |
| --- | --- |
| `All` | Every checked node |
| `RootOnly` | Only the roots of fully-checked subtrees (deduped to the topmost) |
| `LeafOnly` | Only leaf nodes |
| `Custom` | Decided by `filterFn` |

### What `filterFn` does in each mode

| Mode | Effect |
| --- | --- |
| `CHECKBOX` + `Custom` | Filters the **output**: a checked node whose `filterFn` returns `false` never reaches v-model |
| `RADIO` | Filters **selectability**: a node whose `filterFn` returns `false` shows no radio button |
| `SELECT` | Not affected |

`filterFn` receives the node's `extendData` (a full copy of the raw row), not a `TreeNodeData`.

## Usage

Only the checked IDs (the default):

```vue
<VueGiantTree :tree="rows" root="root" v-model="selectedIds" />
<!-- selectedIds: ['2', '3'] -->
```

Full node content:

```vue
<VueGiantTree :tree="rows" root="root" :output-id-only="false" v-model="selectedRows" />
<!-- selectedRows: [{ id: '2', name: 'Child A', ... }] -->
```

Only the roots of fully-checked subtrees:

```vue
<VueGiantTree
  :tree="rows"
  root="root"
  :checked-output-mode="CheckedOutputMode.RootOnly"
  v-model="selectedIds"
/>
```

## Try it

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="check-and-output" />

Try it: check the root node, then switch "Output mode" — the panel goes from "every checked node"
to "only the root" or "only leaves". Switch to `RADIO` and the same data shows radio buttons
instead, with at most one selected.
