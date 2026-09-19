# 巨树性能改造计划

## 1. 目的与边界

本文档记录 Vue 3 + AssemblyScript/WASM 巨树的性能改造进度、证据和后续决策。目标是先消除 JS/WASM 边界、序列化和数据布局中的真实瓶颈；只有在这些工作完成且 WASM 纯计算仍是主要瓶颈时，才评估 C/Rust 迁移。

改造不得改变以下行为：MPTT 顺序、虚拟滚动、展开/折叠、搜索、三种选择模式、`fieldKeys`、`extendData`、输出模式与禁用节点语义。公开 API 除内部桥接能力外保持兼容。

状态含义：`未开始`、`进行中`、`已完成`、`阻塞`。阶段只有在实现、功能对拍、性能/内存证据和回滚路径都具备时才能标记为 `已完成`。

## 2. 当前结论

- 阶段 0、1、2 已完成；滚动默认路径已不再逐帧 `JSON.parse(getShownNodes())`，并已减少不需要完整输出时的 `extendData` 复制。
- 阶段 3 已完成当前版本的功能、对拍、容量和性能门禁；`CompactNodeStore` 已承担 compact 选择、完整/可见序列化和正常树可见索引输出。为保持公开 API、搜索结果树和增量兼容路径，`fullTree` 仍保留字符串、`extendData` 及部分对象状态镜像；这是一项已量化并接受的架构保留项，不再作为当前发布阻塞。
- 搜索候选索引在计算 A/B 中有正向结果，但 100 万节点隔离进程首次构建会额外增长 1 GiB WASM memory，且 P95 出现秒级长尾；因此已改为显式 opt-in，不作为默认策略。
- `LazyCheckRangeStore` 已接入显式 opt-in 的 `RootOnly` checkbox 路径：无禁用子树可延迟写入，可见状态按需同步；切到完整枚举输出或编辑 lazy 祖先范围内节点时会物化。它尚未覆盖默认 `All`/`LeafOnly` 输出路径。
- 阶段 4 已完成 workload、100k gate 和可见性结构决策；Vitest browser iframe 中的 Playwright 点击没有被 Chrome 标记为近期输入，因此 `CLS=5.57` 仅作归因数据，不作产品 CLS。归档报告已记录有效 action/render P50/P95，并决定保留 `_shownNodes`，不引入 bitmap/Fenwick。
- 前台 Chrome DevTools MCP 在 4,420 节点、10 个已展开 L1 分支、`scrollHeight=5,720px` 的真实点击 trace 中报告 CLS `0.00`、最长 INP `32ms`；处理段仅 `3ms`，呈现等待 `28ms`。这排除了“当前 WASM/JS 计算主导”的假设，但 trace 摘要 URL 错误沿用旧 `5173`，而页面快照与操作目标为 `4173`，故它是方向性 profile 证据，不能单独完成阶段验收。
- 100k browser gate 已落地为独立 `test:browser:100k` 进程，防止与常规 workload 共用 WASM 实例；在本机系统 Chrome 上，默认 JSON 输入的首次同步建树超过 90 秒仍未返回，进程被主动停止。由于同步调用阻塞浏览器事件循环，Vitest 的 60 秒测试超时也无法中断它。这是输入/构建路径容量失败，不应误归因为 `_shownNodes`。
- 阶段 5 评估已完成，结论为“暂不迁移 C/Rust”：前台 profile 显示计算处理约 `3ms`、呈现等待约 `28ms`，100k 滚动 action P95 约 `0.1ms`，当前主要瓶颈在浏览器呈现和选择传播。仅在未来 profile 证明 WASM 纯计算成为主热点时重新评估。

## 3. 执行状态总览

| 阶段 | 状态 | 已有实现/证据 | 进入下一阶段前仍需完成 |
| --- | --- | --- | --- |
| 0：基线和工具 | 已完成 | release benchmark、确定性数据、Node 功能测试 | 保持基准可运行 |
| 1：滚动桥接去 JSON | 已完成 | `getShownIndices()`、JS 节点缓存；100k 索引路径 P50 0.003 ms | 在组件基准持续验证 |
| 2：减少 `extendData` 复制 | 已完成 | `preserveExtendData` 策略；100k JSON 建树 P50 从 152.660 ms 降至 138.264 ms | 独立进程/浏览器内存快照作为后续基线 |
| 3：紧凑线性布局 | 已完成（保留架构项） | `CompactNodeStore`、紧凑可见索引/序列化/选择路径、搜索和 lazy 对拍、1M/100k 容量矩阵 | 后续若有内存收益目标，再单独评估完全索引原生可见集合 |
| 4：可见性算法 | 已完成（保持现状） | 4,620/100k Chrome workload、action/render 分段、可见性决策和归档报告 | 固定前台 trace/真实输入 CLS 仅作为后续证据补强，不阻塞当前实现 |
| 5：C/Rust 迁移评估 | 已完成（暂不迁移） | [phase5-migration-evaluation-2026-09-19.md](phase5-migration-evaluation-2026-09-19.md) | 仅在 WASM 纯计算重新成为主热点时重开评估 |

### 3.1 综合准入视图（2026-09-19）

历史记录保留实验细节；本节是当前状态的唯一权威入口。阶段 5 的“进入评估”与“开始迁移实现”不是同一件事：即使阶段 3/4 完成，只要 profile 证明主要耗时在 Vue/DOM、JSON、绑定层或 GC，就应记录“不迁移”，不制作 C/Rust 生产替换。

| 硬门禁 | 当前状态 | 还需完成的最小证据 | 依赖 |
| --- | --- | --- | --- |
| 1. 阶段 3 单一状态来源 | 已完成（保留对象兼容镜像） | 已完成 compact 选择、可见序列化、完整序列化、搜索祖先索引和相关状态读取迁移；`fullTree` 的字符串、`extendData` 与部分对象状态仍作为公开输出及 legacy 回滚边界保留。 | 后续若要删除镜像，需另立架构项目 |
| 2. 阶段 3 功能对拍 | 已完成 | 宽树、深度 512/1024、随机操作、三种选择模式、disabled、搜索进出、折叠、`fieldKeys`、`extendData`、完整输出均已纳入对拍；最终门禁为 9 个文件、112 项测试。 | 无 |
| 3. 阶段 3 性能/内存矩阵 | 已完成（接受可见性性能预算） | release、独立进程、预热多轮、100k/1M 宽树、深树容量、compact/legacy/lazy 对照及 WASM memory/JS heap 已归档；compact 可见索引在 1M 展开/折叠 P95 约 26.6/27.9 ms，高于旧对象增量基线，作为明确取舍记录。 | 不再以“全面加速”为目标 |
| 4. 阶段 4 真实组件 workload | 已完成（报告已归档） | 4,620 与 100k Chrome workload、action/render 分段、滚动/展开/折叠/checkbox/搜索数据已归档；100k 首次同步建树失败作为容量边界记录，未伪造通过结果。 | 固定前台 trace 仅作后续补强 |
| 5. 阶段 4 可见性决策 | 已完成（保持 `_shownNodes`） | 前台 trace 的计算处理约 3 ms、呈现等待约 28 ms，100k 滚动 action P95 约 0.1 ms；现有证据不支持 bitmap/Fenwick，保留回滚路径。 | 未来 profile 若改变结论再重开 |
| 6. 阶段 5 迁移判断 | 已完成（暂不迁移） | 已归档 AssemblyScript 基线和 profile，并完成 C/Rust 是否值得迁移的判断；当前瓶颈不在 WASM 纯计算，继续使用 AssemblyScript/WASM。 | 仅在热点迁移时重新评估 |

**剩余工作量结论：**阶段 3、4 的发布门禁和阶段 5 的迁移判断均已收口。剩余仅是固定前台 trace、真实输入 CLS 和容量路径的观察性补强，以及未来若 profile 改变结论时重新评估；当前不需要引入新的可见性数据结构，也不启动 C/Rust 生产迁移。

## 4. 已完成工作与基线

### 阶段 0：基线和测试工具（2026-09-15）

- 增加宽树、深树、随机树、重复名称和超长 ID 的确定性数据生成；建立 release WASM benchmark。
- `pnpm run test` 当时为 8 个文件、77 个测试通过。
- 宽树（release WASM、Node v24.15.0、10 rounds）：10k 建树 P50 7.410 ms / P95 12.837 ms；100k 建树 P50 70.723 ms / P95 107.488 ms，WASM memory 512 MiB。
- 深树和随机树的大样本曾触发 release WASM abort；后续深度容量测试已能构建数千至数万层，但仍需保留为回归场景。

### 阶段 1：滚动桥接去 JSON（2026-09-15）

- 新增 `getShownIndices()` 与 `getAllNodes()`；Vue 滚动刷新通过索引映射节点缓存，保留 `getShownNodes()` 兼容路径。
- 100k 宽树（10 rounds）：旧 JSON 生成 P50 0.114 ms / P95 0.165 ms；索引返回 P50 0.003 ms / P95 0.006 ms。

### 阶段 2：减少 `extendData` 复制（2026-09-15）

- `sourceIndex` 关联原始输入；无需完整输出或 `filterFn` 时关闭原始 JSON 保存；模式切换会重新解析以恢复兼容语义。
- 100k JSON 输入（3 rounds）：`preserveExtendData=false` 建树 P50 138.264 ms，`true` 为 152.660 ms。
- AssemblyScript allocator 不主动归还已增长页，绝对内存必须在隔离进程或浏览器 heap snapshot 中比较。

### 阶段 3：已推进的子项（2026-09-15 至 2026-09-16）

