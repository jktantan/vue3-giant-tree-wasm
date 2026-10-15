# docs-site 使用说明站点设计（2026-10-15）

> 状态：已按 owner 的三点答复更新，待批准。批准后进入实现计划（superpowers:writing-plans）。
> 关联：`README.md`（三语，已与代码对齐）、`docs/diagnostics.md`、`docs/performance-gate-2026-09-19.md`。

## 1. 意图

`docs-site/` 目前是空壳（只有 `.vitepress/cache`），但 `package.json` 已有 `docs:dev` / `docs:build` / `docs:preview`，
`.github/workflows/docs.yml` 与 `docs-preview.yml` 已经会构建 `docs-site/.vitepress/dist` 并部署 GitHub Pages。
本次把站点真正建起来：**按算法的能力分页，每页写清参数、用法，并提供在浏览器里跑真实 WASM 的可交互 DEMO。**

owner 已确认的三点：

1. 站点部署为**项目 Pages**：`base = '/vue3-giant-tree-wasm/'`，地址 `https://jktantan.github.io/vue3-giant-tree-wasm/`。
2. 除按页参数化的 DEMO 外，还要一个**完整演示场**。`src/App.vue` 那套「不太完整」，不直接搬，
   而是参考它做一套完整、适配 VitePress 的演示场（规格见 §5.2）。
3. 站点收录一页「已知限制 / 诊断」，内容取自 `docs/diagnostics.md`。
4. **分两阶段落地**：阶段 1 只做中文站（URL 在 root），验证可行 —— wasm 加载方案（§6）、完整演示场（§5.2）、
   `docs:dev` / `docs:build` / `docs:preview` 全部跑通；阶段 2 再扩 English / Русский。§9 的验收标准按阶段拆开。

三语（中文默认 / English / Русский）与 README 一致；README 保留，仅在顶部加站点链接。

## 2. 目标、非目标、反目标

**目标**

- `pnpm docs:dev` / `docs:build` / `docs:preview` 三个脚本正常工作。
- 三语：中文在 `/`，英文在 `/en/`，俄文在 `/ru/`；语言切换与「同一 slug 集合」都成立。
- 每个「算法能力」页包含：能力说明（WASM 侧怎么实现）、参数表、可复制用法示例、可交互 DEMO。
- DEMO 在浏览器里加载真实 release WASM，能切数据规模（含 10 万级）、选择模式、连接线、worker 等。
- 与 CI 契合：`pnpm asbuild:release` → `pnpm docs:build` → `docs-site/.vitepress/dist`。

**非目标**

- 不做 `assembly/` 全部 57 个导出函数的底层 API reference（owner 已选择「按算法能力分页」）。
- 不改 `lib/` 对外 API；不改 README 既有章节（只加一行站点链接）。
- 不引入额外 UI 框架（Tailwind、element-plus 等）；DEMO 控件用原生 HTML + 站点内少量 CSS。

**反目标（这样算失败）**

- DEMO 是截图或假数据。
- SSR 构建期报错（组件 `setup` 顶层就 `new ResizeObserver`、用 `Worker`）。
- wasm 内联进 JS 导致首屏爆大，或部署到 `/vue3-giant-tree-wasm/` 后 wasm 404。
- 三语中有一语缺页或结构不对等。

## 3. 约束与既有事实

- VitePress `1.6.4`。**它自带并固定 `vite@5.4.21`**，与项目根的 `vite@8.3.1`（rolldown-vite，服务于 npm 包与 `src/` dev demo）相互独立。
  站点由 VitePress 自带的 vite 5 构建，站点配置里的 `vite` 选项按 **vite 5** 行为写。
- `sass` 已装，`lib/` 的 `.scss` 可直接用（站点从 `@lib/index.ts` 导入即可带上样式）。
- `lib/` 用 `from '../build/release'` 引用 WASM 产物；根目录 `vite-plugin-assemblyscript.ts` 把它劫持成
  virtual 模块（`virtual:assemblyscript-release`），wasm 在 `generateBundle` emit 成 asset，
  运行时 URL 被换成 `document.baseURI + 文件名`。
