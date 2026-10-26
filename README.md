# vue3-giant-tree-wasm

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://jktantan.github.io/vue3-giant-tree-wasm/logo-dark.svg" />
    <img src="https://jktantan.github.io/vue3-giant-tree-wasm/logo.svg" alt="VueGiantTree logo" width="120" height="120" />
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vue3-giant-tree-wasm"><img src="https://img.shields.io/npm/v/vue3-giant-tree-wasm.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/vue3-giant-tree-wasm"><img src="https://img.shields.io/npm/dm/vue3-giant-tree-wasm.svg" alt="npm downloads" /></a>
  <a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/vue3-giant-tree-wasm.svg" alt="license" /></a>
  <a href="https://github.com/jktantan/vue3-giant-tree-wasm"><img src="https://img.shields.io/github/stars/jktantan/vue3-giant-tree-wasm.svg" alt="GitHub stars" /></a>
  <a href="https://jktantan.github.io/vue3-giant-tree-wasm/"><img src="https://img.shields.io/badge/docs-online-blue.svg" alt="documentation" /></a>
</p>

A WebAssembly-accelerated Vue 3 virtual tree component for 100K–1M-node datasets. Tree building, traversal, fuzzy search and check propagation run in AssemblyScript-compiled WASM, using MPTT for O(1) subtree checks and O(k) viewport slicing. Only the rows in view are rendered to the DOM, so interaction stays responsive at a million nodes.

- **WASM-accelerated** — tree building, traversal, fuzzy search and check propagation run in AssemblyScript-compiled WebAssembly
- **Virtual scrolling** — only the rows in view are rendered to the DOM
- **MPTT** — O(1) subtree checks, O(k) viewport slicing, O(subtree + log N) expand/collapse
- **Three selection modes** — checkbox (multi-select), radio (single-select), click-to-select
- **Fuzzy search** — keyword filtering with automatic ancestor chain completion

**Requirements** — Vue `^3.4` (peer dependency) · a browser with WebAssembly support (module Worker support when `workerMode` is enabled) · Node `^20.19` or `>=22.12` only when building from source.
**License** — [BSD-2-Clause](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/LICENSE).

```bash
npm install vue3-giant-tree-wasm
```

```ts
import { VueGiantTree } from 'vue3-giant-tree-wasm'
import 'vue3-giant-tree-wasm/style.css'
```

<a href="https://jktantan.github.io/vue3-giant-tree-wasm/" target="_blank" rel="noopener noreferrer">Documentation</a> · <a href="https://jktantan.github.io/vue3-giant-tree-wasm/playground" target="_blank" rel="noopener noreferrer">Live playground</a> · <a href="https://github.com/jktantan/vue3-giant-tree-wasm" target="_blank" rel="noopener noreferrer">GitHub</a>

[English](#english) | [中文](#中文) | [Русский](#русский)

---

## English

### Introduction

A WebAssembly-powered virtual tree for Vue 3, designed for responsive interaction with 100K–1M-node datasets. The core tree algorithms are written in AssemblyScript and compiled to WASM, leveraging the MPTT (Modified Preorder Tree Traversal) data structure to achieve O(1) subtree checks and O(k) viewport slicing.

### Features

- **WASM-Accelerated** — Tree building, traversal, search, and check operations run in WebAssembly
- **Virtual Scrolling** — Only renders nodes within the visible viewport, minimal DOM footprint
- **MPTT Algorithm** — O(1) subtree checks, O(k) viewport slicing, O(subtree + log N) expand/collapse
- **Smooth Expand/Collapse Animation** — Animates branches already in the viewport without materializing entire subtrees; respects the system reduced-motion preference
- **Three Selection Modes** — Checkbox (multi-select), Radio (single-select), Click-to-Select
- **Fuzzy Search** — Keyword filtering with automatic ancestor chain completion; search-view expand/collapse state is independent from the main tree
- **Expand/Collapse All** — Component instance APIs expand or collapse the current view in one operation
- **Configurable Field Keys** — Custom JSON field name mapping for id / name / parentId / leftNode / rightNode
- **Unified Tree Building** — Always rebuilds MPTT from parentId regardless of input format, avoiding stale leftNode/rightNode
- **JSON Caching** — Returns cached results when scroll position is unchanged
- **TypeScript Support** — Full type definitions exported

When a node expands or collapses, the component creates a short-lived transition layer only for branch rows already in the viewport; it never adds the entire subtree to the DOM for animation. The transition lasts about 220ms, and scrolling is temporarily frozen until it completes to keep the animation stable.

### Installation

```bash
npm install vue3-giant-tree-wasm
# or
pnpm add vue3-giant-tree-wasm
# or
yarn add vue3-giant-tree-wasm
```

Component styles ship as a separate CSS file and must be imported once in your app entry:

```ts
import 'vue3-giant-tree-wasm/style.css'
```

### Quick Start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = [
  { id: '1', name: 'Root', parentId: 'root' },
  { id: '2', name: 'Child A', parentId: '1' },
  { id: '3', name: 'Child B', parentId: '1' },
  { id: '4', name: 'Grandchild A-1', parentId: '2' },
]