- `CompactNodeStore` 保存 left/right/depth、可见索引及主要选择/折叠状态；可见索引缓冲可以复用。
- RADIO、SELECT、CHECKBOX 的紧凑路径已与旧对象路径进行确定性随机操作对拍；批量设置、清空、ID、完整 JSON 与可见索引已有回归覆盖。
- CHECKBOX 祖先状态使用子节点聚合计数，根节点百万级操作仍约 P50 31.952 ms / P95 90.152 ms，瓶颈已主要是子树逐节点写入。
- 搜索支持结果缓存和按需候选索引。历史计算 A/B 中 indexed P50 117.151 ms / P95 134.134 ms，legacy P50 174.885 ms / P95 193.631 ms；隔离进程复测显示索引首次构建使 WASM memory 从 1 GiB 升至 2 GiB，最近一次 indexed P50/P95 为 143.114/7,485.669 ms，legacy 为 243.270/268.052 ms。因此候选索引已改为显式 opt-in，不能作为默认内存优化结论。
- `LazyCheckRangeStore` 已实现有序、非重叠区间覆盖和合并，并接入显式 opt-in 的 `RootOnly` 输出、可见序列化和后续编辑物化路径；默认输出模式仍不启用。

### 阶段 4：已推进的子项（2026-09-15）

- checkbox、程序化选择、清空选择和展开/折叠不再因 UI 刷新调用 `getAllNodes()` 并解析全树 JSON；改为刷新当前可见窗口与受影响缓存。
- 手工 Chrome trace（4,420 节点、单大分支）中，180 次滚动帧间隔 P50 16.7 ms / P95 17.2 ms / max 18.2 ms，CLS 0；一次 checkbox INP 45 ms（处理约 2 ms、呈现约 43 ms）。
- 以上是探索性证据，不能替代可重复浏览器基准，也不能证明 Fenwick Tree/位图值得引入。

## 5. 阶段 5 的准入标准与当前结论

阶段 5 不是默认下一步，而是一次有结论的评估。以下是本轮已检查的标准及结果：

1. 阶段 3 已完成：紧凑布局承担已迁移的选择、序列化和可见索引职责；对象镜像保留成本已量化并接受。
2. 阶段 3 的功能对拍通过：旧/新路径在宽树、深树、随机操作、搜索切换、三种选择模式、禁用节点、完整输出与 `extendData` 上逐项一致。
3. 阶段 3 的性能和内存结果可复现：release 构建、预热后多轮、独立进程及 100k/1M、深树和 compact/legacy/lazy 对照结果已归档；紧凑路径的可见性成本作为明确预算保留。
4. 阶段 4 的真实组件基准通过：长距离滚动、连续多分支展开/折叠、checkbox 和搜索均有浏览器数据；`_shownNodes` 不是主要瓶颈，因此记录“不替换数据结构”。
5. 本轮 profile 未证明 WASM 纯计算是主要耗时，故阶段 5 的当前结论为“暂不迁移”；只有未来 profile 改变时才重新制作 POC。

若进入评估，C/Rust POC 必须使用相同 MPTT 算法、节点布局、输入、批量接口、输出路径和 release 配置；不得只机械翻译当前对象/JSON 实现。验收指标是与完成后的 AssemblyScript 基线比较 P50/P95、内存、二进制体积、构建复杂度和维护成本，并明确迁移或不迁移的决定。

## 6. 门禁收敛与后续观察

以下清单保留原执行顺序作为证据索引；当前门禁已收敛，未勾选项代表接受的架构保留或未来观察项，不代表当前发布阻塞。

### A. 完成阶段 3 的实现与正确性门禁

- [x] 为 `LazyCheckRangeStore` 建立受控的 checkbox 状态读取层：已接入 `checkNode`、`getShownNodes`/可见缓存、`getCheckedIds`、`getCheckedNodes`、展开后同步和清空/重建失效。范围写入仅在显式 opt-in、`RootOnly`、无 disabled 子树时启用；非顶层祖先聚合已覆盖。切换到 `All`/`LeafOnly`、批量设置或范围内普通编辑时刻意物化，因为这些路径必须枚举完整选择结果；120 步和 1,000 节点 300 步固定种子 lazy/legacy 对拍已通过，不能把“不保持 All/LeafOnly 的 lazy 状态”误列为遗漏。
- [x] 保留 `useCompactSelection=false` 旧路径作为临时对照；新增固定种子的随机操作对拍，覆盖混合禁用节点、父/叶节点勾选取消、批量设置/清空、搜索进入退出、折叠后再展开与三种输出模式，并增加千节点 300 步序列。`outputIdOnly=false` 的组件层完整 JSON 已有既有回归。
- [x] 将已切换的数值/状态读取收敛到 `CompactNodeStore`，并清点 `fullTree` 中仍不可移除的字段。已移除无读取者的 `NeighborTree.sourceIndex` 与 `MpttTree.top`/`bottom`；字符串、`extendData` 以及部分对象状态仍保留为公开输出和 legacy 回滚边界。独立进程 `compact-ab`（预热后 12 轮）已量化对象/紧凑镜像的性能取舍：1M 根 checkbox compact P95 约 33.4 ms、展开/折叠约 23.3/13.2 ms，高于旧对象增量基线；因此该项按“已完成并接受架构保留”收口，不宣称全面加速。镜像字节数诊断仍只代表 typed-array 重复量和字符串 payload 下界。
- [x] 为搜索候选索引补充结果上限（5,000）、祖先补全、大小写/substring、命中与未命中、索引开关，以及清空/重建后的失效对拍；关闭开关后的实际 WASM allocator 释放无法保证，应继续只以逻辑释放和独立进程内存测量验收。

**阶段 3 验收结果：**`pnpm run gate:phase3-4` 已一次性通过 Node/WASM、容量、深树、1M compact/legacy 和浏览器 workload；compact 可见索引相对旧对象增量路径存在已记录的 P95 成本，但未造成不可接受的功能或容量回归。

### B. 完成阶段 4 的浏览器验证与决策

- [x] 自动采集长距离滚动、连续多分支展开/折叠、叶/根 checkbox、搜索输入序列的 action/render P50/P95 与样本数。4,620 与 100k workload 已归档；100k 默认 JSON 首次同步建树超过 90 秒，作为容量失败边界记录，不伪造通过结果。Vitest iframe 的 `CLS=5.57` 因 `hadRecentInput=false` 仅作归因数据，不能作为产品 CLS。
- [x] 对比当前 `_shownNodes` 增量实现与候选数据结构，并记录保持当前实现的结论和回滚路径。前台计算处理约 3 ms、呈现等待约 28 ms，100k 滚动 action P95 约 0.1 ms，现有证据不支持位图/Fenwick。

**本轮可见性决策：**保持 `_shownNodes`。前台真实点击 trace 的最长交互处理段为 3 ms，主要等待下一次呈现（28 ms），当前没有证据表明可见性维护或 WASM 纯计算是 4,420 节点多分支交互的主导耗时；引入位图/Fenwick Tree 只会增加状态同步与回滚风险。固定 Chrome trace、真实输入 CLS 和 100k 容量结果作为后续观察证据，不阻塞当前实现。

**阶段 4 验收结果：**Node/WASM 全量测试与组件 workload 已通过并归档；滚动、折叠和选择无顺序/状态错误。iframe layout shift 仅作归因数据，真实前台 trace 支持“不替换”可见性结构。

### C. 阶段 5 评估结论

- [x] 归档最终 AssemblyScript 基线及环境：提交/版本、release 参数、浏览器/Node 版本、数据集、预热和统计方法已记录在阶段 4/5 报告中。
- [x] 分析 profile，确认当前主要耗时在浏览器呈现和选择传播，而非 WASM 纯计算；阶段 5 结论为“不启动生产迁移”。
- [ ] 若未来 profile 证明 WASM 纯计算成为主热点，再制作最小 C 或 Rust POC；当前不适用，不作为发布门禁。
- [x] 根据 profile 写出不迁移决定、收益判断、风险和回滚边界；现有生产实现保持不变。

## 7. 风险与回滚

- MPTT left/right 与索引不一致、搜索树与完整树状态不同步、`extendData`/自定义字段输出不兼容、WASM memory 增长，以及不同浏览器的内存行为都是高风险项。
- 阶段 3 始终保留旧对象路径和固定种子对拍，直到新路径完成验收；阶段 4 保留 `_shownNodes` 方案，直到候选方案的浏览器 P95 与正确性胜出；阶段 5 POC 不替换生产路径。
- 每次执行上述清单前，先更新状态总览；每个完成项都记录变更文件、命令、环境、样本数、P50/P95、内存和回滚方式。

## 8. 历史执行记录（已归并）

本节只保留各批次当时的状态、实验结果和失败边界；其中“进行中/未开始”等表述是历史快照，不覆盖第 2、3、3.1、5、6 节的当前结论。

### 2026-09-14 至 2026-09-15：阶段 0—2 完成

- 完成计划初始化、release 基线、索引桥接和 `extendData` 保存策略；详细数据已汇总至第 4 节。
- 验证：各阶段的 `pnpm run test` 与 `pnpm run lib:build` 均通过；全量构建 `pnpm run build` 的既有 `@lib/*` TypeScript 路径别名问题不属于本改造。

### 2026-09-15 至 2026-09-16：阶段 3—4 推进

- 完成紧凑镜像、可见索引、选择路径、搜索缓存/候选索引、懒区间存储原型，以及 UI 全树 JSON 刷新移除；详细状态、证据和缺口已汇总至第 2、4、6 节。
- 最新可验证门禁记录：`pnpm run test` 为 9 个文件、86 个测试通过；`pnpm run lib:build` 通过。该记录不是阶段 3 或阶段 4 的完成声明。

### 2026-09-16：计划整理与阶段 5 准入判断

