# 主题与尺寸

组件的主题参考 Element Plus 的组织方式：**颜色与尺寸通过 CSS 变量在运行时生效**，`theme` / `size` 只负责在组件根节点挂对应的类。浅色变量定义在 `:root`，暗色变量定义在 `html.dark`，所以宿主在组件祖先上覆盖 `--giant-tree-*` 时，浅色和暗色都会跟随，不需要重新编译样式。

## 引入样式

样式随包发布，在应用入口引入一次：

```ts
import 'vue3-giant-tree-wasm/style.css'
```

`package.json` 也提供了 `style` 字段，支持自动注入样式的构建工具可以省略这行。**不引入样式表时组件没有任何样式**，库不会在运行时注入 CSS。

## 主题模式

| 方式                      | 行为                                               |
| ------------------------- | -------------------------------------------------- |
| 默认（`theme="inherit"`） | 跟随全局约定：`<html class="dark">` 时自动使用暗色 |
| `theme="dark"`            | 只让当前实例使用暗色                               |
| `theme="light"`           | 强制浅色，可用于暗色页面里的浅色面板               |

```vue
<VueGiantTree :tree="treeData" root="root" theme="dark" v-model="selected" />
```

与 Element Plus 同时使用时，Element Plus 的 `html.dark` 会自动生效，无需额外配置。

覆盖优先级：

- 浅色 / 暗色变量都在祖先层（`:root` 与 `html.dark`），宿主在 `.brand-tree` 这类祖先上覆盖，切暗色后仍然生效；
- `theme="dark"` 的实例变量声明在组件根节点上。要覆盖这个实例的品牌色，需要用 `:style` 内联变量，或写命中组件根的选择器（如 `html.dark .brand-tree .giant-tree--dark`）；
- 与库同层、同特异性的规则由 CSS 加载顺序决定，推荐用作用域类而不是 `:root`。

## 尺寸预设

| `size`    | 字号 | 行高 |
| --------- | ---- | ---- |
| `small`   | 12px | 24px |
| `default` | 14px | 26px |
| `large`   | 16px | 32px |

```vue
<VueGiantTree :tree="treeData" root="root" size="small" v-model="selected" />
```

显式传入的 `fontSize` / `lineHeight` 优先于预设。行高参与虚拟滚动计算，必须以像素值交给组件（`size` 或 `lineHeight`），不能只靠 CSS。

## CSS 变量

| 变量                                | 浅色默认值                            | 暗色默认值 | 说明                            |
| ----------------------------------- | ------------------------------------- | ---------- | ------------------------------- |
| `--giant-tree-color-primary`        | `#409eff`                             | 同左       | 主色：勾选/单选选中、箭头 hover |
| `--giant-tree-color-primary-hover`  | `#c6e2ff`                             | `#1e3248`  | 主色的浅色/深色衍生色           |
| `--giant-tree-color-primary-active` | `#337ecc`                             | `#3a8ee6`  | 按下态颜色（供业务样式复用）    |
| `--giant-tree-color-danger`         | `#ef4f4f`                             | 同左       | 危险色（供业务样式复用）        |
| `--giant-tree-color-disabled`       | `#aaa`                                | `#6c6e72`  | 禁用态颜色（供业务样式复用）    |
| `--giant-tree-text-color`           | `#4d4d4d`                             | `#e5eaf3`  | 文字与未选中图标颜色            |
| `--giant-tree-bg-color`             | `transparent`                         | `#141414`  | 容器背景                        |
| `--giant-tree-bg-color-hover`       | `#c6e2ff`                             | `#1e3248`  | 行 hover / selected 背景        |
| `--giant-tree-line-color`           | `#d0d4dc`                             | `#4c4d4f`  | `showLine` 连接线默认颜色       |
| `--giant-tree-line-width`           | `1px`                                 | `1px`      | `showLine` 连接线默认粗细       |
| `--giant-tree-font-size`            | `14px`                                | 同左       | 行字号                          |
| `--giant-tree-row-size`             | 跟随 `--giant-tree-font-size`（14px） | 同左       | 箭头/勾选框所在控件列宽         |
| `--giant-tree-indent-size`          | 跟随 `--giant-tree-row-size`          | 同左       | 每层缩进宽度                    |
| `--giant-tree-icon-size`            | 跟随 `--giant-tree-row-size`          | 同左       | 节点图标、勾选框尺寸            |
| `--giant-tree-row-padding-x`        | `5px`                                 | 同左       | 行左右内边距                    |
| `--giant-tree-row-padding-y`        | `0`                                   | 同左       | 行上下内边距（行高仍由 prop 决定） |
| `--giant-tree-row-gap`              | `3px`                                 | 同左       | 行内各列间距                    |
| `--giant-tree-actions-gap`          | `4px`                                 | 同左       | `#actions` 插槽内元素间距       |
| `--giant-tree-row-radius`           | `0`                                   | 同左       | 行背景圆角（hover / selected）  |
| `--giant-tree-font-family`          | `inherit`                             | 同左       | 行字体族，默认继承宿主          |
| `--giant-tree-font-weight`          | `inherit`                             | 同左       | 行字重，默认继承宿主            |
| `--giant-tree-disabled-opacity`     | `0.45`                                | 同左       | 禁用行透明度                    |
| `--giant-tree-search-hit-bg`        | `#ffe58f`                             | `#6b5410`  | 搜索命中底色                    |
| `--giant-tree-search-hit-color`     | `inherit`                             | `#e5eaf3`  | 搜索命中文字色                  |
| `--giant-tree-transition`           | `all .3s ease-in-out`                 | 同左       | 图标状态过渡                    |