- **关键风险**：`document.baseURI` 是「当前页面 URL」，站点页面在 `/guide/…`、`/en/guide/…` 这类子路径下，
  拼出的相对地址会指向错误目录 → 404。站点不能照搬该 URL 策略（见 §6）。
- `lib/VueGiantTree.vue` 在 `setup` 顶层构造 `ResizeObserver`（约 257 行），`tree.worker.ts` 用 `Worker`：
  SSR 期间两者都不存在 → 组件不能参与 SSR。
- 三语 = 内容量约 3 倍，是本任务最大成本项。

## 4. 站点结构与页面清单

### 4.1 语言与目录

```
docs-site/
  .vitepress/
    config.mts          # base、locales、themeConfig、vite 插件
    theme/index.ts      # 扩展默认主题，注册 DEMO 组件
    theme/components/…  # TreePlayground、Playground、数据生成器
  index.md              # 中文首页（默认 locale，URL `/`）
  guide/…               # 中文内容页（URL `/guide/…`）
  playground.md         # 中文完整演示场（URL `/playground`）
  en/index.md  en/guide/…  en/playground.md
  ru/index.md  ru/guide/…  ru/playground.md
  public/…              # 静态资源
```

中文放 root：URL 最短、README 链接最短，且 VitePress 的 locale 切换以 root 为默认最省配置。

### 4.2 页面（每种算法能力一页）

| # | slug | 覆盖的算法 / 模块 | 主要内容 |
|---|------|------------------|---------|
| 1 | `index` | —— | 简介、特性、性能、安装、快速上手、DEMO 入口 |
| 2 | `guide/tree-building` | `tree-builder.ts`、`json/serializer.ts` | 邻接表/MPTT 输入、始终重建 MPTT、`fieldKeys`、`preorderedInput`、`chunkedBuild`、`buildBatchSize` |
| 3 | `guide/virtual-scroll` | `tree-visibility.ts`、`giant-tree.ts` | MPTT O(1) 子树判定、O(k) 视口切片、`lineHeight`、滚动、`expandAll`/`collapseAll`、展开动画（220ms、reduced-motion） |
| 4 | `guide/fuzzy-search` | `tree-search.ts` | 关键词过滤 + 祖先链补全、`fuzzySearch`(300ms 防抖)/`fuzzySearchRaw`、搜索视图独立展开态、`switchDisplay` |
| 5 | `guide/check-and-output` | `tree-check.ts`、`compact-store.ts`、`lazy-check-range-store.ts` | `SelectType`、半选传播、`CheckedOutputMode`、`filterFn`、`v-model` 与 `outputIdOnly`、`setChecked*`/`clearAllChecked` |
| 6 | `guide/serialization` | `tree-serializer.ts` | 可视行 JSON 序列化、JSON 缓存、`TreeNodeData` 字段、`extendData`、`getTreeSize` |
| 7 | `guide/guide-lines` | `lib/guide.ts` | `showLine` 三形态、`color`/`width`、`guideMask`/`markerLine`/`isLastChild` 几何规则、位置形态表 |
| 8 | `guide/node-icons` | `lib/TreeItem.vue` + `NodeIconResolver` | 四种返回值、按业务字段映射 |
| 9 | `guide/crud` | `giant-tree.ts` 结构变更 | `v-model:tree`、`addNode`/`updateNode`/`removeNode`、就地重算 MPTT、状态恢复 |
| 10 | `guide/worker` | `lib/tree.worker.ts` | `workerMode`、命令合并、`getBuildMetrics`/`getWorkerMetrics`、benchmark 引用 |
| 11 | `guide/api-reference` | —— | Props / 方法 / 插槽 / 事件 四张表（与 README 同源） |
| 12 | `platform/known-limitations` | `docs/diagnostics.md` | 已知缺陷与优化项（三语摘要 + 状态表），链接仓库原文档 |
| 13 | `playground` | 全部 | 完整演示场（见 §5.2） |