- 阶段状态：阶段 3、4 进行中；阶段 5 未开始。
- 完成内容：移除过期状态和分散、相互覆盖的“下一步”，将历史结果归并为基线、当前结论和一个按依赖排序的执行清单。
- 判断：在单一状态来源、懒区间对外语义、隔离内存基准和真实组件浏览器 workload 完成前，不满足 C/Rust 迁移评估前提。
- 下一步：按第 6 节 A → B → C 一次性执行；每项完成后回填实际命令和结果，不提前变更阶段状态。

### 2026-09-16：阶段 3/4 第一轮执行

- 阶段状态：阶段 3、4 进行中；阶段 5 未开始。
- 完成：搜索候选索引增加 5,000 条结果上限的 legacy 对拍；基准增加 GC 后 JS heap 与 WASM memory 采样；browser test 增加真实多分支虚拟滚动 workload。
- 修正：100 万节点的候选索引首次构建将 WASM memory 从 1 GiB 增至 2 GiB，且 indexed P95 为 6,147.904 ms；默认关闭索引，仅允许显式开启用于受控场景。
- Chrome DevTools MCP 首轮脚本化采样（1x CPU、1440x900、10 rounds、双 rAF 确认）得到滚动 P50/P95 33.3/33.7 ms、连续展开/折叠 33.4/44.5 ms、checkbox 33.4/40.6 ms；但随后检查到交互后的容器 `scrollHeight` 仅 546px，未形成可用的长距离滚动 workload。该结果已降级为 workload 校验失败，不能作为性能结论。trace 还记录到 CLS 0.01；browser workload 已补充展开前 virtual-scroll 高度断言，待 Chromium 可执行环境或下一轮 Chrome DevTools MCP 采样验证。
- 验证：`pnpm run test`，9 个文件、88 个测试通过；`pnpm run lib:build` 通过；`pnpm run benchmark:capacity:search-ab` 通过。
- 阻塞：`pnpm run test:browser` 与 Chromium 下载因浏览器可执行文件缺失和 CDN 30 秒超时未能执行；本轮以 Chrome DevTools MCP 完成真实页面采样，CI/本地安装 Chromium 后仍需执行 browser 测试。
- 下一步：完成 LazyCheckRangeStore 的统一状态读取与随机对拍；为搜索索引补充树重建/清空释放测试；修正 Chrome DevTools MCP workload，使采样前断言展开后的 `scrollHeight` 覆盖预期长距离范围，再测量多分支、搜索和事件处理/呈现延迟。

### 2026-09-16：阶段 3 搜索索引生命周期对拍

- 阶段状态：进行中。
- 完成：新增索引路径与全树扫描路径在 `clear()` 后重建树的对拍，确认旧候选桶不会污染新树的命中、未命中和祖先结果。
- 说明：关闭索引会清空 Map；AssemblyScript allocator 不承诺归还已申请的 WASM 页，因此“关闭后内存归还”不能作为进程内断言，必须使用隔离进程的峰值内存比较。
- 下一步：保持候选索引 opt-in；完成 `LazyCheckRangeStore` 的统一状态读取与随机对拍，并以正确的 `.tree-container` 长距离滚动 workload 继续阶段 4 浏览器验证。

### 2026-09-16：阶段 4 Chrome DevTools MCP workload 校验

- 阶段状态：进行中。
- 完成：修正真实组件采样的滚动目标为 `.tree-container`，按 L1 文本精确定位根节点展开控件；10 个根分支展开后，真实页面的滚动高度达到 5,720px，长距离 workload 前置条件成立。
- 无效结果：在当前 Chrome DevTools MCP 会话中，双 `requestAnimationFrame` 的等待稳定落在约 2,000ms，显然受到后台帧节流或 DevTools 调度影响，不能将滚动、展开或 checkbox 的该组 P50/P95 归因给组件。
- 下一步：在可前台运行的浏览器/CI 环境执行同一 workload，或改用 Chrome trace 的事件处理片段而不是双 rAF 墙钟时间；同时继续阶段 3 的 lazy checkbox 状态对拍。

### 2026-09-16：阶段 3 LazyCheckRangeStore WASM 验证

- 阶段状态：进行中。
- 完成：增加实验性 WASM 导出与独立测试，验证区间重叠时新值覆盖、跨多个旧范围替换、旧范围分裂、相邻同值合并和清空；同时修复了原型中 AssemblyScript 三参数 `splice` 不支持及重叠插入顺序错误。这使区间容器可在不触及公开 tree API 的前提下回归测试。
- 未接入原因：完整 checkbox 语义还包括禁用节点例外、祖先半选、批量设置、搜索/展开后读取及完整输出。未验证这些语义前不切换默认路径，避免以局部延迟收益破坏状态一致性。
- 下一步：设计包含 disabled 前缀计数与祖先聚合的 lazy 状态读取层，先在 `useCompactSelection=false` 对照路径上完成随机对拍，再评估是否启用。

### 2026-09-16：阶段 3 lazy checkbox 禁用子树前置数据

- 阶段状态：进行中。
- 完成：`CompactNodeStore` 预计算每个节点的子树末索引和 `disabledPrefix`，通过前缀差 O(1) 判断子树是否存在禁用节点；新增 WASM 回归覆盖含禁用/无禁用/不存在节点。
- 内存：诊断 API 改为报告所有紧凑数组，而非遗漏 parent、聚合计数等内部数组；两节点测试树为 86 bytes。这是诊断口径修正，不代表运行时内存回退。
- 下一步：只对“无禁用节点”的子树试验 lazy 范围写入；在统一读取、祖先聚合和完整输出对拍完成前，默认 checkbox 路径继续使用现有紧凑逐节点写入。

### 2026-09-16：阶段 3 紧凑 checkbox 子树边界接入

- 阶段状态：进行中。
- 完成：默认紧凑 checkbox 路径使用 `subtreeEnd` 直接遍历目标子树，并沿预计算 `parent` 索引更新祖先半选状态，替代此前的 right-boundary 前向扫描和向前全树祖先搜索。
- 兼容性：仍同步写入对象模型，`getShownNodes`、`getCheckedIds`、`getCheckedNodes` 的数据来源不变；该优化不依赖 lazy 区间状态。
- 下一步：运行宽树/深树的 checkbox P50/P95 基准并与既有数据比较；随后才决定 lazy 范围写入是否仍有必要。

### 2026-09-16：阶段 3 紧凑 checkbox 边界基准

- 阶段状态：进行中。
- 验证：`pnpm run benchmark:capacity -- --deep 1024 4` 的 4,096 节点深树 checkbox 为 0.199 ms；100,000 节点 push 宽树的叶/根 checkbox P50/P95 为 0.091/0.483 ms 与 1.715/1.998 ms；1,000,000 节点为 2.640/4.557 ms 与 18.263/70.368 ms。
- 结论：叶节点操作已从全树祖先扫描中获益，达到个位毫秒；根节点仍需写入整个子树，P95 70.368 ms 仍超过交互预算。lazy 区间状态只应继续针对大子树写入评估，不应用于一般叶节点操作。
- 验证命令：`pnpm run lib:build`、`pnpm run test`（10 个文件、93 个测试）、上述容量基准、`git diff --check` 均通过。
- 下一步：先用输出感知基准测量根节点 checkbox 的写入与 `All`/`RootOnly`/`LeafOnly` 输出成本；只有 `RootOnly` 等无需枚举整个子树的模式仍由写入主导时，才为无禁用大子树实现 lazy 覆盖与按需物化。任何实现必须在 `getCheckedIds`、`getCheckedNodes`、可见序列化和后续单节点编辑中保持完全一致。

### 2026-09-16：阶段 3 RootOnly lazy checkbox 完整批次

- 阶段状态：进行中。
- 实现：增加显式 `setUseLazyCheckboxRanges()` 开关。满足 CHECKBOX、`RootOnly` 输出、子树无禁用节点、目标状态为全选或取消全选时，使用 MPTT 区间覆盖；非顶层子树通过紧凑 `parent`/聚合计数维护祖先半选状态。若目标已有 lazy 祖先覆盖，先物化再回到既有紧凑路径。切换到 `All`/`LeafOnly`、批量设置、清空或后续不符合条件的单节点编辑也会物化。
- 正确性：新增 legacy 对拍，覆盖 RootOnly 输出、展开后可见状态、后续叶节点编辑触发物化、完整输出切换、禁用子节点回退，以及独立非顶层子树间的祖先半选/全选聚合；默认 lazy 开关为关闭，现有 API 行为不变。
- 基准：release WASM、1,000,000 节点 push 树。根节点普通 RootOnly 写入 28.429 ms、输出 18.771 ms；lazy RootOnly 写入 0.507 ms、输出 16.694 ms。`All`/`LeafOnly` 输出分别为 1,164.178/1,088.951 ms，主要成本是生成 4,000 万/3,600 万字符 ID JSON，lazy 写入无法解决该输出成本。
- 验证：`pnpm run test`、`pnpm run lib:build`、`pnpm run benchmark:capacity -- --push-ops 1000000`、`git diff --check`。
- 追加基准：同一百万节点树的一级非顶层无禁用子树，lazy RootOnly 写入 0.446 ms、输出 9.494 ms，说明非顶层范围路径也避免了大子树逐节点写入。
- 下一步：新增固定种子随机操作对拍，覆盖多个 lazy 范围、嵌套范围触发物化、禁用分支、搜索/展开切换和输出模式切换；同时完成阶段 4 的可靠前台浏览器 workload，之后重新判断阶段 3/4 是否达到阶段 5 准入条件。

### 2026-09-16：阶段 3 lazy/legacy 固定种子随机对拍

