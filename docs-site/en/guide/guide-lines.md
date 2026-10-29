# Guide-line geometry

## What this page covers

`showLine` adds hierarchy connectors to row rendering. The geometry is **precomputed once** in
`lib/core/guide.ts` and depends only on the hierarchy, never on the collapsed state — so each node is
computed once and scrolling, expanding and collapsing never invalidate it.

Each node therefore gains three fields:

- `isLastChild`: whether it is the last child of its parent;
- `guideMask`: a continuation bitmask for indent columns — bit `i` set means "the ancestor at depth
  `i` is not the last child", so that column needs a through line;
- `markerLine`: the vertical segment in the marker column (the arrow/icon cell).

## Parameters

| prop | Type | Default | Description |
| --- | --- | --- | --- |
| `showLine` | `boolean \| ShowLineOptions` | `false` | `false` disables; `true` uses the defaults; an object sets shape, colour and width |

### ShowLineOptions

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `style` | `'solid' \| 'dashed' \| 'dotted'` | `'solid'` | Line shape |
| `color` | `string` | `'#d0d4dc'` | Any legal CSS color |
| `width` | `number` | `1` | Pixels, positive |

Three shapes:

- `'solid'` (default): a continuous line, the most common tree connector;
- `'dashed'`: a `linear-gradient` cycling a 4px stroke and a 4px gap;
- `'dotted'`: a `radial-gradient` tiling a tight dot on a 4×4 grid — good for dark themes or dense
  hierarchies.

Historical spellings (`'line'`, `'dot'`) and other invalid values fall back to `'solid'` rather than
silently drawing the wrong shape.

## Geometry rules

- Only **leaf nodes** draw the connector to their parent in the marker column (the arrow cell);
  **branch nodes show just the arrow**, with no connector.
- Indent cells draw a full-height vertical for each ancestor column that still has later siblings,
  tying the structure together.
- The leaf connector's shape depends on the node's position among its siblings, **and differs
  between the top level and inner levels**:

| Position | Top level | Inner level |
| --- | --- | --- |
| First leaf | `┌` (lower half) | `├` (full height) |
| Middle leaf | `├` | `├` |
| Last leaf | `└` (upper half) | `└` |
| Only child | — | `└` |

Only the **topmost** first leaf opens with `┌`; an inner first leaf already has an indent vertical
above it, so it uses `├`.

## Usage

```vue
<VueGiantTree :tree="rows" root="root" :show-line="true" />

<VueGiantTree
  :tree="rows"
  root="root"
  :show-line="{ style: 'dotted', color: '#3b82f6', width: 2 }"
/>
```

## Try it

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="guide-lines" />

Guide lines are already on in this demo. Switch "Data size" to `small` and expand everything to
check the table above row by row.
