# docs-site 中文使用说明站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `docs-site/` 用 VitePress 建起中文使用说明站：按算法能力分页，每页写清参数与用法，并提供在浏览器里跑真实 release WASM 的交互 DEMO。

**Architecture:** VitePress 1.6.4（自带 vite 5.4.21）作为站点根，`base: '/vue3-giant-tree-wasm/'`。站点用一份精简的 AssemblyScript 插件把 `'../build/release'` 劫持成 virtual 模块，并把 WASM 用 vite 的 `?url` 资源机制暴露（而不是仓库根插件那套 `document.baseURI` 拼接，后者在子路径页面会 404）。所有 DEMO 组件经 `defineClientComponent` 懒加载，SSR 期间完全不 import，从而绕开 `ResizeObserver` / `Worker` 在 Node 中不存在的问题。

**Tech Stack:** VitePress 1.6.4、Vue 3.5、AssemblyScript WASM（`build/release.{js,wasm}`）、Sass、TypeScript 6。

**Spec:** `docs/superpowers/specs/2026-10-15-docs-site-design.md`

## Global Constraints

- 站点 `base` 固定为 `'/vue3-giant-tree-wasm/'`（项目 Pages），不得写成 `'/'`。
- VitePress `1.6.4` 自带 `vite@5.4.21`：站点 `vite` 配置按 **vite 5** 行为写；不要依赖仓库根 `vite@8`(rolldown) 的行为或插件。
- 本计划只做**中文**（URL 在 root，无 `/zh/` 前缀）；英文与俄文是阶段 2，不在本计划内。
- 不改 `lib/` 的对外 API；不改 `package.json` 的 `scripts`；不改 `lib/tree.worker.ts` 与 `lib/VueGiantTree.vue`。
- 站点组件不得在 SSR 期执行浏览器 API（`ResizeObserver`、`Worker`、`window`、`document`）；一律用 `defineClientComponent`。
- WASM 必须是独立 asset（不得内联进 JS）；EMO 默认数据规模不得高于 `10k`。
- 阶段 1 站点与演示场的界面文案一律中文（三语在阶段 2 由各页 locale 决定）。
- 演示场的默认值必须与 `lib/VueGiantTree.vue` 的 `withDefaults` 一致（`lineHeight: 26`、`fontSize: '14px'`、`outputIdOnly: true`、`checkedOutputMode: All`、`nodeIcon: false`、`showLine: false`、`buildBatchSize: 2000`、`workerMode: false`、`preorderedInput: false`）。
- 每个任务的验证命令必须真实可跑；`pnpm docs:build` 前需存在 `build/release.{js,wasm}`（缺则先 `pnpm asbuild:release`）。

## Review Focus

1. **子路径部署**：站点挂在 `/vue3-giant-tree-wasm/` 下、页面在 `/guide/…` 这类二级路径时，WASM 请求必须仍解析到正确文件（不得 404）。
2. **SSR 构建**：`pnpm docs:build` 的 SSR 阶段不得因 `ResizeObserver` / `Worker` / `window` 报错而失败。
3. **Worker 模式**：演示场打开 `workerMode` 后，worker 脚本必须能加载（站点 `worker.format: 'es'` 与 `.ts` worker 解析都要成立）。
4. **大数据规模**：任何页面（含演示场）的默认数据规模不得让首屏明显卡顿；`100k`/`1m` 必须由用户显式点击才加载。
5. **文档与代码一致**：每页参数表里的默认值与取值，必须与 `lib/VueGiantTree.vue` 的 `withDefaults`、`lib/types.ts` 的定义逐条一致。

---

### Task 1: 站点骨架、`base` 与首页

**Files:**
- Create: `docs-site/.vitepress/config.mts`
- Create: `docs-site/index.md`
- Modify: `docs-site/` 无需改动其它文件（`.vitepress/cache` 是构建缓存）

**Interfaces:**
- Produces: `base = '/vue3-giant-tree-wasm/'`；站点标题 `VueGiantTree`；`themeConfig.nav` 与 `themeConfig.sidebar` 的条目清单（后续任务往里加页）；`vite.resolve.alias` 中 `@lib` → `../lib`（Task 3 起使用）。

- [ ] **Step 1: 写 `docs-site/.vitepress/config.mts` 骨架**