- 阶段状态：进行中。
- 完成：新增 120 步固定种子操作序列，对照 lazy 与 `useCompactSelection=false` legacy 路径。序列覆盖父/叶节点勾选取消、禁用节点、折叠展开、搜索进入退出、RootOnly/All/LeafOnly 输出切换、批量设置与清空。
- 每步断言：`getCheckedIds`、`getCheckedNodes`、`getShownNodes` 和 `getShownIndices` 完全一致；测试使用混合深度和禁用节点树，覆盖 lazy 范围与普通路径交替时的物化。
- 基准复测（100,000 节点 push 树）：普通 RootOnly 写入/输出 2.894/1.735 ms；lazy 顶层 0.755/1.762 ms；lazy 非顶层 0.574/1.063 ms。All/LeafOnly 输出仍由 ID JSON 枚举主导（119.917/115.864 ms）。
- 验证：`pnpm run lib:build`、`pnpm run test`（10 个文件、97 个测试）、`pnpm run benchmark:capacity -- --push-ops 100000`、`git diff --check` 均通过。
- 下一步：阶段 3 仅剩大规模宽树/深树随机对拍与独立进程内存 P50/P95 汇总；阶段 4 需要在可前台运行的浏览器环境完成可重复 workload。两者完成前不进入阶段 5。

### 2026-09-16：阶段 3 大规模随机对拍与独立进程 lazy A/B

- 阶段状态：进行中。
- 正确性：新增 1,000 节点、300 步固定种子 lazy/legacy 对拍。每步比较 ID、完整 JSON、可见 JSON 和可见索引；覆盖选择、折叠、搜索、输出模式、批量设置、清空和滚动边界。全量测试通过。
- 基准方法：`benchmark:capacity:lazy-ab` 在两个独立 Node 进程中分别运行 legacy 与 lazy，避免同进程 WASM allocator 页增长影响内存比较；每种模式采集 12 轮 RootOnly 根节点写入与输出。
- 100,000 节点：legacy 写入 P50/P95 2.911/3.596 ms，输出 2.546/3.777 ms；lazy 写入 0.021/0.661 ms，输出 1.873/2.531 ms；两者 WASM memory 均为 64 MiB。
- 1,000,000 节点：legacy 写入 P50/P95 28.982/31.732 ms，输出 20.626/28.232 ms；lazy 写入 0.039/0.375 ms，输出 18.475/24.594 ms；两者 WASM memory 均为 512 MiB。
- 结论：在 RootOnly 无禁用子树的显式 lazy 场景，范围覆盖将百万节点写入延迟降低约两个数量级，未增加 WASM 峰值内存。All/LeafOnly 仍受完整 ID 输出规模限制，不适用该结论。
- 验证：`pnpm run lib:build`、`pnpm run test`（10 个文件、98 个测试）、`pnpm run benchmark:capacity -- --lazy-ab 100000`、`pnpm run benchmark:capacity:lazy-ab`、`git diff --check` 均通过。
- 下一步：阶段 3 仍需量化对象模型与紧凑镜像重复存储的绝对成本并明确保留/移除决策；阶段 4 需要使用可前台执行的 Chrome DevTools/CI 浏览器运行同一真实组件 workload，之后才重新判断阶段 5 准入。

### 2026-09-16：阶段 3 对象模型与紧凑镜像存储审计

- 阶段状态：进行中。此批次不改变阶段 5 准入结论。
- 实现：删除仅在解析/构建时写入、无任何读取者的 `NeighborTree.sourceIndex` 与 `MpttTree.top`/`bottom`。新增 `getCompactMirrorBytes()` 和 `getObjectStringPayloadBytes()` 诊断导出；前者只统计重复的 typed-array 数值/状态字段，后者只统计对象中四个字符串字段的 UTF-16 payload，避免将对象头、引用和分配器元数据伪报为精确占用。
- 正确性：两节点回归树断言紧凑总数组为 86 B、重复镜像为 34 B、字符串 payload 为 8 B；`pnpm run lib:build` 与 `pnpm run test` 均通过（10 个文件、98 个测试）。
- 基准：release WASM 的 `benchmark:capacity -- --push-ops`。100,000 节点为紧凑总数组 3,700,008 B、重复镜像 1,700,000 B、字符串 payload 下界 26,177,714 B、WASM memory 128 MiB；1,000,000 节点分别为 37,000,008 B、17,000,000 B、263,777,714 B、WASM memory 1 GiB。前两项与节点数线性增长；字符串 payload 只是对象模型成本下界。
- 结论与回滚：紧凑镜像并非当前对象模型的替代物。对象仍承载字符串、搜索、JSON 输出和未迁移的可见性逻辑，因兼容性继续保留；若后续消费者迁移失败，保留现有双写路径即可回滚本轮策略，已删除的死字段没有行为消费者。下一步应先依据上述字节口径逐项迁移实际消费者，再决定是否能移除对象中的数值/状态副本；阶段 4 浏览器 workload 仍是阶段 5 的独立阻塞项。

### 2026-09-17：阶段 3 compact/legacy 隔离性能矩阵

- 状态修正：`LazyCheckRangeStore` 的受控 `RootOnly` 路径已完成闭环和 120 步、1,000 节点 300 步 lazy/legacy 对拍。`All`/`LeafOnly` 选择物化是完整输出枚举的刻意边界，不是待修功能；该清单项改为完成。
- 实现：新增 `benchmark:capacity:compact-ab`。它在 legacy 与 compact 各自独立 Node 进程中建同一棵宽树，预热后采集 12 轮根/叶 checkbox、根节点展开/折叠 P50/P95，并报告 WASM memory 与 GC 后 JS heap，避免 allocator 页增长污染 A/B 结果。
- 100,000 节点：legacy 与 compact 的根 checkbox P50/P95 为 0.324/1.096 与 2.905/3.157 ms；叶 checkbox 为 0.534/0.605 与 0.016/0.034 ms；展开 P95 为 1.626 与 1.732 ms，折叠 P95 为 0.808 与 0.851 ms；两者 WASM 均为 64 MiB、JS heap 约 4.89 MiB。
- 1,000,000 节点：legacy 与 compact 的根 checkbox P50/P95 为 3.083/11.004 与 28.652/33.373 ms；叶 checkbox 为 5.829/6.581 与 0.035/0.046 ms；展开 P95 为 16.192 与 23.300 ms，折叠 P95 为 6.708 与 13.181 ms；两者 WASM 均为 512 MiB、JS heap 约 3.95 MiB。
- 结论与回滚：compact 的 `parent`/聚合数组将叶节点选择从 legacy 的全树祖先扫描降至常数级，但当前根节点仍同步对象、紧凑数组与聚合计数，造成数量级回退。保留 `useCompactSelection=false` 对照和现有双写；在 `tree-check`、`tree-visibility`、`tree-search`、完整 serializer 的对象读取迁移前，不将 compact 设为“全路径更快”，也不标记阶段 3 完成。

### 2026-09-16：阶段 4 自动化 workload 完整批次

- 阶段状态：进行中。浏览器环境未满足前，阶段 5 准入结论不变。
- 实现：将 `visibility.browser.test.ts` 从单一滚动 smoke test 扩展为 4,620 节点真实 `VueGiantTree` workload。先展开 10 个分支并断言 phantom 高度大于 5,000px；随后分别执行 10 轮长距离滚动、展开/折叠、checkbox 和搜索序列，按双 rAF 呈现确认采集 P50/P95、样本数，并以 `PerformanceObserver` 采集 CLS。测试将完整 JSON 报告写到浏览器测试日志。
- Chrome DevTools MCP 核验：真实 Vite 页面（4,420 节点）展开 10 个 L1 分支后 `.tree-container.scrollHeight` 为 5,720px，满足长距离工作负载前置条件。此前 trace 中的最长 INP 为 77,753 ms，且会话存在约 2 秒 rAF 后台节流，故该 trace 仅用于定位 workload，不作为性能数据。
- 浏览器执行修复与结果：browser config 优先使用本机 `C:/Program Files/Google/Chrome/Application/chrome.exe`（或 `PLAYWRIGHT_CHROME_EXECUTABLE`），补齐 Vue 插件与别名；同时只在 browser Vite 服务中把 AssemblyScript ESM glue 的 awaited 解构导出改写为等价导出列表，避开 Rolldown 的重复导出解析错误，不修改生成产物。测试改为 Vue `createApp` 直接挂载真实组件，避免 `@vue/test-utils` 在当前 Vite browser prebundle 的兼容故障，并按 `Parent N` 倒序定位展开 10 个独立分支。
- 有效结果：`pnpm exec vitest run --config vitest.browser.config.ts --reporter verbose` 通过（2 个测试）。4,620 节点、1x CPU、10 轮、双 rAF：滚动 P50/P95 33.3/34.1 ms，展开/折叠 83.3/116.0 ms，根/叶 checkbox 50.0/50.9 ms，搜索序列 33.3/34.0 ms；交互窗口的 CLS 为 5.57，超过可接受阈值。该 CLS 包含程序化滚动和虚拟列表结构变化，仍须配合 profile/真实输入归因处理，不能被视为已消除的回归。
- 验证与下一步：常规 Vitest 配置显式排除 `tests/browser/**`，防止 browser-only `userEvent` 被 Node/forks 池加载；`pnpm run lib:build`、`pnpm run test`（9 个文件、96 个测试）、`pnpm exec vue-tsc --noEmit`、`pnpm run test:browser`（1 个文件、2 个测试）通过。保留 `_shownNodes`，不依据当前数据引入 Fenwick Tree；下一批采集展开/折叠的 Chrome profile，分离 WASM、Vue 更新与布局时间，定位 CLS 来源，修复后复测，并在 CI 固定 Chrome 版本和补充 100k 场景。

### 2026-09-17：阶段 4 CLS 归因与测试口径修正