## 自定义主题

只换主色时，可以用入口导出的 `createGiantTreeThemeVars` 生成配套的 hover / active / 选中背景变量（混色比例与内置主题一致）：

```ts
import { computed } from 'vue'
import { createGiantTreeThemeVars } from 'vue3-giant-tree-wasm'

const treeThemeVars = computed(() =>
  createGiantTreeThemeVars(primaryColor.value, isDark.value)
)
```

```vue
<VueGiantTree :tree="treeData" root="root" :style="treeThemeVars" v-model="selected" />
```

该函数接受 `#rgb` / `#rrggbb`；其它格式返回空对象，交给主题默认值。

全局换肤：

```css
:root {
  --giant-tree-color-primary: #7c3aed;
  --giant-tree-color-primary-hover: #f3e8ff;
  --giant-tree-bg-color-hover: #f3e8ff;
  --giant-tree-font-size: 15px;
  --giant-tree-row-size: 15px;
}
```

只作用于某个实例（变量会沿 DOM 继承）：

```vue
<div class="brand-tree">
  <VueGiantTree :tree="treeData" root="root" v-model="selected" />
</div>

<style>
.brand-tree {
  --giant-tree-color-primary: #7c3aed;
  --giant-tree-icon-size: 16px;
}
</style>
```

新增主题只需要再加一个类：

```css
.theme-forest {
  --giant-tree-color-primary: #16a34a;
  --giant-tree-color-primary-hover: #dcfce7;
  --giant-tree-bg-color-hover: #dcfce7;
  --giant-tree-text-color: #14532d;
  --giant-tree-line-color: #bbf7d0;
}
```

## 按项目设计系统对齐

行盒与排版优先用变量：

```css
.brand-tree {
  --giant-tree-font-family: 'Inter', system-ui, sans-serif;
  --giant-tree-font-size: 13px;
  --giant-tree-row-size: 13px;
  --giant-tree-indent-size: 16px;
  --giant-tree-icon-size: 16px;
  --giant-tree-row-padding-x: 8px;
  --giant-tree-row-gap: 4px;
  --giant-tree-row-radius: 4px;
  --giant-tree-actions-gap: 6px;
}
```

行高参与虚拟滚动计算，只能通过 `size` / `lineHeight` prop 设置。

结构尺寸规则以 `:where()` 提供（特异性 `(0,1,0)`），普通选择器即可覆盖；scoped 样式里用 `:deep()`：

```css
.my-tree .giant-tree__arrow-cell { width: 18px; }
.my-tree .giant-tree__indent { width: 20px; }
.my-tree .giant-tree__text { font-size: 13px; gap: 6px; }

.my-tree .giant-tree__icon-node-collapsed {
  background-image: url('@/assets/folder-closed.svg');
}
```

## 编译期定制（SCSS）

包根随包发布 `scss/` 源码。先配置 `common/var`，再加载 `index`（Sass 模块只加载一次，顺序不能反）：

```scss
// src/styles/tree.scss
@use 'vue3-giant-tree-wasm/scss/style/common/var' with (
  $giant-tree__color-primary: #7c3aed,
  $giant-tree__row-gap: 4px,
  $giant-tree__row-padding-x: 8px
);
@use 'vue3-giant-tree-wasm/scss/style/index';
```

```ts
// 替代 import 'vue3-giant-tree-wasm/style.css'
import './styles/tree.scss'
```

可配置变量（均为 `!default`）见 `scss/style/common/var.scss`。编译期定制与 `style.css` 只引其一。

## 注意事项

- 显式传入 `fontSize` 时，组件会在根节点内联写入 `--giant-tree-font-size` 等相关变量，其优先级高于外部 CSS；不传时完全交给样式表控制。
- 只改 `--giant-tree-font-size` 不会改变行高，需要同步调整 `lineHeight` 或 `size`，避免文字与行高不匹配。
- `showLine` 的 `color` / `width` 选项优先级高于主题变量；不传时回落到 `--giant-tree-line-color` / `--giant-tree-line-width`。
