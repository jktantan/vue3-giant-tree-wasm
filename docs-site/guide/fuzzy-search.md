# 模糊搜索

## 这一页讲什么

搜索做两件事：按关键词匹配节点名称，然后**把命中节点的祖先链补全**，让结果在树里仍然是可达的路径。
两部分都在 WASM 里完成（`assembly/tree-search.ts`）：

- 匹配时若已建立候选索引，先按关键词的首字符收敛候选集，再做子串匹配；
- 祖先判定用 **MPTT 区间**（`leftNode <= 节点.leftNode && rightNode >= 节点.rightNode`），不需要向上递归查找；
- 结果写进独立的 `searchTree`，主树的折叠状态不受影响 —— 在搜索结果里展开/收起，不会改到主树。

| 限制             | 值            | 说明                                         |
| ---------------- | ------------- | -------------------------------------------- |
| 单次搜索最多匹配 | `5000` 个节点 | 超过后不再继续收集，避免超大结果把序列化拖垮 |

## 方法

| 方法                         | 说明                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- |
| `fuzzySearch(keyword)`       | 带 **300ms 防抖** 的模糊搜索，适合直接绑在输入框上；传空字符串清除搜索 |
| `fuzzySearchRaw(keyword)`    | 立即执行，不防抖；传空字符串清除搜索                                   |
| `switchDisplay(displayType)` | 在 `DisplayType.TREE` 与 `DisplayType.SEARCH` 之间切换视图             |

搜索结果视图的展开/收起状态与主树互相独立：搜索中展开某个分支，清掉关键词后主树仍是原来的折叠状态。

## 关键词高亮

给组件加上 `search-highlight` 后，搜索结果里只把**输入的关键词本身**包进
`<mark class="giant-tree__search-hit">`，其余文字保持原样：

```vue
<VueGiantTree :tree="rows" root="root" search-highlight v-model="selected" />
```

- 默认关闭；祖先节点只是因为补全路径出现，名称不含关键词时不会被高亮；
- 匹配语义与 WASM 搜索一致（区分大小写的子串匹配），名称中出现多次时全部标记；
- 清空搜索（`fuzzySearchRaw('')`）后高亮立即消失；
- 样式在 `lib/assets/style/style.scss`（`.giant-tree__search-hit`），可用 CSS 变量
  `--giant-tree-search-hit-bg` / `--giant-tree-search-hit-color` 覆盖。

使用 `#node` 插槽自定义节点内容时，组件默认的 `<mark>` 不会生效；插槽收到的
`highlights`（`SearchHighlightPart[] | null`）已经是切好的片段，按 `hit` 渲染即可：

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

## 用法

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree, DisplayType } from 'vue3-giant-tree-wasm'

const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const selected = ref([])
const keyword = ref('')

// 输入框用带防抖的版本，回车/按钮用立即版本
const onInput = () => treeRef.value?.fuzzySearch(keyword.value)
const searchNow = () => treeRef.value?.fuzzySearchRaw(keyword.value)
const clear = () => {
  keyword.value = ''
  treeRef.value?.fuzzySearchRaw('')
}
// 手动切回完整树视图（清除搜索也会回到 TREE）
const backToTree = () => treeRef.value?.switchDisplay(DisplayType.TREE)
</script>

<template>
  <div style="height: 500px">
    <input v-model="keyword" @input="onInput" placeholder="输入关键词" />
    <button @click="searchNow">搜索</button>
    <button @click="clear">清除</button>
    <button @click="backToTree">回到完整树</button>
    <VueGiantTree ref="treeRef" :tree="rows" root="root" v-model="selected" />
  </div>
</template>
```

## 动手试试

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="fuzzy-search" />

试一下：搜 `n1` 会命中 `n1`、`n10`…`n19` 这一批，注意结果里连同它们的祖先一起显示；
再点「全部收起」——收起只会影响搜索结果视图，清掉关键词后主树依旧。
页面上的「搜索关键词高亮」默认开启，命中的 `n1` 会被单独标记；取消勾选即可对比关闭效果。