三语各一份 → 39 个 markdown。第 11 页（API 汇总）三语共用同一份表格文本；第 12 页三语只译摘要与状态。

## 5. DEMO 方案

### 5.1 按页参数化的 DEMO

一个客户端组件 `TreePlayground.vue`，用 props 决定演示哪种能力：

```vue
<TreePlayground preset="check-and-output" :select-type="'CHECKBOX'" :show-line="false" />
```

- 只暴露该页相关的少量控件，避免每页重写一份 demo。
- 数据：`small / medium / 10k` 三档（默认 `medium`），10 万级留给完整演示场，避免拖垮页面。
- 输出区：v-model 结果、节点总数，必要时 `getWorkerMetrics()`。

### 5.2 完整演示场（`playground` 页）

参考 `src/App.vue` 重做一套更完整、且适配 VitePress 的演示场。`src/App.vue` 已有的控件（保留）：

- 数据规模（`guide/small/medium/large/10k/100k/1m`）、选择模式（CHECKBOX/RADIO/SELECT）
- 容器高度、行高、字体大小
- 模糊查询（含清除）、显示模式 TREE/SEARCH
- 开关：禁用数据、`#node` 插槽、MPTT 边界显示、`showLine`、`#actions` 插槽、`outputIdOnly`
- `showLine`：形态 solid/dashed/dotted、颜色预设、粗细
- 节点图标：off/内置/业务字段/单类/部分、暗色图标
- `CheckedOutputMode`：All/RootOnly/LeafOnly/Custom
- `filterFn`：按 category A/B
- 编程式选中：`setCheckedIds` 输入、随机选中
- 操作：重建树、全部展开、全部收起、清除选中、`getTreeSize`、worker 指标
- 选中结果面板（ID / 完整 JSON）
- 行内操作：编辑、加子节点、删除（`updateNode`/`addNode`/`removeNode`）

`src/App.vue` 没有、完整演示场要补上的部分（这就是「更完整」）：

- `workerMode` 开关 + `getWorkerMetrics()` 逐字段展示（含 `structuralBatches`、`lastBatchSize`）
- `chunkedBuild` / `buildBatchSize` 开关
- `preorderedInput` 开关（配一份前序排列的样例数据来体现差异）
- `fieldKeys` 自定义字段名映射（用 `key/label/parent/lft/rgt` 的样例数据）
- `item-contextmenu` 事件日志（演示不 `preventDefault` 的原生菜单行为）
- `getBuildReady()` / `getBuildMetrics()` 的展示
- `switchDisplay` + `refreshCheckedResult` 的组合演示
- 事件/API 调用日志面板（记录每次 emit 与实例方法调用）
- 界面文案跟随所在语言（`zh` / `en` / `ru`），控件标签不写死中文

实现要点：数据生成用自增 ID（不引入 `nanoid` 之类的构建期依赖）；整个演示场用
`defineClientComponent` 懒加载，页面用 VitePress 的 `layout: page` 让组件占满内容区。

### 5.3 SSR 安全

`TreePlayground` 与完整演示场都通过 VitePress 的 `defineClientComponent` 懒加载
（而不是仅用 `<ClientOnly>`），使 SSR 期间完全不 import 它们，从根上避开 `ResizeObserver` / `Worker` 在 Node 中不存在的问题。

### 5.4 代码块与 DEMO 同源

DEMO 是「看得见」，代码块是「抄得走」。示例代码与 README 的示例保持同源，避免两处说法不一致。

## 6. WASM 加载方案（核心技术决策）

现有插件把 wasm URL 拼成 `document.baseURI + 文件名`；在站点的子路径页面上这是错的。