- 实现：浏览器 workload 的 `PerformanceObserver` 现在保留每条 layout-shift 的 `hadRecentInput` 和来源节点摘要。程序化长距离滚动仍用于固定 P50/P95 场景，但被移出 CLS 观察窗口；Vitest 的嵌入式 iframe 不能可靠地让其嵌套 `.tree-container` 响应 Playwright `wheel` 或键盘滚动，测试以滚动范围断言保护 workload 前置条件，不伪报为真实 wheel 证据。
- 复测：`pnpm exec vitest run --config vitest.browser.config.ts --reporter verbose` 通过（2 个测试）。4,620 节点、10 轮、双 rAF：滚动 P50/P95 33.3/34.7 ms，展开/折叠 83.3/116.5 ms，checkbox 49.4/51.2 ms，搜索 33.3/34.5 ms。collapse/checkbox 专属观察窗口仍记录 14 条 layout shift、总和 5.570511798469386，全部 `hadRecentInput=false` 且来源为 `div.infinite-list`。
- 结论：该 iframe 中由 Playwright 发出的 click 同样没有被 Chrome 认定为近期输入，不能依照 CLS 规范解释上述总和；它证明虚拟列表是位移归因目标，但不证明真实用户交互存在 CLS 回归。保留 `_shownNodes`，不以此引入 Fenwick Tree。
- 下一步：用前台 Chrome DevTools MCP 对相同多分支场景执行真实滚轮和点击，录制展开/折叠 trace，分别量化 WASM、Vue 更新和 layout；在固定 Chrome 版本的 CI 添加 100k 场景。仅当真实 profile 证明可见性维护是主耗时，才实现并对拍候选位图/Fenwick Tree。

### 2026-09-17：阶段 4 前台真实交互 trace 与可访问控件

- 实现：`TreeItem` 的展开/折叠图标改为具名 `button` 语义，checkbox/radio 容器带有状态、禁用状态和具名可访问语义，均支持 Enter/Space。无视觉或树状态算法改动；新增组件回归，避免浏览器基准只能使用脚本 `click()`。
- 前台 profile：使用 Chrome DevTools MCP 将开发页切到 4,420 节点，预热展开 10 个 L1 分支，确认 `.tree-container.scrollHeight=5,720px` 和 phantom 高度相同；随后以 DevTools 的真实 click 折叠、再展开 L1-0。trace 记录 CLS `0.00`，最长 pointerdown INP `32ms`，输入延迟 `0.3ms`、事件处理 `3ms`、呈现延迟 `28ms`。这与 Vitest iframe 的 `CLS=5.57` 不能作为产品指标的结论一致。
- 限制：MCP trace 摘要把 URL 显示为旧 `http://127.0.0.1:5173/`，尽管 trace 开始前后的页面快照均为 `4173` 且操作的 4,420 节点工作集只在该页面建立。保留这一环境元数据缺陷；在可归档 trace 的固定 Chrome/CI 环境复测前，不用这一个样本宣布阶段 4 已完成。
- 决策与下一步：不引入位图/Fenwick Tree。当前真实 trace 的计算处理只占 3ms，不支持“可见性算法是主瓶颈”的前提。下一完整批次补充 100k browser workload、固定 Chrome 版本并归档 trace；若其 profile 仍显示 WASM/可见性处理占比低，则完成阶段 4 的“不替换”决策，否则只对被证实热点制作候选实现和对拍。

### 2026-09-17：阶段 4 独立 100k browser gate

- 实现：新增 `makeHundredThousandWorkloadTree()`，数据形状为 100 个父节点、每个 999 个子节点；独立测试预热展开 10 个父分支，断言 phantom 高度超过 250,000px，再执行各 10 轮长距离滚动与真实 checkbox 点击。用 `--mode browser-100k` 选择该用例，新增 `pnpm run test:browser:100k`，使日常 `test:browser` 仍只运行 smoke 与 4,620 节点 workload，避免两个组件的 WASM allocator 状态相互污染。
- 结果：常规 `pnpm run test:browser` 通过（2 passed、1 skipped）。独立 100k 命令连续两次均在首次同步建树阶段超过 90 秒没有输出或完成；即使测试声明 60 秒超时，也因主线程同步执行未返回而无法触发。已主动终止两个浏览器进程，未把中止伪报为 P50/P95。
- 结论：这是 100k JSON 输入、AssemblyScript 解析/对象构建、紧凑镜像加载及组件完整缓存初始化构成的启动路径问题，不是当前 `_shownNodes` 的滚动维护证据。保留独立 gate 作为失败复现；不要靠放宽 timeout 或跳过 100k 用例来完成阶段 4。
- 下一步：在不改变 `fieldKeys`、`extendData`、完整输出和默认同步 API 的前提下，设计显式 opt-in 的可中断批量构建接口；先做旧 JSON 路径与新路径的宽树/深树/自定义字段/完整输出对拍，再在浏览器把每批控制权让回渲染循环并记录首帧、总建树、P50/P95、峰值内存。只有该 gate 通过后，才能继续判断 100k 下的可见性数据结构。

### 2026-09-17：checkbox 深层聚合与搜索缓存修复

- 修复：`CompactNodeStore` 新增直接子节点的半选聚合计数。此前只累计 CHECKED 子节点，第三层叶子变为 CHECKED 时，其父节点虽然正确变为 HALF_CHECKED，却不会作为“部分选中”传递到再上层祖先；现在 checked/half 两类状态均按直接父子关系增减，祖先状态由两类计数共同计算。lazy RootOnly 路径使用同一聚合规则。
- 修复：搜索结果只包含命中节点与祖先，搜索中勾选父节点会隐式更新未出现在结果中的后代。清空搜索时组件此前仅复用局部可见缓存，故恢复完整树后这些后代展示旧状态；现在从活动搜索退出时重建完整节点缓存，再刷新可见窗口。
- 回归：新增第三层叶子到所有祖先的 HALF_CHECKED 断言；新增搜索中勾选父节点、清空搜索、展开父子后所有后代仍 CHECKED 的 WASM 和组件回归。紧凑数组诊断因新增 `childHalf` 增加 4 bytes/节点，此为实际状态索引成本，非重复镜像字段。

### 2026-09-17：程序化 checkbox 选择与节点缓存一致性修复

- 修复：`setCheckedNode()` 过去只委托 RADIO/SELECT 路径，在 CHECKBOX 模式下不会实际选中节点；现在在该模式下改为调用 `checkNode(id, CHECKED)`，因此单节点 API 与点击 checkbox 使用同一套禁用节点、子树传播和祖先聚合规则。
- 修复：`setChecked`、`setCheckedByIds`（演示页“随机选中”的底层路径）、`clearAllChecked` 及用户点击选中后，组件此前只更新可见窗口。被 API 改动的折叠后代、或随后从搜索结果恢复的节点会继续显示旧状态；初始修复曾以全树缓存重建保证一致性，随后改为在每次可见窗口渲染时按 full-tree 索引从 WASM 读取紧凑的 `checked/selected` 状态并原地覆盖缓存。因此隐藏后代首次进入视口时仍读取最新状态，但选择热路径不再传输整棵节点 JSON。
- 回归：新增 CHECKBOX 模式 `setCheckedNode` 子树传播断言；组件回归覆盖单节点 API 选中、展开隐藏子节点、清空选择、批量 API 再选中。release WASM 重建后，`tests/wasm/tree-check.test.ts` 与 `tests/components/VueGiantTree.test.ts` 共 29 项通过。
- 性能边界与下一步：新增 `getNodeSelectionStates(indices)` 只返回当前视口索引的 packed `checked/selected` 状态，避免每次选择调用 `getAllNodes()` 与 JSON 解析；4,000 节点父节点选中不再额外传输全树完整节点对象。默认 `checkedOutputMode=All` 的 `v-model` 仍需输出所有已选 ID，此输出成本属于公开语义，若业务只需根节点应使用 `RootOnly`。阶段 4 仍应在 4,620 与 100k workload 分别测量点击、`setChecked`、`setCheckedByIds`、清空的 P50/P95、首帧和内存，并继续覆盖搜索进出、折叠/展开和 disabled 节点；100k 输入/构建 gate 通过前，阶段 4 与阶段 5 准入状态不变。

### 2026-09-17：SELECT 首击与虚拟行状态同步修复

- 修复：视口状态同步此前直接改写 `allNodesCache` 中可能已被 Vue 代理的对象原始引用。虚拟行复用时，子组件不一定会收到新的 `item` prop，SELECT 模式可能出现首次点击已写入 WASM、但视觉状态到下一次点击才更新的现象。
- 现在仅当可见节点的 `checked` 或 `selected` 状态实际变化时，替换该缓存条目并传入新的对象引用；更新量仍受视口大小约束，不恢复全树 JSON 刷新。新增 SELECT 模式“展开后首次点击叶子节点立即选中”组件回归。
- 验证：`pnpm run lib:build`、选择相关 WASM/组件测试（43 项）、`pnpm exec vue-tsc --noEmit`、`pnpm run test:browser`、`git diff --check` 均通过。

### 2026-09-17：CHECKBOX ID 输出与选择热路径优化

- 实现：新增 `getCheckedIdList()`。默认 CHECKBOX + `outputIdOnly=true` 的组件输出直接接收 WASM 的 `string[]`，不再先生成 ID JSON 字符串再由 Vue `JSON.parse`；`getCheckedIds()` 保留原有 JSON API，RADIO/SELECT 单值输出与完整节点 JSON 输出均不改变。
- 正确性：新接口复用原有 `All`/`RootOnly`/`LeafOnly` 过滤逻辑。WASM 回归覆盖父子聚合后的完整 ID 列表，组件已有 API 选择、清空、搜索恢复和 SELECT 首击叶子回归共同覆盖状态同步。
- 浏览器核验：通过 Chrome DevTools MCP 在本地开发页切换 SELECT、展开 L1/L2 后首次点击实际 L3 叶子，页面的选中结果立即由 0 更新为 1；不依赖测试 iframe 的事件模拟。
- 边界：该项移除了默认 ID 输出的 JSON 往返，但 `All` 模式仍按语义生成每个已选 ID。大子树场景应由业务选择 `RootOnly`，或后续改用明确的增量选择通知；它不解决 100k 节点的同步 JSON 建树阻塞，也不改变阶段 4/5 状态。

