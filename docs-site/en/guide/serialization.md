# Serialization and node data

## What this page covers

The render layer receives the **visible rows as JSON**, produced by `assembly/tree-serializer.ts`.
It does not go through the generic `JSON.stringify`:

- each field is appended from a fixed template, so no generic serializer has to walk objects and
  re-check types;
- small integers use an **ITOA lookup table** (strings for `0..4095` precomputed), which covers
  `leftNode` / `rightNode` / `deep` / `checked` / `selected` — scrolling therefore does not allocate
  a `.toString()` per row;
- strings are only escaped when they actually contain special characters.

The component then layers a **JSON cache** on top: when the scroll position and the visible set are
unchanged, the previous serialization result is reused.

## Node data (TreeNodeData)

| Field | Type | Description |
| --- | --- | --- |
| `id` / `name` / `parentId` | `string` | Original identifier and display name |
| `leftNode` / `rightNode` | `number` | MPTT boundaries, recomputed from `parentId` during building |
| `deep` | `number` | Depth; a child of the root is `0` |
| `checked` | `CheckType` | Checkbox state: `UNCHECKED` / `CHECKED` / `HALF_CHECKED` |
| `selected` | `CheckType` | Click-selection state (`SELECT` mode) |
| `collapsed` | `boolean` | Whether the node is collapsed |
| `disabled` | `boolean` | Whether the node is disabled |
| `extendData` | `Record<string, unknown>` | Full copy of the raw row; this is what `filterFn` receives |
| `isLastChild` | `boolean?` | Whether this is the parent's last child (written only when `showLine` is on) |
| `guideMask` | `number?` | Ancestor-column continuation bitmask (only when `showLine` is on) |
| `markerLine` | `'none' \| 'upper' \| 'lower' \| 'full'?` | Marker-column vertical segment (only when `showLine` is on) |

The last three are **precomputed by the render layer** (see `lib/guide.ts`), not WASM data; they are
not written when `showLine` is off, so rows stay light.

## Usage

Serialization itself is internal to the component; applications normally only care about two things:

```vue
<!-- 1) IDs only: cheapest to serialize and transfer -->
<VueGiantTree :tree="rows" root="root" v-model="selectedIds" />

<!-- 2) full nodes (including extendData): outputIdOnly = false -->
<VueGiantTree :tree="rows" root="root" :output-id-only="false" v-model="selectedNodes" />
```

`extendData` is a full copy of each row's input JSON, so business fields coming back from a backend
can be used directly in `filterFn`, the `#node` slot and the `#actions` slot, with no extra mapping.

## Try it

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="serialization" />

Switch "Data size" to `10k` and scroll: the number of DOM rows keeps depending only on the viewport
height — serialization happens for the visible rows only.