包含 `defineConfig`、`title: 'VueGiantTree'`、`description`、`base: '/vue3-giant-tree-wasm/'`、`cleanUrls: true`、`themeConfig.nav`（首页 / 使用说明 / 演示场 / GitHub `https://github.com/jktantan/vue3-giant-tree-wasm`）、`themeConfig.sidebar`（`/guide/` 分组放 10 个算法页：`tree-building`、`virtual-scroll`、`fuzzy-search`、`check-and-output`、`serialization`、`guide-lines`、`node-icons`、`crud`、`worker`、`api-reference`；`/platform/` 分组放 `known-limitations`）、`themeConfig.search: { provider: 'local' }`、以及空的 `vite: { plugins: [], resolve: { alias: { '@lib': fileURLToPath(new URL('../../lib', import.meta.url)) } }, worker: { format: 'es' } }`。

- [ ] **Step 2: 写 `docs-site/index.md`**

`layout: home`，含 hero（标题、tagline、`actions` 指向 `/guide/tree-building` 与 `/playground`）与一组 features（WASM 加速、虚拟滚动、MPTT、三选择模式、模糊搜索、连接线）。

- [ ] **Step 3: 验证构建通过且产物带 base 前缀**

Run: `pnpm docs:build`
Expected: 命令成功，输出 `docs-site/.vitepress/dist/index.html`。

- [ ] **Step 4: 断言产物里的资源带 base 前缀**

Run: `grep -c '/vue3-giant-tree-wasm/assets/' docs-site/.vitepress/dist/index.html`
Expected: 输出 ≥ 1（若不是 0，说明 `base` 没生效）。

- [ ] **Step 5: Commit**

```bash
git add docs-site/.vitepress/config.mts docs-site/index.md
git commit -m "docs(site): scaffold VitePress site with project base"
```

---

### Task 2: 站点 WASM 加载（核心风险）

**Files:**
- Create: `docs-site/.vitepress/assemblyscript.ts`（站点专用插件）
- Create: `docs-site/.vitepress/theme/components/WasmProbe.vue`（只用于验证的精简组件）
- Create: `docs-site/.vitepress/theme/index.ts`
- Modify: `docs-site/.vitepress/config.mts`（挂插件）
- Create: `docs-site/guide/tree-building.md`（本任务只放一个 `<WasmProbe />`，内容在 Task 5 补）

**Interfaces:**
- Produces: 站点插件 `assemblyscriptSite(): Plugin`，劫持模块 id `'../build/release'` 为 `virtual:site-assemblyscript-release`，`load()` 返回 `build/release.js` 的正文并把结尾
  `))(new URL("release.wasm", import.meta.url));` 替换为 `))(__wasmUrl);`，且在正文顶部加
  `import __wasmUrl from '<构建期实际 .wasm 绝对路径>?url'`。
  dev 用 `build/debug.{js,wasm}`，build 用 `build/release.{js,wasm}`。
- Produces: `WasmProbe.vue` —— 客户端组件，挂载后 `import('../build/release')`，显示 `getSize(实例)` 或模块导出函数数量，用于肉眼确认 WASM 真的加载了。

- [ ] **Step 1: 写站点插件**

关键点（其余为常规 Vite 插件样板）：

```ts
// docs-site/.vitepress/assemblyscript.ts
const VIRTUAL = 'virtual:site-assemblyscript-release'
// resolveId: source === '../build/release' -> VIRTUAL
// load: 读 <root>/build/{release|debug}.js，断言结尾是
//   ))(new URL("release.wasm", import.meta.url));
// 顶部插入：import __wasmUrl from "<abs>/build/release.wasm?url"
// 结尾替换为：))(__wasmUrl);
```

- [ ] **Step 2: 写 `WasmProbe.vue` 并在 `theme/index.ts` 注册**

`WasmProbe.vue` 只在 `onMounted` 里 `import('../build/release')`（客户端），把结果写进 `ref`，模板显示 `已加载：newTree / fuzzyTree / checkNode` 之类的探针结论。

- [ ] **Step 3: 在 `guide/tree-building.md` 用 `defineClientComponent` 引入**

```md
<script setup>
import { defineClientComponent } from 'vitepress'
const WasmProbe = defineClientComponent(() => import('../.vitepress/theme/components/WasmProbe.vue'))
</script>

<WasmProbe />
```