const selected = ref<string[]>([])
</script>

<template>
  <div style="width: 400px; height: 600px">
    <VueGiantTree :tree="treeData" root="root" v-model="selected" />
  </div>
</template>
```

The component fills its container: give the wrapper an explicit height as shown above. `width` and `height` default to `100%`.

### Performance

The following reproducible benchmarks use release WASM and local Chromium. Results depend on data shape, browser, hardware, enabled features, and rendering complexity.

- Capacity benchmarks cover datasets up to 1M nodes
- 100K-node scroll action P95: ~0.1 ms
- 4,620-node browser-workload scroll action P95: ~0.4 ms
- Only viewport rows are rendered to the DOM

See the <a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md" target="_blank" rel="noopener noreferrer">performance-gate archive</a> for methodology, environment, and complete results.

### Developer notes

The following are all measured (release WASM + local Chromium); ignoring them tends to produce "fast locally, slow in production" surprises.

**1. Use `shallowRef` for large datasets, not `ref`.** The component walks the whole `tree`, and every property read on a deep-reactive array goes through a Proxy get trap that lazily creates a proxy for each nested object. Measured on 100,000 nodes, `JSON.stringify`: raw array 17.1ms, `ref().value` **277.2ms**, `shallowRef().value` 19.6ms. The component already calls `toRaw()` internally, but `shallowRef` on the host side is cheaper — tree data is only ever replaced wholesale, so it needs no deep reactivity.

**2. Enable `workerMode` from ~100,000 nodes upward:**

| Dataset | `workerMode: false` | `workerMode: true` |
| --- | --- | --- |
| 10,000 | total 22.8ms | roundTrip 42.7ms |
| 100,000 | total 242ms, main thread blocked 249ms | roundTrip **53.4ms**, no blocking |
| 1,000,000 | total 2697ms, main thread blocked 2749ms | roundTrip 584ms |

Below 10,000 the main-thread path is faster (it skips a round trip). Turning the Worker on for the first time carries a one-off load cost; it is reused afterwards.

**3. Replace data by re-assigning the `tree` prop, not by forcing a remount with `:key`.** The former reuses the Worker and WASM instance (~600ms for 1M nodes); the latter tears down and rebuilds the Worker every time.

**4. `chunkedBuild` only takes effect when `outputIdOnly` is `true` and no `filterFn` is used** — otherwise the component falls back to the whole-tree JSON path. An `inputBridgeMs` of 0 in `getBuildMetrics()` means the chunked path was not taken.

### Documentation

Full guides, API reference and a live playground are on the <a href="https://jktantan.github.io/vue3-giant-tree-wasm/" target="_blank" rel="noopener noreferrer">documentation site</a>:

| Topic | Page |
| --- | --- |
| API reference (props / methods / slots / events) | [guide/api-reference](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/api-reference) |
| Tree building and data format | [guide/tree-building](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/tree-building) |
| Virtual scrolling | [guide/virtual-scroll](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/virtual-scroll) |
| Fuzzy search | [guide/fuzzy-search](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/fuzzy-search) |
| Check and output modes | [guide/check-and-output](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/check-and-output) |
| Add, edit and delete nodes | [guide/crud](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/crud) |
| Node icons | [guide/node-icons](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/node-icons) |
| Guide lines | [guide/guide-lines](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/guide-lines) |
| Serialization and field mapping | [guide/serialization](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/serialization) |
| Worker mode | [guide/worker](https://jktantan.github.io/vue3-giant-tree-wasm/en/guide/worker) |
| Known limitations | [platform/known-limitations](https://jktantan.github.io/vue3-giant-tree-wasm/en/platform/known-limitations) |
| Live playground | [playground](https://jktantan.github.io/vue3-giant-tree-wasm/en/playground) |

### Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build WASM
pnpm asbuild

# Build component library
pnpm lib:build
```