### 2026-09-17：紧凑批量 CHECKBOX 设置优化

- 实现：`setCheckedNodes()` 在 CHECKBOX + `useCompactSelection=true` 时不再执行旧对象批量算法后再全树 `syncSelection()`。它直接重置紧凑 checked/子节点聚合计数，再用现有紧凑子树传播处理传入 ID；disabled 节点状态和 RADIO/SELECT 路径保持原行为，`useCompactSelection=false` 继续作为旧路径对照。
- 正确性：固定种子 compact/legacy 对拍、禁用分支、批量 API 组件回归均通过。全量 `pnpm run test` 为 106 项通过，`pnpm exec vue-tsc --noEmit`、`pnpm run test:browser` 和 `git diff --check` 通过。
- 基准：release WASM、独立进程、1,000,000 节点、12 轮、三个分散目标 ID。当前紧凑路径的批量设置 P50/P95 从 57.591/68.189 ms 降至 28.004/40.666 ms；legacy 为 24.426/26.866 ms。紧凑路径已获得约两倍改善，但仍受对象与紧凑状态双写、每个目标单独子树/祖先传播影响。
- 下一步：不能以进一步逐目标调用 `checkCheckbox()` 作为优化方向。需要设计一次批量范围覆盖与去重祖先聚合，先与 legacy/当前 compact 做禁用、重叠父子目标、搜索、输出模式的逐项对拍；仅在 P95 同时优于当前 compact 且没有可接受性回退时替换。阶段 3/4/5 状态不变。

### 2026-09-17：批量范围覆盖评估与 disabled 兼容边界

- 评估：实现过一次“排序目标 MPTT 区间、去除嵌套范围、一次全树写入并自底向上聚合”的批量候选。它在 1,000,000 节点三目标 workload 中得到 P50/P95 60.974/76.902 ms，慢于已上线紧凑逐目标路径的约 28/41 ms；并且在 disabled 子节点与只选其 enabled 同级节点时，将父节点聚合为 CHECKED，旧 API 应为 HALF_CHECKED。该候选已完整移除。
- 实现：保留已验证的紧凑重置加传播路径，但仅在全树没有 disabled 节点时启用；`CompactNodeStore.hasDisabledNodes()` 使用构建期 disabled 前缀和常数判断。只要树含有 disabled 节点，`setCheckedNodes()` 回退旧对象批量算法加 `syncSelection()`，以保持既有 `setCheckedByIds` 的聚合和输出语义。
- 正确性：新增禁用子树对拍；既有重叠父子 ID、空 ID 列表、不存在 ID、固定种子 compact/legacy 对拍继续通过。`pnpm run test` 为 107 项通过，类型检查、browser 测试、`git diff --check` 均通过。
- 基准：release、独立进程、1,000,000 节点、12 轮、三个分散目标，无 disabled。当前 compact 批量设置为 P50/P95 28.365/40.452 ms，legacy 为 22.919/24.950 ms。快路径保留了比旧 compact 同步方案约两倍的收益，但 disabled 树仍走兼容路径；阶段 3 的单一状态来源和阶段 4 的 100k 输入 gate 仍是阶段 5 的阻塞项。

### 2026-09-17：100k 分批输入桥接第一轮

- 实现：新增 `pushNeighborNodes(ids, names, parentIds, disabled)` WASM 批量邻接表接口；`VueGiantTree` 新增默认关闭的 `chunkedBuild` 和 `buildBatchSize`。启用时仅在 `outputIdOnly=true` 且没有 `filterFn` 的兼容场景生效，每批结束后让出一帧，最后调用既有 `popNeighbor()` 完成 MPTT 转换。需要完整原始行数据、`extendData` 或自定义过滤输出时继续走 JSON 输入，默认 API 行为不变。
- 正确性：批量接口与逐条输入对拍覆盖完整树 JSON、禁用节点和搜索结果；组件以每批 1 条的方式覆盖可见节点与禁用语义。`pnpm run test` 为 109 项通过，`pnpm exec vue-tsc --noEmit`、`pnpm run lib:build`、`pnpm run test:browser`（2 passed、1 skipped）通过。
- 100k gate：该 workload 现显式启用 `chunkedBuild`，并在展开前等待 `getTreeSize() === 100000`，避免把未完成的异步输入误判为零高度。首轮没有得到可用 P50/P95：批量输入可让出渲染，但最终 `popNeighbor()` 的 MPTT 转换、索引和紧凑布局加载仍是单次同步工作，超过 90 秒门限后测试进程结束。不得将此视为 100k 通过。
- 下一步：将最终构建拆分为可恢复阶段，先对邻接表/MPTT、深树、禁用节点、`fieldKeys` 和完整输出做逐项对拍；只有完成后，才能重新运行固定 Chrome 的 100k 首帧、总建树、内存和交互 workload。阶段 3、4 以及阶段 5 准入状态不变。

### 2026-09-18：100k 输入桥接与浏览器口径修正

- 实现：`chunkedBuild` 现在不再通过 `getAllNodes()` 序列化并解析完整节点 JSON。批量输入时，WASM 为输入顺序维护一次性的 `inputOrderToFullIndex` 映射，并暴露 `getInputNodeLayouts()` 返回纯 `i32[]` 的 full-tree 索引、MPTT 左右边界、深度和继承后的禁用状态；Vue 直接复用 `props.tree` 的字符串，在 JS 侧分批填充缓存后调用 `clearInputNodeLayouts()` 释放映射。该路径不向默认 JSON API、完整输出或 `filterFn` 场景扩展。
- 正确性：WASM 对拍覆盖 MPTT 顺序、禁用继承、未知 ID 和映射释放；组件回归等待 `getBuildReady()`，避免在异步缓存尚未完成时把节点数误当作可交互状态。`pnpm run test` 为 110 项通过，`pnpm exec vue-tsc --noEmit` 通过。
- 基准口径：浏览器配置此前错误别名到 debug WASM，现改为 release glue，常规 4,620 节点 `pnpm run test:browser` 通过（2 passed、1 skipped）。隔离 Node release 基准中，既有逐条输入的 1,000,000 节点构建为 2,318.184 ms，排除“邻接表转 MPTT 本身必然超过 90 秒”的假设。
- 100k 结论：release、2,000 节点默认批次，以及仅用于诊断的 10,000 节点批次均未在 Chrome gate 中得到有效 P50/P95，进程在 90 秒门限后结束。不能据此宣布分批构建完成，也不能仅以 rAF 节流、debug 构建或批次数作为根因。保留默认 2,000 节点批次和该失败复现；下一步必须归档前台 Chrome profile，将 JS/WASM 绑定、组件缓存、首个 Vue commit 和 DOM/layout 分段量化，再只对主导段实施可恢复构建或二进制输入方案。阶段 3、4 和阶段 5 准入状态不变。

### 2026-09-18：浏览器构建分段诊断与桥接边界

- 实现：组件新增 `getBuildMetrics()`，记录分批输入 bridge、让步、`popNeighbor()`、数值布局 bridge、JS 缓存填充与总耗时；新增独立 `profile:browser:build` mode，等待 `getBuildReady()` 后输出指标。浏览器 workload 改为 release WASM，避免把 debug 运行时混入容量结论。
- 验证：`pnpm run test`（110 项）、`pnpm exec vue-tsc --noEmit`、常规 `pnpm run test:browser`（2 passed、2 skipped）通过。
- 诊断结果：在当前 Vitest browser/Chrome 环境中，默认 JSON 路径的 4,620 节点 workload 能完成；但 `chunkedBuild` 的独立 profile 在 10,500 节点以及降至 1,050 节点时仍未在 30 秒内到达 `getBuildReady()`，Chrome 渲染进程持续高 CPU。该最小复现说明瓶颈在分批 `string[]` 输入桥接及其 browser binding 路径，不能归因于 100k DOM、`getAllNodes()` JSON 缓存、rAF 节流、release/debug 或批次大小。未完成 profile 被主动停止，未伪造指标。
- 决策：不要把 `pushNeighborNodes(string[], string[], string[], bool[])` 扩展为默认加载方案，也不要继续以调整批次大小推进。下一步应先归档前台 CDP trace；若绑定层被证实为热点，则设计显式 opt-in 的单缓冲二进制/线性编码输入接口，并对拍 `fieldKeys`、禁用继承、完整输出与深树。阶段 3、4 和阶段 5 准入状态不变。

### 2026-09-18：单缓冲 UTF-8 输入桥接实验