- [ ] **Step 4: 验证 dev 下 WASM 能加载**

Run: `pnpm docs:dev`，浏览器打开 `http://localhost:5173/vue3-giant-tree-wasm/guide/tree-building`
Expected: 页面显示「已加载」探针结论；Network 里 `.wasm` 请求 200。

- [ ] **Step 5: 验证子路径部署下不 404**

Run: `pnpm docs:build && pnpm docs:preview`
然后访问 `http://localhost:4173/vue3-giant-tree-wasm/guide/tree-building`
Expected: 探针仍显示「已加载」，`.wasm` 请求 200（这条是 Review Focus #1 的验证）。

- [ ] **Step 6: Commit**

```bash
git add docs-site/.vitepress/assemblyscript.ts docs-site/.vitepress/theme docs-site/.vitepress/config.mts docs-site/guide/tree-building.md
git commit -m "docs(site): load release WASM through vite asset URLs"
```

---

### Task 3: 数据生成器与按页 DEMO 组件

**Files:**
- Create: `docs-site/.vitepress/theme/components/treeData.ts`
- Create: `docs-site/.vitepress/theme/components/TreePlayground.vue`
- Create: `tests/docs/treeData.test.ts`
- Modify: `docs-site/.vitepress/theme/index.ts`（注册 `TreePlayground`）

**Interfaces:**
- Produces: `treeData.ts`
  - `type TreePreset = 'small' | 'medium' | '10k' | '100k'`
  - `buildTreeData(preset: TreePreset, options?: { disabledEvery?: number; categoryEvery?: number }): TreeInputItem[]`
  - 确定性（无随机、无 `Date.now()`）、ID 用自增字符串（`n1`, `n2`, …），`parentId` 指向父节点，根节点 `parentId` 为 `'root'`。
  - 规模：`small` 约 30 个节点、`medium` 约 300、`10k` 恰好 10000。
- Produces: `TreePlayground.vue` props
  - `preset: 'tree-building' | 'virtual-scroll' | 'fuzzy-search' | 'check-and-output' | 'serialization' | 'guide-lines' | 'node-icons' | 'crud'`
  - `selectType?: 'CHECKBOX' | 'RADIO' | 'SELECT'`（默认 `'CHECKBOX'`）
  - `showLine?: boolean`（默认 `false`）、`nodeIcon?: boolean`（默认 `false`）
  - `initialPreset?: TreePreset`（默认 `'medium'`）
  - 组件内部按 `preset` 只渲染相关控件；输出区固定显示 v-model 结果与 `getTreeSize()`。

- [ ] **Step 1: 写失败的测试 `tests/docs/treeData.test.ts`**