### Contributing

Issues and pull requests are welcome. For bug reports, include a minimal reproduction (data shape, browser, and the props you used). For larger changes, open an issue first so we can align on the approach.

Before opening a PR, run `pnpm install && pnpm test`.

### License

<a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">BSD 2-Clause</a>

---

## 中文

### 简介

面向 10 万至百万级节点数据的 Vue 3 + WebAssembly 虚拟树组件。核心树算法使用 AssemblyScript 编写并编译为 WASM，利用 MPTT（改进的前序遍历树）数据结构实现 O(1) 子树判定和 O(k) 可视区域切片，专注大规模树的交互性能。

**环境要求** — Vue `^3.4`（peer dependency）；浏览器需支持 WebAssembly，启用 `workerMode` 时需要 module Worker；从源码构建需要 Node `^20.19` 或 `>=22.12`。

### 特性

- **WASM 加速** — 树构建、遍历、搜索、选中等核心运算在 WebAssembly 中执行
- **虚拟滚动** — 仅渲染可视区域内的节点，DOM 占用极低
- **MPTT 算法** — O(1) 子树判定，O(k) 视口切片，O(subtree + log N) 展开/折叠
- **平滑展开/收起动画** — 在不渲染完整子树的前提下，为视口内分支提供流畅过渡；自动遵循系统“减少动态效果”偏好
- **三种选择模式** — 多选 (Checkbox)、单选 (Radio)、点击选中 (Select)
- **模糊搜索** — 关键词过滤并自动补全祖先链；搜索视图支持独立展开/收起，不影响主树状态
- **批量展开/收起** — 通过组件实例 API 一键展开或收起当前视图
- **可配置字段名** — 支持自定义输入 JSON 的字段映射（id / name / parentId / leftNode / rightNode）
- **统一树构建** — 无论输入是邻接表还是 MPTT 格式，始终自动重建 MPTT，避免 stale leftNode/rightNode
- **JSON 缓存** — 滚动位置不变时直接返回缓存，避免重复序列化
- **TypeScript 类型支持** — 完整的类型定义导出

展开或收起节点时，组件仅为当前视口中已有的分支行创建短暂的过渡层，不会因此将整棵子树加入 DOM。动画时长为约 220ms；为保持过渡稳定，滚动会在动画完成前暂时冻结。

### 安装

```bash
npm install vue3-giant-tree-wasm
# 或
pnpm add vue3-giant-tree-wasm
# 或
yarn add vue3-giant-tree-wasm
```

组件样式以独立 CSS 文件随包发布，需要在应用入口引入一次：

```ts
import 'vue3-giant-tree-wasm/style.css'
```

### 快速上手

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = [
  { id: '1', name: '根节点', parentId: 'root' },
  { id: '2', name: '子节点 A', parentId: '1' },
  { id: '3', name: '子节点 B', parentId: '1' },
  { id: '4', name: '孙节点 A-1', parentId: '2' },
]

const selected = ref<string[]>([])
</script>

<template>
  <div style="width: 400px; height: 600px">
    <VueGiantTree :tree="treeData" root="root" v-model="selected" />
  </div>
