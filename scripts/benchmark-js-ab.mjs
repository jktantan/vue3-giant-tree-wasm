// A/B benchmark: WASM (this project) vs a fully equivalent pure-JS implementation.
//
// 目的 / Purpose:
//   对比 WASM 与纯 JS 在相同功能、相同数据、相同规模下的构建与操作性能。
//   The JS side is a functional equivalent of the WASM pipeline: adjacency input,
//   MPTT left/right numbering (equivalent of `_iterativeAssembly`), Map id index
//   (equivalent of `buildIdIndex`), and children adjacency lists.
//
// 用法 / Usage:
//   node --expose-gc scripts/benchmark-js-ab.mjs
//   BENCH_SIZES=100000,1000000 BENCH_ROUNDS=5 node --expose-gc scripts/benchmark-js-ab.mjs
//   BENCH_SHAPES=wide BENCH_SHAPES=deep,random  (default: wide,deep,random)
//
// 教训 / Lessons learned (why the data generator matters):
//   早期版本的生成器使用 `seed % i` 生成 parentId，可能产生负数或不存在的 id，
//   WASM 侧会静默丢弃这些孤儿节点（size 远小于 N），导致双方规模不对等、
//   对比结果失真。本脚本复用 benchmark-phase0.mjs 的官方 makeTree 生成器，
//   并在每轮断言双方节点数一致，规模不对等直接报错退出。

import { performance } from 'node:perf_hooks'
import * as wasm from '../build/release.js'

const sizes = (process.env.BENCH_SIZES ?? '100000,1000000')
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0)

const rounds = Math.max(1, Number.parseInt(process.env.BENCH_ROUNDS ?? '5', 10))

const shapes = (process.env.BENCH_SHAPES ?? 'wide,deep,random')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const LINE_HEIGHT = 26
const VIEW_HEIGHT = 520

// ─── 与 benchmark-phase0.mjs 相同的官方数据生成器 ───

function makeTree(size, shape) {
  const tree = new Array(size)
  let seed = 0x12345678
  const nextRandom = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }
  const idFor = (index) =>
    index % 2 === 0 ? `node-${index}-${'x'.repeat(16)}` : `n${index}`
  for (let i = 0; i < size; i++) {
    const id = idFor(i)
    let parentId = 'root'
    if (shape === 'deep' && i > 0) parentId = i === 1 ? idFor(0) : idFor(i - 1)
    if (shape === 'random' && i > 0) parentId = idFor(Math.floor(nextRandom() * i))
    tree[i] = {
      id,
      name: i % 5 === 0 ? 'Repeated node' : `Node ${i}`,
      parentId,
    }
  }
  return tree
}

function idFor(index) {
  return index % 2 === 0 ? `node-${index}-${'x'.repeat(16)}` : `n${index}`
}

// ─── 统计工具 ───

const timed = (fn) => {
  const start = performance.now()
  const result = fn()
  return { ms: performance.now() - start, result }
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
const p95 = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}
const formatMs = (value) => `${value.toFixed(1)} ms`

// ─── 纯 JS 等价实现 ───
// 功能对齐 WASM 管线:
//   push 阶段   -> 逐条读入邻接表 (等价 pushNeighborNode)
//   finalize    -> MPTT 编号 + Map 索引 + children 邻接表 (等价 popNeighbor)
// MPTT 编号用显式栈 (等价 assembly/tree-builder.ts 的 _iterativeAssembly，
// 同时天然规避 deep 形状的递归爆栈)。

class JsGiantTree {
  constructor(rootId) {
    this.rootId = rootId
    this.map = new Map() // id -> node
    this.children = new Map() // parentId -> [node]
    this.shown = [] // 全展开时的可见序列（等价 _shownNodes 初始态）
  }