- 实现：`chunkedBuild` 的实验输入从 `string[]`/`bool[]` 四参数批次改为一个 `Uint8Array`。每条记录由 16 字节 little-endian 长度/disabled 头和连续的 UTF-8 `id`、`name`、`parentId` 组成；WASM 解码后复用既有 `pushNeighborNode()` 与 `popNeighbor()`。该接口仍只在 `chunkedBuild && outputIdOnly && !filterFn` 时启用，默认 JSON、`outputIdOnly=false`、`filterFn` 和 `extendData` 路径不变。
- 修正：初版使用 `Uint8Array + Int32Array` 偏移表，但当前 `as-bind` release glue 没有 pin 第二个 typed-array 临时对象，WASM 看到的偏移表为空。已收敛为单缓冲格式，避免依赖该有生命周期问题的多 typed-array 调用约定。
- 正确性：新增 WASM 对拍覆盖 Unicode ID/名称、父子 MPTT 顺序与 disabled 状态。`pnpm run test` 为 9 个文件、111 项通过；`pnpm exec vue-tsc --noEmit`、`pnpm run lib:build` 和 `git diff --check` 通过。
- 浏览器结果：`pnpm run profile:browser:build` 在 1,050 节点 workload 的首个 30 秒采样窗口仍未返回 `getBuildReady()`，Chrome 渲染进程持续高 CPU；本次 profile 的明确进程已主动停止，未记录 P50/P95。该结果不能说明单缓冲编码无效，也不能宣布 100k gate 通过；仍须归档前台 CDP trace，量化 JS 编码、as-bind lower、WASM UTF-8 解码、`popNeighbor()`、Vue 首次提交和 layout 后，只优化被证实的主导段。
- 隔离证据：新增 `tests/browser/input-bridge.browser.test.ts`，不挂载 Vue，直接在系统 Chrome 中运行 10 轮 1,050 节点单缓冲输入、`popNeighbor()`、`getInputNodeLayouts()`（5,250 个整数）和映射释放，全部通过。因而当前 profile 的卡顿不能再归因于单缓冲 as-bind/WASM bridge 必然失败，下一步应定位 `VueGiantTree` 的异步生命周期、缓存组装或首次响应式提交。
- 修正：定位到 chunked 缓存组装把五元布局 `[fullIndex,left,right,depth,disabled]` 错位读取，曾将 `fullIndex` 写入 `leftNode` 并把 `depth` 当作 `disabled`。现已按协议读取 `offset+1` 至 `offset+4`；该修正不改变 WASM 布局协议或默认路径。修正后组件单元回归 14 项通过，但 profile 仍需在完整浏览器窗口内重新归档，不能据此宣称 100k gate 已恢复。
- 状态：阶段 3、4 继续进行中，阶段 5 不启动。单缓冲接口可由删除 `pushNeighborNodesUtf8()` 和组件编码分支回滚，原 `pushNeighborNodes()` 与默认 JSON API 保留不变。

### 2026-09-19：chunked browser gate 修复与 100k 恢复

- 根因：`waitForTreeSize()` 在条件满足时遗漏 `return`，因此即使 `getTreeSize() === 100000` 且 `getBuildReady() === true` 也会循环至超时并报失败。此前单批输入和缓存构建在唯一批次后还无条件执行 `setTimeout(0)`，也让测试 iframe 的异步调度掩盖了实际已完成的构建阶段。
- 修复：等待函数成功即返回；输入和缓存的让步仅在存在下一批时执行。构建指标补充输入、finalize、布局 bridge/release、缓存组装/index/refresh、可见索引和选择状态读取。`ResizeObserver` 的虚拟列表更新移到宏任务，避免 Chromium 的 observer feedback loop；构建完成前跳过半成品可见窗口刷新。
- 结果：`profile:browser:build` 的 1,050 节点受控 profile 通过。其最近一次分段记录为 input 3.2ms、`popNeighbor()` 0.9ms、布局 bridge 0.2ms、缓存组装 0.2ms、缓存索引 0.2ms、总计 5.2ms；这些是单次诊断样本，不作为 P50/P95 基线。`test:browser:100k` 通过，覆盖 100,000 节点、10 个分支展开、10 轮长距离滚动和 checkbox；常规 `test:browser` 也通过。
- 验证：`pnpm run test` 为 9 个文件、111 项通过；`pnpm run test:browser`、`pnpm run test:browser:100k`、`pnpm run profile:browser:build`、`pnpm exec vue-tsc --noEmit` 和 `git diff --check` 通过。
- 边界：浏览器 harness 当前只断言 10 个样本及 P50/P95 的有限性，Vitest 输出未归档具体数值；阶段 4 仍需在固定 Chrome 版本输出并保存完整 P50/P95/trace，才可完成“不替换 `_shownNodes`”的验收。阶段 3、4 继续进行中，阶段 5 不启动。

### 2026-09-19：浏览器分段基线与搜索 JSON 长尾修复

- 可归档口径：以 `pnpm run report:browser` 与 `pnpm run report:browser:100k` 输出 browser workload JSON；`measure()` 现在分别报告 action 与双 rAF render 的 P50/P95，避免把渲染等待误归为 WASM 或可见性计算。
- 4,620 节点、10 轮、系统 Chrome 最近一次：scroll 总/action/render P95 为 34.1/0.4/34.0ms，展开折叠为 100.3/69.7/33.4ms，checkbox 为 51.1/17.4/34.1ms。搜索修复后为 34.5/3.8/33.1ms。iframe scripted click 的 14 条 layout shift（合计 5.5705，来源 `div.infinite-list`）仍不作为产品 CLS，因为该环境也未把点击标为 recent input。
- 100,000 节点、100 分支 x 999 子节点、chunked release 输入、10 轮：首次挂载到首帧 2,813.7ms，展开 10 个分支后 phantom 高度 262,340px；滚动总/action/render P95 为 39.5/0.1/39.5ms，checkbox 为 133.4/100.5/33.5ms。checkbox 子树传播是该工作集的计算热点；滚动主要等待浏览器呈现，不能据此引入位图/Fenwick Tree。
- 修复：搜索清空曾调用 `refreshAllNodesCache()`，经 `getAllNodes()` 完整 JSON 序列化和 `JSON.parse` 重建 JS 缓存。由于 `refreshTree()` 每次均按紧凑 selection 状态同步当前视口，隐藏节点进入视口时也会同步，该重建不再需要；现改为直接刷新视口。修复前 4,620 节点搜索 action P95 为约 508ms、总 P95 约 517ms；修复后分别降至 3.8ms 与 34.5ms。
- 搜索算法：祖先补全优先沿 `CompactNodeStore.parent` 索引向上走，保留无 parent 索引时的 MPTT 回退逻辑，避免广泛命中时对每个节点扫描全部匹配项的 O(N x M) 路径。`tree-search` 与完整生命周期对拍通过；本轮 browser 长尾主要由 JSON 路径而非该算法造成。
- 验证：`pnpm run test`（9 文件、111 项）、常规 browser profile、100k browser workload、`pnpm exec vue-tsc --noEmit`、`pnpm run lib:build` 和 `git diff --check` 通过。
- 决策：继续保持 `_shownNodes`；100k 滚动 action P95 0.1ms，当前证据不支持替换可见性数据结构。阶段 4 仍缺固定 Chrome 版本的可归档 trace/真实输入 CLS，阶段 3 的单一状态来源也未完成，故阶段 5 继续不启动。

### 2026-09-19：搜索祖先索引与阶段 3 镜像成本复核

- 实现：`fuzzySearchTree()` 接收 `CompactNodeStore.parent`，搜索命中后沿直接父索引向上补全祖先；无该索引时保留原 MPTT 范围回退。搜索结果排序、5,000 条上限、大小写/substring 和清空语义不变。
- 对拍：`tree-search`、`giant-tree` 生命周期及组件搜索回归通过；全量 Node/WASM 测试继续为 111 项。
- 复核：release 独立 `compact-ab`（1,000,000 节点、预热后 12 轮）最新结果为 legacy/compact：根 checkbox P50/P95 `3.334/11.022` 与 `26.300/32.202ms`，叶 checkbox `6.300/10.075` 与 `0.044/0.080ms`，批量设置 `23.100/27.290` 与 `31.072/40.384ms`，展开 `15.974/24.776` 与 `16.060/26.473ms`，折叠 `6.705/13.217` 与 `6.976/12.061ms`；两者 WASM memory 均 `512MiB`，JS heap 约 `3.98MiB`。compact 仍是镜像存储而非唯一状态来源，根/批量选择存在明确回退，不能标记阶段 3 完成。
- 决策：本轮不删除 `fullTree` 数值/状态字段。`tree-check`、`tree-visibility` 和完整 serializer 仍直接依赖对象字段；在没有逐模块迁移及功能对拍前，保留旧对象路径是必要回滚边界。阶段 3、4 继续进行中，阶段 5 不启动。

### 2026-09-19：阶段 3 容量矩阵补采样

- release Node 容量样本：100,000 节点 JSON 建树 `424.997ms`，首次可见索引 `0.134ms`，WASM memory `267,911,168B`；100,000 节点逐条 push workload 的搜索首次/重复/换词为 `14.946/0.074/11.031ms`，叶 checkbox P50/P95 `0.092/0.266ms`，根 checkbox `2.320/2.587ms`。默认 `All` 输出 P50/P95 `119.540ms`（约 4MB JSON），`RootOnly` `1.715ms`；这是公开输出语义成本，不作为可见性算法瓶颈。
- 深度样本：width=2 的深度 512（1,024 节点）建树/折叠/搜索/checkbox 为 `8.034/0.179/0.267/0.199ms`，WASM memory `3,932,160B`；深度 1,024（2,048 节点）为 `13.990/0.244/0.295/0.188ms`，WASM memory `6,815,744B`。当前深树容量没有触发 abort，但还不足以完成 100k/1M 深树验收，保留为回归样本。
- 镜像成本：100,000 节点 compact mirror typed-array 字节 `1,700,000B`，对象字符串 payload 下界 `26,177,714B`；对象头、引用和 allocator 元数据未计入。该证据支持“镜像占用可量化”，但不能推导删除对象字段后的实际节省。
- 状态：阶段 3 的功能对拍和容量补采样继续推进；由于选择、可见性和完整 serializer 仍直接读取 `fullTree` 字段，单一状态来源门禁未满足。阶段 4 保持 `_shownNodes`，阶段 5 不启动。

### 2026-09-19：完整序列化切换到 compact 状态读取

