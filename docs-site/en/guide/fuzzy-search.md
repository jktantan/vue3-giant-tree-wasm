# Fuzzy search

## What this page covers

Search does two things: match node names by keyword, then **complete the ancestor chain** of every
hit so the results remain reachable paths in the tree. Both parts run in WASM
(`assembly/tree-search.ts`):

- when a candidate index exists, the first character of the keyword narrows the candidate set
  before substring matching;
- ancestry is decided with the **MPTT range**
  (`leftNode <= node.leftNode && rightNode >= node.rightNode`) — no recursive upwards lookup;
- results go into a separate `searchTree`, so the main tree's collapse state is untouched:
  expanding inside search results never changes the main tree.

| Limit                      | Value        | Meaning                                                                 |
| -------------------------- | ------------ | ----------------------------------------------------------------------- |
| Maximum matches per search | `5000` nodes | Collection stops there, so a huge result set cannot stall serialization |

## Methods

| Method                       | Description                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `fuzzySearch(keyword)`       | Fuzzy search with **300ms debounce**, meant to be bound to an input; an empty string clears it |
| `fuzzySearchRaw(keyword)`    | Immediate, no debounce; an empty string clears it                                              |
| `switchDisplay(displayType)` | Switches between the `DisplayType.TREE` and `DisplayType.SEARCH` views                         |

The search view keeps its own expansion state: expanding a branch while searching leaves the main
tree exactly as collapsed as it was.

## Keyword highlighting

Turn on `search-highlight` and each result wraps only **the typed keyword** in
`<mark class="giant-tree__search-hit">`; the rest of the name stays untouched:

```vue
<VueGiantTree :tree="rows" root="root" search-highlight v-model="selected" />
```

- Off by default. Ancestors that only complete the path are not highlighted unless their own name matches.
- Matching uses the same case-sensitive substring rule as the WASM search, and every occurrence is marked.
- Clearing the search (`fuzzySearchRaw('')`) removes the highlight immediately.
- Styles live in `lib/assets/style/style.scss` (`.giant-tree__search-hit`); override them with the
  `--giant-tree-search-hit-bg` / `--giant-tree-search-hit-color` CSS variables.

When you render rows through the `#node` slot, the built-in `<mark>` does not apply. The slot
receives `highlights` (`SearchHighlightPart[] | null`) with the runs already split; render by `hit`:

```vue
<template #node="{ node, highlights }">
  <span v-if="!highlights">{{ node.name }}</span>
  <span v-else>
    <template v-for="(part, i) in highlights" :key="i">
      <mark v-if="part.hit" class="giant-tree__search-hit">{{
        part.text
      }}</mark>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
```

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree, DisplayType } from 'vue3-giant-tree-wasm'

const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const selected = ref([])
const keyword = ref('')

// the input uses the debounced version; the button uses the immediate one
const onInput = () => treeRef.value?.fuzzySearch(keyword.value)
const searchNow = () => treeRef.value?.fuzzySearchRaw(keyword.value)
const clear = () => {
  keyword.value = ''
  treeRef.value?.fuzzySearchRaw('')
}
// switch back to the full tree by hand (clearing the search does it too)
const backToTree = () => treeRef.value?.switchDisplay(DisplayType.TREE)
</script>

<template>
  <div style="height: 500px">
    <input v-model="keyword" @input="onInput" placeholder="keyword" />
    <button @click="searchNow">Search</button>
    <button @click="clear">Clear</button>
    <button @click="backToTree">Back to full tree</button>
    <VueGiantTree ref="treeRef" :tree="rows" root="root" v-model="selected" />
  </div>
</template>
```

## Try it

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="fuzzy-search" />

Try it: search for `n1` — it matches `n1` and `n10`…`n19`, and each result is shown together with
its ancestors. Now press "Collapse all": that only affects the search view; clear the keyword and
the main tree is unchanged.
"Highlight keyword" is on by default here, so each `n1` is marked on its own; uncheck it to compare.