用例（断言写死 spec 里的值）：
- `buildTreeData('10k')` 长度为 `10000`，`buildTreeData('100k')` 长度为 `100000`
- `buildTreeData('small')` 每个节点的 `parentId` 都能在结果里找到父节点，或等于 `'root'`
- 同一 preset 连续两次调用结果深度相等（确定性）
- `options.disabledEvery` 为 `3` 时，每第 3 个节点 `disabled === true`

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/docs/treeData.test.ts`
Expected: FAIL，报找不到模块 `docs-site/.vitepress/theme/components/treeData.ts`。

- [ ] **Step 3: 实现 `treeData.ts`**

按 Interfaces 的签名实现；`10k` 用 `count: 10000, branching: 10` 的层序生成，避免深链。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/docs/treeData.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 实现 `TreePlayground.vue`**

从 `@lib/index.ts` 导入 `VueGiantTree` 与枚举。控件用原生 `<button>` / `<select>` / `<input type="checkbox">`。数据规模控件只提供 `small` / `medium` / `10k`（Review Focus #4）。`10k` 只在用户点击后生成（初始不生成）。

- [ ] **Step 6: 在 `guide/guide-lines.md` 里接一个实例并肉眼验证**

Run: `pnpm docs:dev`，打开 `/vue3-giant-tree-wasm/guide/guide-lines`
Expected: 树渲染出来、可滚动、切换 `showLine` 后连接线出现；页面无控制台报错。

- [ ] **Step 7: 跑全量单测确认没影响既有测试**

Run: `pnpm vitest run`
Expected: 既有 166 个用例 + 新增 4 个全部 PASS。

- [ ] **Step 8: 确认 SSR 构建不炸（Review Focus #2）**

Run: `pnpm docs:build`
Expected: 成功；若报 `ResizeObserver is not defined` / `Worker is not defined`，说明某处漏了 `defineClientComponent`。

- [ ] **Step 9: Commit**

```bash
git add docs-site/.vitepress/theme/components tests/docs/treeData.test.ts
git commit -m "docs(site): add data generator and per-page playground"
```

---

### Task 4: 完整演示场

**Files:**
- Create: `docs-site/.vitepress/theme/components/Playground.vue`
- Create: `docs-site/.vitepress/theme/components/playground/ControlPanel.vue`
- Create: `docs-site/.vitepress/theme/components/playground/ApiLog.vue`
- Create: `docs-site/playground.md`
- Modify: `docs-site/.vitepress/theme/index.ts`（注册 `Playground`）

**Interfaces:**
- Consumes: `buildTreeData`（Task 3）
- Produces: `Playground.vue` —— 单一整页组件，覆盖下列控件；输出区显示 v-model 结果、`getTreeSize()`、`getBuildReady()`、`getBuildMetrics()`、`getWorkerMetrics()` 与事件/API 日志。
  - 数据：`small/medium/10k/100k`（`100k` 需显式点击）
  - 选择模式、容器高度、行高、字体大小
  - `showLine`（`solid/dashed/dotted` + 颜色 + 粗细）、`nodeIcon`（off/内置/业务字段）
  - `outputIdOnly`、`checkedOutputMode`（All/RootOnly/LeafOnly/Custom）、`filterFn`（按 category）
  - `workerMode`、`chunkedBuild` + `buildBatchSize`、`preorderedInput`
  - `fieldKeys`（用 `key/label/parent/lft/rgt` 样例数据）
  - 方法：`expandAll` / `collapseAll` / `clearAllChecked` / `setCheckedByIds` / `switchDisplay` / `refreshCheckedResult` / `updateNode` / `addNode` / `removeNode`
  - 事件：`update:modelValue` / `update:tree` / `item-contextmenu` 全部记进 `ApiLog`

- [ ] **Step 1: 写 `ApiLog.vue`**

`props: { entries: { type: Array as PropType<{ at: number; text: string }[]> } }`，只负责渲染最近 50 条。

- [ ] **Step 2: 写 `ControlPanel.vue`**

`defineModel`/`props + emits` 承载全部控件状态；控件分组与 spec §5.2 一致。

- [ ] **Step 3: 写 `Playground.vue` 并把控件接到 `VueGiantTree`**

`fieldKeys` 演示需要用两套数据：默认字段与自定义字段（`key/label/parent/lft/rgt`），切换时换 `tree` 与 `fieldKeys`。

- [ ] **Step 4: 写 `playground.md`**

`layout: page`，正文只有 `defineClientComponent` + `<Playground />`。

- [ ] **Step 5: 逐个控件肉眼验证**

Run: `pnpm docs:dev`，打开 `/vue3-giant-tree-wasm/playground`
Expected（逐条勾掉）：滚动流畅；三种选择模式都生效；`showLine` 三种形态可见；`nodeIcon` 三种模式可见；`checkedOutputMode` 四个值输出不同；`filterFn` 改变输出；`workerMode` 打开后 `getWorkerMetrics()` 出现非零 `lastRoundTripMs`（Review Focus #3）；`chunkedBuild`/`preorderedInput` 切换不报错；`fieldKeys` 切换后树仍正确；增删改后 `v-model:tree` 更新且树未重挂载；右键触发 `item-contextmenu` 日志且原生菜单未被阻止。

- [ ] **Step 6: Commit**

```bash
git add docs-site/.vitepress/theme/components/playground docs-site/.vitepress/theme/components/Playground.vue docs-site/playground.md docs-site/.vitepress/theme/index.ts
git commit -m "docs(site): add full interactive playground"
```

---

### Task 5: 内容页 A —— 树构建、虚拟滚动

**Files:**
- Modify: `docs-site/guide/tree-building.md`（替换 Task 2 的探针内容）
- Create: `docs-site/guide/virtual-scroll.md`

**Interfaces:**
- Consumes: `TreePlayground`（Task 3）的 `preset` 值 `'tree-building'`、`'virtual-scroll'`

- [ ] **Step 1: 写 `tree-building.md`**

四段式：能力说明（`tree-builder.ts` 怎么按 `parentId` 分组、为什么始终重建 MPTT）→ 参数表（`tree`、`root`、`fieldKeys`、`preorderedInput`、`chunkedBuild`、`buildBatchSize`，默认值照抄 Global Constraints）→ 用法示例 → `<TreePlayground preset="tree-building" />`。

- [ ] **Step 2: 写 `virtual-scroll.md`**

同四段式，覆盖 `lineHeight`、`height`、`expandAll`/`collapseAll`、展开动画与 reduced-motion、MPTT O(1)/O(k) 的说法（与 README 同一套措辞）。

- [ ] **Step 3: 验证两页可访问且 DEMO 可交互**

Run: `pnpm docs:dev`
Expected: `/guide/tree-building` 与 `/guide/virtual-scroll` 都能打开，DEMO 可滚动、可展开收起。

- [ ] **Step 4: Commit**

```bash
git add docs-site/guide/tree-building.md docs-site/guide/virtual-scroll.md
git commit -m "docs(site): document tree building and virtual scrolling"
```

---

### Task 6: 内容页 B —— 模糊搜索、勾选与输出模式

**Files:**
- Create: `docs-site/guide/fuzzy-search.md`
- Create: `docs-site/guide/check-and-output.md`

**Interfaces:**
- Consumes: `TreePlayground` 的 `preset` 值 `'fuzzy-search'`、`'check-and-output'`

- [ ] **Step 1: 写 `fuzzy-search.md`**

覆盖 `fuzzySearch`（300ms 防抖）/`fuzzySearchRaw`、祖先链补全、搜索视图独立展开态、`switchDisplay`；示例给「输入框 + 防抖搜索 + 清除」。

- [ ] **Step 2: 写 `check-and-output.md`**

覆盖 `SelectType` 三值、半选传播、`CheckedOutputMode` 四值、`filterFn`（CHECKBOX+Custom / RADIO / SELECT 三种关系）、`outputIdOnly`；示例给 `v-model` 两种输出形态。

- [ ] **Step 3: 验证**

Run: `pnpm docs:dev`
Expected: 两页可访问；`check-and-output` 页切换 `checkedOutputMode` 时输出面板随之变化。

- [ ] **Step 4: Commit**

```bash
git add docs-site/guide/fuzzy-search.md docs-site/guide/check-and-output.md
git commit -m "docs(site): document search and check output modes"
```

---

### Task 7: 内容页 C —— 序列化、连接线、节点图标

**Files:**
- Create: `docs-site/guide/serialization.md`
- Create: `docs-site/guide/guide-lines.md`（Task 3 已建占位；本任务补全）
- Create: `docs-site/guide/node-icons.md`

**Interfaces:**
- Consumes: `TreePlayground` 的 `preset` 值 `'serialization'`、`'guide-lines'`、`'node-icons'`

- [ ] **Step 1: 写 `serialization.md`**

覆盖可视行 JSON 序列化、JSON 缓存、`TreeNodeData` 全字段（含 `extendData`、`isLastChild`/`guideMask`/`markerLine`）、`getTreeSize`。

- [ ] **Step 2: 补全 `guide-lines.md`**

`showLine` 三形态与 `color`/`width` 参数表、几何规则（只有叶子画折线、缩进竖线、顶层/内层形态表），DEMO 用 `preset="guide-lines"` 且默认开启 `showLine`。

- [ ] **Step 3: 写 `node-icons.md`**

四种返回值（`true`/`false`/`string`/`{collapsed, expanded?}`）与业务字段映射示例。

- [ ] **Step 4: 验证**

Run: `pnpm docs:dev`
Expected: 三页可访问；`guide-lines` 页 DEMO 默认就有连接线。

- [ ] **Step 5: Commit**

```bash
git add docs-site/guide/serialization.md docs-site/guide/guide-lines.md docs-site/guide/node-icons.md
git commit -m "docs(site): document serialization, guide lines and icons"
```

---

### Task 8: 内容页 D —— 增删改、Worker、API 汇总

**Files:**
- Create: `docs-site/guide/crud.md`
- Create: `docs-site/guide/worker.md`
- Create: `docs-site/guide/api-reference.md`

**Interfaces:**
- Consumes: `TreePlayground` 的 `preset` 值 `'crud'`（已在 Task 3 的 preset 联合类型里定义）

- [ ] **Step 1: 写 `crud.md`**

覆盖 `v-model:tree`、`addNode`/`updateNode`/`removeNode` 的签名与返回值（`boolean`）、就地重算 MPTT 与状态恢复、ID 不可修改。

- [ ] **Step 2: 写 `worker.md`**

覆盖 `workerMode`、命令合并（`structuralBatches`/`structuralOperations`/`lastBatchSize`）、`getBuildMetrics()`、`getWorkerMetrics()` 各字段含义，并链接 `docs/performance-gate-2026-09-19.md`。

- [ ] **Step 3: 写 `api-reference.md`**

Props / 方法 / 插槽 / 事件 四张表，内容与 README 的表格同源（Props 17 行、方法 17 项、插槽 2 个、事件 3 个）。

- [ ] **Step 4: 验证 API 表与代码一致**

Run: `grep -n "withDefaults\|defineExpose\|defineEmits" lib/VueGiantTree.vue`
Expected: 人工逐条比对，确认 `api-reference.md` 三张表无缺项、无多余项（Review Focus #5）。

- [ ] **Step 5: Commit**

```bash
git add docs-site/guide/crud.md docs-site/guide/worker.md docs-site/guide/api-reference.md
git commit -m "docs(site): document CRUD, worker mode and API reference"
```

---

### Task 9: 已知限制页

**Files:**
- Create: `docs-site/platform/known-limitations.md`
- Modify: `docs-site/.vitepress/config.mts`（nav / sidebar 加入该页）

**Interfaces:**
- Consumes: `docs/diagnostics.md`（只读取，不修改）

- [ ] **Step 1: 写已知限制页**

一张表：编号、优先级（🔴/🟠/🟡）、摘要、状态（已修复 / 未修复），数据照抄 `docs/diagnostics.md` 的「完成状态总览」表；文末链接仓库原文档与 `docs/performance-refactor-plan.md`。

- [ ] **Step 2: 验证状态与源文档一致**

Run: `grep -o "✅\|⏭" docs/diagnostics.md | sort | uniq -c`
Expected: `✅` 计 5、`⏭` 计 4；与站点表格的「已修复 / 未修复」计数完全一致。

- [ ] **Step 3: Commit**

```bash
git add docs-site/platform/known-limitations.md docs-site/.vitepress/config.mts
git commit -m "docs(site): add known limitations page"
```

---

### Task 10: README 链接、CI 注释修正与端到端验收

**Files:**
- Modify: `README.md`（语言导航行下方加一行站点入口）
- Modify: `.github/workflows/docs.yml`（Pages 注释 `base: '/'` → `base: '/vue3-giant-tree-wasm/'`）

**Interfaces:**
- Produces: README 顶部一行 `> 📖 完整使用说明与在线 DEMO：https://jktantan.github.io/vue3-giant-tree-wasm/`