- 实现：新增 `serializeMpttArrayCompact()`；`getAllNodes()` 在 `useCompactSelection=true` 时从 `CompactNodeStore` 读取 `left/right/depth/checked/selected/collapsed/disabled`，字符串和 `extendData` 仍来自 `fullTree`。`useCompactSelection=false` 保留原 serializer 作为回滚对照。
- 对拍：新增 compact/legacy 完整 JSON 对拍，覆盖父节点选中、禁用节点和展开后的状态；WASM 相关测试 26 项通过，全量测试 112 项通过。
- 边界：`tree-check`、`tree-visibility`、`tree-search` 仍有对象字段读取，且 `serializeCheckedArray/serializeMpttNode` 仍服务旧输出路径；本项减少了完整树 serializer 的状态消费者，但不能标记“对象字段已删除”。下一步需按模块迁移选择/可见性读取并继续保留 legacy 对照。

### 2026-09-19：阶段 3/4 一键门禁通过

- 新增 `pnpm run gate:phase3-4`，按固定顺序串联 Node 全量测试、库构建、100k 容量、深树 512/1024、1M compact/legacy 独立进程基准、4,620 节点浏览器 workload 与 100k 浏览器 workload；任一步失败即停止并输出 JSON 结果。
- 本次运行全部通过：Node 测试 `9 files / 112 tests`，库构建通过；100k 建树约 `447ms`、WASM memory `267,911,168B`；深树 512/1024 均通过；1M compact/legacy 对照通过；两组 Chrome workload 均通过（100k 首帧约 `2.8s`、展开后 phantom 高度 `262,340px`、滚动 action P95 `0.1ms`）。
- Windows 兼容性：门禁脚本对 Node 可执行文件关闭 shell，对 pnpm 保留 shell，避免 `Program Files` 路径被截断。
- 该门禁通过只表示阶段 3/4 的自动化基线可一次性复现，不等于阶段 3/4 完成：`tree-check`、`tree-visibility`、搜索及部分完整输出仍读取 `fullTree`，固定 Chrome trace/真实输入 CLS 仍需归档；阶段 5 继续不启动。

### 2026-09-19：阶段 3 选择 ID 输出读取迁移

- `GiantTree.getCheckedIdList()` 在 `useCompactSelection=true` 时改为直接读取 `CompactNodeStore.checked/selected/left/right`，字符串 ID 仍从对象模型读取；覆盖 RADIO、SELECT、CHECKBOX 的 All、RootOnly、LeafOnly 三种输出模式。
- 保留 `getCheckedNodes()` 完整节点 JSON 的对象兼容路径，因为 `extendData` 和公开字段输出仍需要原始字符串负载；不删除对象状态字段。
- 验证：`pnpm run test`（9 files / 112 tests）和 `pnpm run lib:build` 通过。该项不改变可见性增量算法，避免 1M 展开 P95 从约 25ms 回退到 429ms。
- 阶段 3 仍未完成：`tree-check` 的写入双写、`tree-visibility` 的 shown/collapsed 对象读取、完整节点 serializer 及对应功能对拍仍需继续迁移。

### 2026-09-19：阶段 3 disabled 批量选择迁移

- `setCheckedNodes()` 在 compact 模式下不再因存在 disabled 节点而整体回退到 legacy；统一使用 `CompactNodeStore.resetCheckboxSelection()` 与 `checkCheckbox()`，由 compact 的 disabled 跳过和祖先聚合逻辑处理兼容语义。
- 验证：全量 `pnpm run test` 通过（9 files / 112 tests）；1M 独立 compact/legacy 基准通过，compact 批量选择 P95 `40.894ms`，展开/折叠 P95 `16.402/6.642ms`。
- 保留 `useCompactSelection=false` legacy 对照。阶段 3 尚未完成，剩余阻塞仍是可见性增量读取、完整节点 serializer 和状态字段最终删除前的全矩阵对拍。

### 2026-09-19：阶段 3 完整输出迁移与可见性回退

- 完整 CHECKBOX 节点输出在无 disabled 节点的 compact 路径中已从 `CompactNodeStore` 读取 `left/right/deep/checked/selected/collapsed/disabled`，对象只提供 ID、名称、父 ID 与 `extendData`；lazy range 先物化以保持 RootOnly 输出与 legacy 一致。含 disabled 节点仍保留 legacy serializer/输出路径，因为 compact disabled 输入尚不是唯一事实来源。
- 尝试将折叠/展开的子树 shown 更新改为 compact 增量扫描。正确性测试通过，但 1M 独立基准的 compact 展开/折叠 P95 从约 `16/7ms` 回退到 `34/22ms`，原因是当前 `_shownNodes` 兼容数组还需第二次对象扫描。该实现已撤回，不把性能回退带入基线。
- 本轮完整 `pnpm run gate:phase3-4` 在撤回前的其他路径全部通过；阶段 3 仍不能完成。唯一实质阻塞是实现一次遍历、同时更新 compact shown 状态和 `_shownNodes` 的增量可见性算法，并在 disabled 输入下完成 compact 状态来源迁移；完成前不得删除对象状态字段。
- 再次尝试将 compact shown 更新与 `_shownNodes` 插入/删除合并为单遍实现；全量 112 项对拍通过，但 1M compact 展开/折叠 P95 仍约 `22/25ms`，高于原有 `16/7ms` 基线，已撤回。当前生产基线保持原增量算法，避免阶段 3 改动引入性能回退。
- 进一步尝试在原 `setCollapsedShown()` 的单遍遍历中同步写入 compact `shown`，以避免额外扫描；全量对拍通过，但 1M compact 展开/折叠 P95 仍为约 `30/25ms`。已撤回。结论：在 `_shownNodes` 仍以对象引用作为公开虚拟列表输入、并要求对象 `shown` 与 compact `shown` 同步的现有结构中，消除对象可见性状态必然增加热循环写入成本。阶段 3 的“完全单一状态来源/删除对象状态字段”不满足性能准入，不能标记完成；应在阶段 5 评估前将其降为架构重设计项，或接受明确的性能预算后另开兼容性破坏版本。

### 2026-09-19：方案 2 第一项，紧凑索引渲染出口

- `getShownNodes()` 的 compact 分支现直接调用 `serializeShownIndicesCompact(fullTree, shownIndices, shownLength, store, ...)`。虚拟窗口 JSON 不再从 `_shownNodes[i]` 读取数值/状态字段，使用 compact 索引定位字符串与 `extendData` 对象载体，再从 typed arrays 取布局、选择、折叠和 disabled 状态。
- 验证：`pnpm run lib:build`、`pnpm run test`（9 files / 112 tests）、1M compact/legacy 基准及 4,620 Chrome workload 通过；本次 Chrome 滚动 action P95 `0.4ms`，折叠 action P95 `68ms`，搜索 action P95 `3.4ms`。该步不改变 `_shownNodes` 的内部增量维护，故不声称阶段 3 完成。
- 后续方案 2 的剩余工作：以 `shownIndices` 替换 `_shownNodes` 的增量插入/删除和搜索模式维护，再移除对象 `shown/collapsed` 字段。该转换必须补充索引序列的随机操作对拍，不能以当前对象数组作为隐式回退。

### 2026-09-19：阶段 3 方案 2 可见索引收口

- compact 正常树模式的折叠/展开现在从 `CompactNodeStore.collapsed/left/right` 重建 `shownIndices`，并同步兼容对象缓存；搜索模式继续使用结果树对象作为独立兼容边界。虚拟窗口 JSON 统一从 `shownIndices` 直接序列化。
- 该实现解决了此前局部索引插入丢失兄弟节点的顺序错误；全量 Node/组件对拍、深树、disabled、搜索进出和 100k browser workload 均通过。
- 最终一键门禁 `pnpm run gate:phase3-4` 通过：9 files / 112 tests、库构建、100k/深树容量、1M compact/legacy、4,620 和 100k Chrome workload 全部通过。
- 1M compact 当前展开/折叠 P95 约 `26.6/27.9ms`，高于旧对象增量基线约 `20.8/6.6ms`；这是方案 2 选择的可见索引重建成本，已记录为阶段 4 的性能预算项。不得将该结果描述为全面加速。

### 2026-09-19：进入阶段 4 收口

- 新增归档报告 [`docs/performance-gate-2026-09-19.md`](performance-gate-2026-09-19.md)，记录最终 `gate:phase3-4` 的 Node/WASM、1M compact/legacy、4,620 节点 Chrome 和 100k Chrome 原始结果及指标口径。
- 阶段 4 决策：保留 `_shownNodes` 作为兼容/增量维护结构，不引入 bitmap/Fenwick。100k 滚动 action P95 `0.1ms`，4,620 节点折叠 action P95 `69.4ms` 但 render P95 `33.4ms`；当前证据显示主要成本在浏览器呈现和 checkbox 传播，不支持可见性结构替换。
- iframe scripted layout shift 只作为归因数据，不作为产品 CLS；固定前台 Chrome trace 与真实输入 CLS 仍是阶段 4 的证据补强项。阶段 5 继续不启动，下一步是归档前台 trace 或明确记录其环境限制后完成阶段 5 的迁移/不迁移评估。

### 2026-09-19：阶段 5 迁移评估结论

- 新增 [`docs/phase5-migration-evaluation-2026-09-19.md`](phase5-migration-evaluation-2026-09-19.md)，结论为：暂不启动 C/Rust 生产迁移，继续使用 AssemblyScript/WASM。
- 理由：前台 profile 中事件/计算约 `3ms`、呈现等待约 `28ms`；100k 滚动 action P95 约 `0.1ms`；浏览器渲染而非 WASM 纯计算是当前主要墙钟成本。1M compact 根/批量选择仍有同步镜像成本，换语言不能直接解决。
- `vue-tsc --noEmit` 与最终 `pnpm run gate:phase3-4` 均通过。C/Rust 仅在未来固定 trace 证明 WASM 纯计算成为主热点、且同布局 POC 同时改善 P95/内存/二进制体积/维护成本时重新评估。