</template>
```

组件会填满容器，请像上面那样给外层一个明确高度；`width` / `height` 默认是 `100%`。

### 主题与尺寸

组件的主题参考 Element Plus 的组织方式：**颜色与尺寸全部通过 CSS 变量在运行时生效**，`theme` / `size` 只是在组件根节点上挂对应的类。宿主在 `:root`、组件祖先或组件自身上覆盖 `--giant-tree-*` 即可换肤，不需要重新编译样式。

#### 主题模式

| 方式 | 行为 |
| --- | --- |
| 默认（`theme="inherit"`） | 跟随全局约定：`<html class="dark">` 时自动使用暗色 |
| `theme="dark"` | 只让当前实例使用暗色 |
| `theme="light"` | 强制浅色，可用于暗色页面里的浅色面板 |

```vue
<VueGiantTree :tree="treeData" root="root" theme="dark" v-model="selected" />
```

与 Element Plus 同时使用时，Element Plus 的 `html.dark` 会自动生效，无需额外配置。

#### 尺寸预设

| `size` | 字号 | 行高 |
| --- | --- | --- |
| `small` | 12px | 24px |
| `default` | 14px | 26px |
| `large` | 16px | 32px |

```vue
<VueGiantTree :tree="treeData" root="root" size="small" v-model="selected" />
```

显式传入的 `fontSize` / `lineHeight` 优先于预设。行高参与虚拟滚动计算，必须以像素值交给组件（`size` 或 `lineHeight`），不能只靠 CSS。

#### 可覆盖的 CSS 变量

| 变量 | 浅色默认值 | 暗色默认值 | 说明 |
| --- | --- | --- | --- |
| `--giant-tree-color-primary` | `#409eff` | 同左 | 主色：勾选/单选选中、箭头 hover |
| `--giant-tree-color-primary-hover` | `#c6e2ff` | `#1e3248` | 主色的浅色/深色衍生色 |
| `--giant-tree-color-primary-active` | `#337ecc` | `#3a8ee6` | 按下态颜色（供业务样式复用） |
| `--giant-tree-color-danger` | `#ef4f4f` | 同左 | 危险色（供业务样式复用） |
| `--giant-tree-color-disabled` | `#aaa` | `#6c6e72` | 禁用态颜色（供业务样式复用） |
| `--giant-tree-text-color` | `#4d4d4d` | `#e5eaf3` | 文字与未选中图标颜色 |
| `--giant-tree-bg-color` | `transparent` | `#141414` | 容器背景 |
| `--giant-tree-bg-color-hover` | `#c6e2ff` | `#1e3248` | 行 hover / selected 背景 |
| `--giant-tree-line-color` | `#d0d4dc` | `#4c4d4f` | `showLine` 连接线默认颜色 |
| `--giant-tree-line-width` | `1px` | `1px` | `showLine` 连接线默认粗细 |
| `--giant-tree-font-size` | `14px` | 同左 | 行字号 |
| `--giant-tree-row-size` | 跟随 `--giant-tree-font-size`（14px） | 同左 | 箭头/勾选框所在控件列宽 |
| `--giant-tree-indent-size` | 跟随 `--giant-tree-row-size` | 同左 | 每层缩进宽度 |
| `--giant-tree-icon-size` | 跟随 `--giant-tree-row-size` | 同左 | 节点图标、勾选框尺寸 |
| `--giant-tree-disabled-opacity` | `0.45` | 同左 | 禁用行透明度 |
| `--giant-tree-search-hit-bg` | `#ffe58f` | `#6b5410` | 搜索命中底色 |
| `--giant-tree-search-hit-color` | `inherit` | `#e5eaf3` | 搜索命中文字色 |
| `--giant-tree-transition` | `all .3s ease-in-out` | 同左 | 图标状态过渡 |

只换主色时，可以直接用入口导出的 `createGiantTreeThemeVars` 生成配套的 hover / active / 选中背景变量（混色比例与内置主题一致）：

