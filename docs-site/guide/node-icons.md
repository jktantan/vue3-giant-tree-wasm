# 节点图标

## 这一页讲什么

`nodeIcon` 默认关闭，因此不会改变现有行布局。开启后：

- 父节点在收起状态显示关闭的文件夹、展开状态显示打开的文件夹；
- 叶子节点显示文件图标。

图标往往取决于业务类型。这时不要在后端塞前端资源名，用回调在前端把业务字段映射成 CSS 图标类：
后端只需要返回稳定的业务字段（例如 `nodeType`），前端负责它长什么样。

## 参数

| prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `nodeIcon` | `boolean \| NodeIconResolver` | `false` | `true` 使用内置图标；也可以传回调，按节点决定显示什么 |

### 回调返回值

| 返回值 | 效果 |
| --- | --- |
| `true` | 使用组件的内置图标 |
| `false` | 该节点不显示图标 |
| `string` | 收起/展开共用的 CSS 类 |
| `{ collapsed: string; expanded?: string }` | 分别指定两种状态的 CSS 类 |

对象缺少 `expanded` 时自动复用 `collapsed`；叶子节点也使用 `collapsed`。

自定义类需要提供完整图标样式（例如 `background-image: url(...)`）—— 这种方式会保留 SVG 的多色填充，
不会被单色 `mask` 抹掉。暗色主题可以在主题选择器里为同一个类覆盖 `background-image`。

## 用法

```ts
import type { NodeIconResolver } from 'vue3-giant-tree-wasm'

const nodeIcon: NodeIconResolver = node => {
  switch (node.extendData?.nodeType) {
    case 'directory':
      return { collapsed: 'app-icon-folder', expanded: 'app-icon-folder-open' }
    case 'document':
      return 'app-icon-document' // 两种状态共用
    case 'hidden':
      return false // 这个节点不显示图标
    default:
      return true // 回退到组件内置图标
  }
}
```

```vue
<VueGiantTree :tree="rows" root="root" :node-icon="nodeIcon" />
```

## 动手试试

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="node-icons" />

DEMO 里的「节点图标」开关走的就是内置图标；把它关掉，行布局回到没有图标时的样子 ——
这也是默认关闭的原因。