  build(input) {
    const { map, children } = this
    const n = input.length
    const nodes = new Array(n)
    for (let i = 0; i < n; i++) {
      const src = input[i]
      const node = {
        id: src.id,
        name: src.name,
        parentId: src.parentId,
        left: 0,
        right: 0,
        deep: 0,
        collapsed: false,
        checked: 0,
        indeterminate: false,
      }
      nodes[i] = node
      map.set(node.id, node)
      let siblings = children.get(node.parentId)
      if (!siblings) children.set(node.parentId, (siblings = []))
      siblings.push(node)
    }
    // MPTT numbering: explicit stack, equivalent of _iterativeAssembly
    let l = 0
    const stack = [
      { kids: children.get(this.rootId) || [], i: 0, deep: 0, owner: null },
    ]
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      if (frame.i >= frame.kids.length) {
        stack.pop()
        if (frame.owner !== null) {
          frame.owner.right = l
          l = frame.owner.right + 1
        }
        continue
      }
      const node = frame.kids[frame.i++]
      node.left = l
      node.deep = frame.deep
      const kids = children.get(node.id)
      if (kids) {
        l = node.left + 1
        stack.push({ kids, i: 0, deep: frame.deep + 1, owner: node })
      } else {
        node.right = node.left + 1
        l = node.right + 1
      }
    }
    return map.size
  }

  visibleFlat() {
    if (this._visible) return this._visible
    const out = []
    const { children, rootId } = this
    const stack = [...(children.get(rootId) || [])].reverse()
    while (stack.length > 0) {
      const node = stack.pop()
      if (!node.collapsed) {
        out.push(node)
        const kids = children.get(node.id)
        if (kids) {
          for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i])
        }
      } else {
        out.push(node)
      }
    }
    this._visible = out
    return out
  }

  getShown(scrollTop, viewHeight, lineHeight = LINE_HEIGHT) {
    const flat = this.visibleFlat()
    const first = Math.max(0, Math.floor(scrollTop / lineHeight) - 5)
    const last = Math.min(
      flat.length,
      Math.ceil((scrollTop + viewHeight) / lineHeight) + 5
    )
    return last - first
  }

  fuzzy(keyword) {
    if (!keyword) return 0
    let hits = 0
    for (const node of this.map.values()) {
      if (node.name.includes(keyword)) hits++
    }
    return hits
  }

  collapse(id, isCollapse) {
    const node = this.map.get(id)
    if (node) node.collapsed = isCollapse
    this._visible = null
  }

  check(id, checked) {
    const root = this.map.get(id)
    if (!root) return
    const value = checked ? 1 : 0
    const stack = [root]
    while (stack.length > 0) {
      const node = stack.pop()
      node.checked = value
      node.indeterminate = false
      const kids = this.children.get(node.id)
      if (kids) for (const child of kids) stack.push(child)
    }
    let cur = this.map.get(root.parentId)
    while (cur) {
      let any = false
      let all = true
      const kids = this.children.get(cur.id) || []
      for (const child of kids) {
        if (child.checked || child.indeterminate) any = true
        if (!child.checked) all = false
      }
      cur.checked = all ? 1 : 0
      cur.indeterminate = any && !all
      cur = this.map.get(cur.parentId)
    }
  }
}

// ─── 基准用例 ───

function runWasm(input, tree) {
  // 复用同一 tree 实例 + clear()：TLSF 分配器回收复用内存，
  // 线性内存稳定不涨。每轮 newTree 会让旧实例被 internref 持有无法释放，
  // 内存只增不减（棘轮效应），多场景累积到 2GB 上限后崩溃。
  if (!tree) {
    tree = wasm.newTree('root', LINE_HEIGHT, wasm.SelectType.CHECKBOX, true)
  }
  wasm.clear(tree)
  const push = timed(() => {
    for (const node of input) {
      wasm.pushNeighborNode(tree, node.id, node.name, node.parentId)
    }
  })
  const pop = timed(() => wasm.popNeighbor(tree))
  return { tree, pushMs: push.ms, popMs: pop.ms, size: wasm.getSize(tree) }
}

function runJs(input) {
  const jsTree = new JsGiantTree('root')
  const build = timed(() => jsTree.build(input))
  return { tree: jsTree, buildMs: build.ms, size: jsTree.map.size }
}

// deep 形状的节点链会让 WASM 线性内存增长更快（每层一个 Map bucket），
// 1M 节点的 deep 会逼近 2GB 线性内存上限并触发 refcount 崩溃，故限制规模。
const MAX_DEEP_SIZE = 300000