```ts
import { computed } from 'vue'
import { createGiantTreeThemeVars } from 'vue3-giant-tree-wasm'

// dark 传当前实际是否暗色（例如 Element Plus / VitePress 的 html.dark）
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

> 说明：显式传入 `fontSize` 时，组件会在根节点内联写入 `--giant-tree-font-size` 等相关变量，其优先级高于外部 CSS；不传时则完全交给样式表控制。
>
> 只改 `--giant-tree-font-size` 不会改变行高（行高由虚拟滚动使用），需要同步调整 `lineHeight` 或 `size`，避免文字与行高不匹配。

### 性能

以下数据来自 release WASM、本机 Chromium 环境的可重复基准；实际结果会受数据形状、浏览器、硬件、启用功能和行内容复杂度影响。

- 容量基准覆盖最多 100 万节点数据集
- 100,000 节点滚动动作 P95：约 0.1 ms
- 4,620 节点浏览器工作负载滚动动作 P95：约 0.4 ms
- 仅将视口内的行渲染到 DOM

完整测试方法、环境和结果见 <a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md" target="_blank" rel="noopener noreferrer">性能门禁归档</a>。

### 开发者注意事项

下面几条都有实测依据（release WASM + 本机 Chromium），不注意容易出现「本地很快、上线很慢」这类问题。

**1. 大树数据用 `shallowRef`，不要用 `ref`。** 组件会全量遍历 `tree`，深度响应式数组的每次属性读取都要过 Proxy 的 get trap，并为嵌套对象惰性创建代理。10 万节点实测 `JSON.stringify`：原始数组 17.1ms、`ref().value` **277.2ms**、`shallowRef().value` 19.6ms。组件内部已用 `toRaw()` 兜底，但宿主侧用 `shallowRef` 更省——树数据只会整体替换，不需要深层响应式。

**2. 10 万节点以上建议开 `workerMode`：**

| 数据量 | `workerMode: false` | `workerMode: true` |
| --- | --- | --- |
| 1 万 | total 22.8ms | roundTrip 42.7ms |
| 10 万 | total 242ms，主线程阻塞 249ms | roundTrip **53.4ms**，主线程无阻塞 |
| 100 万 | total 2697ms，主线程阻塞 2749ms | roundTrip 584ms |

1 万以下走主线程更快（省一次往返）；Worker 首次开启有一笔一次性加载成本，之后复用。

**3. 换数据直接改 `tree` prop，不要用 `:key` 强制重挂载。** 前者复用 Worker 与 WASM 实例（100 万节点约 600ms）；后者每次都要销毁并重建 Worker。

**4. `chunkedBuild` 只在 `outputIdOnly` 为 `true` 且未使用 `filterFn` 时生效**，否则退回整棵 JSON 路径。`getBuildMetrics().inputBridgeMs` 为 0 就是没走分批的信号。

### 详细文档

完整指南、API 参考与可交互演示见 <a href="https://jktantan.github.io/vue3-giant-tree-wasm/" target="_blank" rel="noopener noreferrer">文档站</a>：

| 主题 | 页面 |
| --- | --- |
| API 参考（Props / 方法 / 插槽 / 事件） | [guide/api-reference](https://jktantan.github.io/vue3-giant-tree-wasm/guide/api-reference) |
| 树构建与数据格式 | [guide/tree-building](https://jktantan.github.io/vue3-giant-tree-wasm/guide/tree-building) |
| 虚拟滚动 | [guide/virtual-scroll](https://jktantan.github.io/vue3-giant-tree-wasm/guide/virtual-scroll) |
| 模糊搜索 | [guide/fuzzy-search](https://jktantan.github.io/vue3-giant-tree-wasm/guide/fuzzy-search) |
| 勾选与输出模式 | [guide/check-and-output](https://jktantan.github.io/vue3-giant-tree-wasm/guide/check-and-output) |
| 节点增删改 | [guide/crud](https://jktantan.github.io/vue3-giant-tree-wasm/guide/crud) |
| 节点图标 | [guide/node-icons](https://jktantan.github.io/vue3-giant-tree-wasm/guide/node-icons) |
| 连接线 | [guide/guide-lines](https://jktantan.github.io/vue3-giant-tree-wasm/guide/guide-lines) |
| 序列化与字段映射 | [guide/serialization](https://jktantan.github.io/vue3-giant-tree-wasm/guide/serialization) |
| Worker 模式 | [guide/worker](https://jktantan.github.io/vue3-giant-tree-wasm/guide/worker) |
| 已知限制 | [platform/known-limitations](https://jktantan.github.io/vue3-giant-tree-wasm/platform/known-limitations) |
| 可交互演示场 | [playground](https://jktantan.github.io/vue3-giant-tree-wasm/playground) |

### 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建 WASM
pnpm asbuild

# 构建组件库
pnpm lib:build
```