**采用方案**：在 `docs-site/.vitepress/config.mts` 里挂一个精简的 assemblyscript 插件，同样把
`'../build/release'` 劫持成 virtual 模块，但把 loader footer 改成 Vite 原生的 asset URL 机制：

```js
))（改写为 new URL('./release.wasm', import.meta.url) 形式，交给 vite 5 处理）
```

vite 5 会把 `new URL('./release.wasm', import.meta.url)` 重写成带 `base` 前缀的产物 URL，因此：

- base 从 `/` 变成 `/vue3-giant-tree-wasm/` 时 URL 自动正确；
- 子路径页面不会 404；
- wasm 作为独立 asset 输出，不内联。

**备选方案**（仅当首选在站点构建下验证失败）：把 `build/release.wasm` 复制到 `docs-site/public/`，
footer 指向 `${base}release.wasm`。代价是需手动同步 wasm 且失效不易发现。启用时必须在计划里明确记录。

dev 模式（`pnpm docs:dev`）优先用 `build/debug.*`，与根 `vite.config.ts` 的做法一致；产物缺失时插件要给出明确报错，
而不是产出坏站点。

## 7. 与 README 的关系

- README 保留全部现有内容（三语），在语言导航行下方增加一行：
  `> 📖 完整使用说明与在线 DEMO：https://jktantan.github.io/vue3-giant-tree-wasm/`
- 站点首页反向链接 GitHub 仓库、README、`LICENSE`。
- 两边措辞冲突时以 `lib/` 代码为准，并同时修（沿用上一轮的「对齐」原则）。

## 8. 构建与部署

- 不改 `package.json`（三个脚本已在）；不改两个 workflow（路径已匹配 `docs-site/**`）。
- 新增 `docs-site/.vitepress/config.mts`：`base: '/vue3-giant-tree-wasm/'`、`locales`、`themeConfig`、
  `vite.resolve.alias`（`@lib` → `../lib`，`@playground` → 站点组件目录）、`vite.plugins`、本地搜索。
- `docs.yml` 里的 Pages 注释（`base: '/'`）与实际部署不符，需要一并修正注释，避免下次误读。

## 9. 验收标准

> 阶段 1（本次）只验收中文，即下列第 1、2、4、5 条；第 3 条（三语）留到阶段 2。

1. `pnpm docs:build` 成功，产出 `docs-site/.vitepress/dist`，其中包含独立 `.wasm` 资源。
2. `pnpm docs:dev` 下三个语种的全部页面可访问（中文 URL 无 `/zh/` 前缀），每个页面上的 DEMO 可交互：
   能滚动、能切选择模式、能看到 v-model 输出；`/playground` 的完整演示场全部控件可用。
3. 语言切换在 zh / en / ru 之间可用，三语 slug 集合一致。
4. 构建日志无 SSR 错误、无 wasm 404 警告。
5. `pnpm docs:preview` 下以 `/vue3-giant-tree-wasm/guide/check-and-output` 访问时 DEMO 仍能加载 WASM（验证 §6 方案选对了）。

## 10. 我的判断（可推翻）

- **页面数**：13 页偏多，可合并为 10 页（把 `node-icons` 并进 `guide-lines`、`serialization` 并进 `tree-building`、`crud` 并进 API 汇总）。默认仍按 13 页做。
- **三语成本**：先写全中文，英文/俄文按 README 已有对应段落组织翻译，不另起措辞。
- **搜索**：默认主题的本地搜索直接开启。
- **品牌资产**：仓库内没有 logo / OG 图，不凭空造；先用默认主题 + 文字标题，你给素材我再加。
- **演示场 UI 语言**：控件文案跟随页面语言；不额外引入 i18n 库，用各页传入的 locale 选择文案表。
- **设计文档落盘位置**：`docs/superpowers/specs/`（本文件）。是否提交由你决定，我不会自行 `git commit`。