for (const shape of shapes) {
  const effectiveSizes =
    shape === 'deep'
      ? sizes.filter((size) => size <= MAX_DEEP_SIZE)
      : sizes
  if (shape === 'deep' && effectiveSizes.length < sizes.length) {
    console.log(
      `\n[shape=deep] 跳过 >${MAX_DEEP_SIZE} 的规模（WASM 线性内存 2GB 上限）`
    )
  }
  for (const size of effectiveSizes) {
    const input = makeTree(size, shape)
    console.log(`\nshape=${shape}, N=${size}`)

    // ── 构建（多轮取中位数；复用同一 WASM 实例避免内存棘轮）──
    const wasmBuild = []
    const jsBuild = []
    let wasmTree = null
    let jsTree = null
    for (let i = 0; i < rounds; i++) {
      if (typeof global.gc === 'function') global.gc()
      const wasmResult = runWasm(input, wasmTree)
      wasmBuild.push(wasmResult.pushMs + wasmResult.popMs)
      wasmTree = wasmResult.tree
      const jsResult = runJs(input)
      jsBuild.push(jsResult.buildMs)
      jsTree = jsResult.tree
    }
    // 规模对等断言：不对等说明数据或实现有问题，直接报错
    if (wasmTree && jsTree && wasm.getSize(wasmTree) !== jsTree.map.size) {
      console.error(
        `  [FATAL] 规模不对等: WASM size=${wasm.getSize(wasmTree)} vs JS size=${jsTree.map.size} — 数据集或实现有 bug，对比无效`
      )
      process.exit(1)
    }


    // ── 视口切片（等价 setBoundary + getShownNodes，WASM 侧含 JSON 序列化）──
    const wasmShown = []
    const jsShown = []
    for (let i = 0; i < 100; i++) {
      const scrollTop = (i * LINE_HEIGHT) % (size * LINE_HEIGHT)
      const wasmMeasure = timed(() => {
        wasm.setBoundary(wasmTree, scrollTop, VIEW_HEIGHT)
        wasm.getShownNodes(wasmTree)
      })
      wasmShown.push(wasmMeasure.ms)
      const jsMeasure = timed(() => jsTree.getShown(scrollTop, VIEW_HEIGHT))
      jsShown.push(jsMeasure.ms)
    }

    // ── 搜索（fuzzyTree 是 WASM 的优势场景）──
    const wasmSearch = []
    const jsSearch = []
    for (let i = 0; i < rounds; i++) {
      const keyword = `Node ${Math.floor(size / 2)}`
      const wasmMeasure = timed(() => wasm.fuzzyTree(wasmTree, keyword))
      wasmSearch.push(wasmMeasure.ms)
      const jsMeasure = timed(() => jsTree.fuzzy(keyword))
      jsSearch.push(jsMeasure.ms)
    }

    // ── collapse / check ──
    const wasmCollapse = []
    const jsCollapse = []
    for (let i = 0; i < rounds; i++) {
      const wasmMeasure = timed(() => wasm.collapseTree(wasmTree, idFor(0), false))
      wasmCollapse.push(wasmMeasure.ms)
      wasm.collapseTree(wasmTree, idFor(0), true)
      const jsMeasure = timed(() => jsTree.collapse(idFor(0), false))
      jsCollapse.push(jsMeasure.ms)
      jsTree.collapse(idFor(0), true)
    }

    const wasmCheck = []
    const jsCheck = []
    for (let i = 0; i < rounds; i++) {
      const target = idFor(Math.floor(size / 2))
      const wasmMeasure = timed(() =>
        wasm.checkNode(wasmTree, target, wasm.CheckType.CHECKED)
      )
      wasmCheck.push(wasmMeasure.ms)
      wasm.clearCheckedNodes(wasmTree)
      const jsMeasure = timed(() => jsTree.check(target, true))
      jsCheck.push(jsMeasure.ms)
      // JS 侧重置
      for (const node of jsTree.map.values()) {
        node.checked = 0
        node.indeterminate = false
      }
    }

    const report = (name, wasmValues, jsValues) => {
      console.log(
        `  ${name}:  WASM median=${formatMs(median(wasmValues))} p95=${formatMs(p95(wasmValues))}` +
          `  |  JS median=${formatMs(median(jsValues))} p95=${formatMs(p95(jsValues))}`
      )
    }
    console.log(
      `  size 对齐: WASM=${wasm.getSize(wasmTree)}, JS=${jsTree.map.size}`
    )
    report('build   ', wasmBuild, jsBuild)
    report('viewport', wasmShown, jsShown)
    report('search  ', wasmSearch, jsSearch)
    report('collapse', wasmCollapse, jsCollapse)
    report('check   ', wasmCheck, jsCheck)
    console.log(`  wasmMemory=${wasm.memory.buffer.byteLength} bytes`)
  }
}