### 贡献

欢迎提交 issue 和 pull request。报告 bug 时请附上最小复现（数据形状、浏览器和使用的 props）；较大的改动建议先开 issue 对齐方案。

提交 PR 前请运行 `pnpm install && pnpm test`。

### 许可证

<a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">BSD 2-Clause</a>

---

## Русский

### Введение

Высокопроизводительный компонент дерева с виртуальной прокруткой на основе Vue 3 + WebAssembly, спроектированный для работы с массивными наборами данных. Основные алгоритмы дерева написаны на AssemblyScript и скомпилированы в WASM, используя структуру данных MPTT (Modified Preorder Tree Traversal) для достижения проверки поддерева за O(1) и среза видимой области за O(k) — легко справляясь с сотнями тысяч и даже миллионами узлов.

**Требования** — Vue `^3.4` (peer dependency); браузер с поддержкой WebAssembly (при `workerMode` — module Worker); Node `^20.19` или `>=22.12` только для сборки из исходников.

### Возможности

- **Ускорение через WASM** — Построение дерева, обход, поиск и выбор выполняются в WebAssembly
- **Виртуальная прокрутка** — Рендерятся только узлы в видимой области, минимальное использование DOM
- **Алгоритм MPTT** — Проверка поддерева за O(1), срез viewport за O(k), развёртывание/свёртывание за O(поддерево + log N)
- **Плавная анимация развёртывания/свёртывания** — Анимирует ветви в текущей области просмотра, не добавляя в DOM всё поддерево; учитывает системное предпочтение уменьшения анимации
- **Три режима выбора** — Чекбокс (множественный), Радиокнопка (одиночный), Выбор по клику
- **Нечёткий поиск** — Фильтрация по ключевому слову с автоматическим дополнением цепочки предков; состояние развёртывания в режиме поиска не влияет на основное дерево
- **Массовое развёртывание/свёртывание** — Методы экземпляра разворачивают или свёртывают текущее представление одним вызовом
- **Настраиваемые ключи полей** — Сопоставление пользовательских имён полей JSON (id / name / parentId / leftNode / rightNode)
- **Единое построение дерева** — Всегда перестраивает MPTT из parentId независимо от формата входных данных, избегая устаревших leftNode/rightNode
- **Кэширование JSON** — При неизменной позиции прокрутки возвращается кэшированный результат
- **Поддержка TypeScript** — Полные определения типов

При развёртывании или свёртывании компонента создаётся кратковременный слой перехода только для строк ветви, уже находящихся в области просмотра; всё поддерево не добавляется в DOM ради анимации. Переход длится около 220 мс, а прокрутка временно блокируется до его завершения для стабильности анимации.

### Установка

```bash
npm install vue3-giant-tree-wasm
# или
pnpm add vue3-giant-tree-wasm
# или
yarn add vue3-giant-tree-wasm
```

Стили компонента поставляются отдельным CSS-файлом — подключите их один раз в точке входа приложения:

```ts
import 'vue3-giant-tree-wasm/style.css'
```

### Быстрый старт

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = [
  { id: '1', name: 'Корень', parentId: 'root' },
  { id: '2', name: 'Дочерний A', parentId: '1' },
  { id: '3', name: 'Дочерний B', parentId: '1' },
  { id: '4', name: 'Внук A-1', parentId: '2' },
]

const selected = ref<string[]>([])
</script>

<template>
  <div style="width: 400px; height: 600px">
    <VueGiantTree :tree="treeData" root="root" v-model="selected" />
  </div>
