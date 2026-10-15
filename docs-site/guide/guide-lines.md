# 连接线几何

## 这一页讲什么

`showLine` 给行渲染补上「层级连接线」。几何在 `lib/guide.ts` 里**一次性预计算**，
只取决于层级结构、与折叠状态无关 —— 所以每个节点只算一次，滚动、展开、折叠都不会让它失效。

每个节点因此多出三个字段：

- `isLastChild`：是否为父节点的最后一个子节点；
- `guideMask`：祖先列贯穿位掩码 —— bit `i` 置位表示「深度 `i` 的祖先不是末子」，该列要画贯穿竖线；
- `markerLine`：标记列（箭头/图标那一格）的竖线段形态。

## 参数

| prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `showLine` | `boolean \| ShowLineOptions` | `false` | `false` 关闭；`true` 用默认样式；对象进一步指定形态、颜色、粗细 |

### ShowLineOptions

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `style` | `'solid' \| 'dashed' \| 'dotted'` | `'solid'` | 线形 |
| `color` | `string` | `'#d0d4dc'` | 任意合法 CSS color |
| `width` | `number` | `1` | 像素，正数 |

三种形态：

- `'solid'`（默认）：连续实线，最常见的层级连接线；
- `'dashed'`：`linear-gradient` 把线切成 4px 实线 + 4px 间隔的循环；
- `'dotted'`：`radial-gradient` 在 4×4 网格里密铺一个紧凑点，适合深色主题或密集层级。

历史写法（旧的 `'line'`、`'dot'`）与其他非法值会回退到 `'solid'`，不会静默画出错误线形。

## 几何规则

- 只有**叶子节点**在标记列（箭头所在那一格）画连向父节点的折线；**分支节点只用箭头**，不画折线。
- 缩进格会为「仍有后续兄弟」的祖先列画一条贯穿竖线，把上下的结构连起来。
- 叶子折线的收尾形态取决于它在兄弟中的位置，**且顶层与内层不同**：

| 位置 | 顶层（最外层） | 内层 |
| --- | --- | --- |
| 首位叶子 | `┌`（下半段竖线） | `├`（全高竖线） |
| 中间叶子 | `├` | `├` |
| 末位叶子 | `└`（上半段竖线） | `└` |
| 独子叶子 | — | `└` |

只有**最外层**的首位叶子用 `┌` 开顶；内层首位叶子左上方已有缩进竖线接住，所以用 `├`。

## 用法

```vue
<VueGiantTree :tree="rows" root="root" :show-line="true" />

<VueGiantTree
  :tree="rows"
  root="root"
  :show-line="{ style: 'dotted', color: '#3b82f6', width: 2 }"
/>
```

## 动手试试

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="guide-lines" />

这一页的 DEMO 默认已开启连接线。切「数据规模」到 `small` 并全部展开，
就能逐行核对上面那张位置形态表。
