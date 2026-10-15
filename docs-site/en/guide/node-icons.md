# Node icons

## What this page covers

`nodeIcon` is off by default and therefore does not change the existing row layout. Once enabled:

- a collapsed parent shows a closed folder, an expanded one shows an open folder;
- leaves show a file icon.

Icons usually depend on business type. Do not push front-end asset names from the backend — use a
callback that maps business fields to CSS icon classes on the front end: the backend only needs to
return a stable business field (such as `nodeType`), and the front end decides what it looks like.

## Parameters

| prop | Type | Default | Description |
| --- | --- | --- | --- |
| `nodeIcon` | `boolean \| NodeIconResolver` | `false` | `true` uses the built-in icons; a callback decides per node |

### Callback return values

| Return value | Effect |
| --- | --- |
| `true` | Use the component's built-in icon |
| `false` | No icon for this node |
| `string` | A CSS class shared by both states |
| `{ collapsed: string; expanded?: string }` | Separate CSS classes per state |

An object without `expanded` reuses `collapsed`; leaves also use `collapsed`.

Custom classes must provide the complete icon styling (e.g. `background-image: url(...)`) — that way
multi-colour SVG fills survive instead of being flattened by a single-colour `mask`. Dark themes can
override `background-image` for the same class in a theme selector.

## Usage

```ts
import type { NodeIconResolver } from 'vue3-giant-tree-wasm'

const nodeIcon: NodeIconResolver = node => {
  switch (node.extendData?.nodeType) {
    case 'directory':
      return { collapsed: 'app-icon-folder', expanded: 'app-icon-folder-open' }
    case 'document':
      return 'app-icon-document' // shared by both states
    case 'hidden':
      return false // no icon for this node
    default:
      return true // fall back to the built-in icon
  }
}
```

```vue
<VueGiantTree :tree="rows" root="root" :node-icon="nodeIcon" />
```

## Try it

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="node-icons" />

The "Node icons" switch in the demo uses the built-in icons; turn it off and the row layout goes
back to how it looks without icons — which is exactly why it is off by default.