</template>
```

Компонент заполняет контейнер, поэтому задайте обёртке явную высоту (как выше). `width` и `height` по умолчанию равны `100%`.

### Производительность

Приведённые данные получены на release-WASM в локальном Chromium с воспроизводимыми бенчмарками; фактические результаты зависят от формы данных, браузера, оборудования, включённых функций и сложности содержимого строк.

- Бенчмарки ёмкости покрывают наборы данных до 1 млн узлов
- P95 действия прокрутки на 100 000 узлах: ~0,1 мс
- P95 действия прокрутки в браузерной нагрузке на 4 620 узлах: ~0,4 мс
- В DOM рендерятся только строки в области просмотра

Методика, окружение и полные результаты — в <a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md" target="_blank" rel="noopener noreferrer">архиве performance-gate</a>.

### Замечания для разработчиков

Всё ниже измерено (release WASM + локальный Chromium); без учёта этих пунктов легко получить «локально быстро, в продакшене медленно».

**1. Для больших наборов данных используйте `shallowRef`, а не `ref`.** Компонент обходит весь `tree`, и каждое чтение свойства в глубоко реактивном массиве проходит через get trap прокси, лениво создавая прокси для вложенных объектов. Замер на 100 000 узлов, `JSON.stringify`: обычный массив 17.1ms, `ref().value` **277.2ms**, `shallowRef().value` 19.6ms. Внутри компонента уже есть `toRaw()`, но `shallowRef` на стороне хоста дешевле — данные дерева всегда заменяются целиком, глубокая реактивность не нужна.

**2. Включайте `workerMode` начиная примерно со 100 000 узлов:**

| Данные | `workerMode: false` | `workerMode: true` |
| --- | --- | --- |
| 10 000 | total 22.8ms | roundTrip 42.7ms |
| 100 000 | total 242ms, главный поток заблокирован 249ms | roundTrip **53.4ms**, без блокировки |
| 1 000 000 | total 2697ms, главный поток заблокирован 2749ms | roundTrip 584ms |

До 10 000 узлов основной поток быстрее (не тратится round-trip). Первое включение Worker несёт разовую стоимость загрузки, дальше он переиспользуется.

**3. Меняйте данные, переприсваивая prop `tree`, а не принудительным ремаунтом через `:key`.** Первый способ переиспользует Worker и экземпляр WASM (~600ms для 1 млн узлов); второй каждый раз уничтожает и создаёт Worker заново.

**4. `chunkedBuild` действует только при `outputIdOnly === true` и без `filterFn`** — иначе компонент возвращается к JSON-пути для всего дерева. `inputBridgeMs === 0` в `getBuildMetrics()` означает, что пакетный путь не использовался.

### Документация

Полные руководства, справочник API и интерактивная демо-площадка — на <a href="https://jktantan.github.io/vue3-giant-tree-wasm/" target="_blank" rel="noopener noreferrer">сайте документации</a>:

| Тема | Страница |
| --- | --- |
| Справочник API (props / методы / слоты / события) | [guide/api-reference](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/api-reference) |
| Построение дерева и формат данных | [guide/tree-building](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/tree-building) |
| Виртуальная прокрутка | [guide/virtual-scroll](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/virtual-scroll) |
| Нечёткий поиск | [guide/fuzzy-search](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/fuzzy-search) |
| Режимы выбора и вывода | [guide/check-and-output](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/check-and-output) |
| Добавление, изменение и удаление узлов | [guide/crud](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/crud) |
| Значки узлов | [guide/node-icons](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/node-icons) |
| Направляющие линии | [guide/guide-lines](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/guide-lines) |
| Сериализация и сопоставление полей | [guide/serialization](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/serialization) |
| Режим Worker | [guide/worker](https://jktantan.github.io/vue3-giant-tree-wasm/ru/guide/worker) |
| Известные ограничения | [platform/known-limitations](https://jktantan.github.io/vue3-giant-tree-wasm/ru/platform/known-limitations) |
| Демо-площадка | [playground](https://jktantan.github.io/vue3-giant-tree-wasm/ru/playground) |

### Разработка

```bash
# Установка зависимостей
pnpm install

# Запуск сервера разработки
pnpm dev

# Сборка WASM
pnpm asbuild

# Сборка библиотеки компонентов
pnpm lib:build
```

### Участие

Issues и pull request'ы приветствуются. В отчёте об ошибке укажите минимальное воспроизведение (форма данных, браузер и используемые props). Для крупных изменений сначала откройте issue, чтобы согласовать подход.

Перед PR запустите `pnpm install && pnpm test`.

### Лицензия

<a href="https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">BSD 2-Clause</a>