- [ ] **Step 1: 给 README 加站点入口**

在 `[中文](#中文) | [English](#english) | [Русский](#русский)` 之后插入那行引用块。

- [ ] **Step 2: 修正 `docs.yml` 的 Pages 注释**

把「Pages 目标：用户名首页（https://jktantan.github.io/），base: '/'」改为项目 Pages 的实际值，避免下次误读。

- [ ] **Step 3: 端到端构建验收**

Run: `pnpm asbuild:release && pnpm docs:build`
Expected: 成功；`docs-site/.vitepress/dist` 里存在独立的 `.wasm` 文件（`ls docs-site/.vitepress/dist/assets/*.wasm` 非空）。

- [ ] **Step 4: 子路径预览验收**

Run: `pnpm docs:preview`
Expected: 访问 `http://localhost:4173/vue3-giant-tree-wasm/playground` 与 `/vue3-giant-tree-wasm/guide/check-and-output`，两页 DEMO 都能加载 WASM 并交互（Review Focus #1）。

- [ ] **Step 5: 全量单测与类型检查无回归**

Run: `pnpm vitest run && npx vue-tsc -b`
Expected: 测试全绿、类型检查退出码 0。

- [ ] **Step 6: Commit**

```bash
git add README.md .github/workflows/docs.yml
git commit -m "docs: link the docs site and fix Pages base comment"
```
