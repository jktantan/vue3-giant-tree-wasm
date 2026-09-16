/**
 * WASM vs 纯 JS 对比 benchmark
 * 相同的 MPTT 算法，对比序列化开销差异
 */
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const wasmMod = await import(pathToFileURL(join(__dirname, '..', 'build', 'release.js')).href)
const jsMod = await import(pathToFileURL(join(__dirname, 'giant-tree-js.mjs')).href)

function generateTree(nodeCount, fanout = 10) {
  const nodes = []
  nodes.push({ id: '1', name: 'Root', parentId: '0' })
  let nextId = 2
  const queue = ['1']
  while (nextId <= nodeCount && queue.length > 0) {
    const parentId = queue.shift()
    for (let c = 0; c < fanout && nextId <= nodeCount; c++) {
      const id = String(nextId++)
      nodes.push({ id, name: `Node-${id}`, parentId })
      queue.push(id)
    }
  }
  return nodes
}

function bench(label, fn, warmup = 2, runs = 5) {
  for (let i = 0; i < warmup; i++) fn()
  const times = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

function benchOnce(fn) {
  const start = performance.now()
  const result = fn()
  return { elapsed: performance.now() - start, result }
}

function formatMs(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function ratio(wasmMs, jsMs) {
  if (jsMs === 0 || wasmMs === 0) return ''
  const r = wasmMs / jsMs
  if (r > 1) return `JS ${r.toFixed(1)}x faster`
  return `WASM ${(1/r).toFixed(1)}x faster`
}

const sizes = [10_000, 50_000, 100_000, 500_000, 1_000_000]

console.log('='.repeat(90))
console.log('  WASM vs Pure JS Benchmark - Same MPTT Algorithm')
console.log('='.repeat(90))

for (const size of sizes) {
  console.log(`\n${'~'.repeat(90)}`)
  console.log(`  ${size.toLocaleString()} nodes`)
  console.log(`${'~'.repeat(90)}`)

  const nodesArray = generateTree(size)
  const jsonStr = JSON.stringify(nodesArray)

  console.log(`  ${'Operation'.padEnd(35)} ${'WASM'.padStart(10)}  ${'JS'.padStart(10)}  ${'Winner'.padStart(22)}`)
  console.log(`  ${'~'.repeat(83)}`)

  const log = (label, wasmMs, jsMs) => {
    const w = formatMs(wasmMs).padStart(10)
    const j = formatMs(jsMs).padStart(10)
    const r = ratio(wasmMs, jsMs).padStart(22)
    console.log(`  ${label.padEnd(35)} ${w}  ${j}  ${r}`)
  }

  // 1. setTree from JSON string
  {
    const wt = wasmMod.newTree('0', 26, 0)
    const wE = benchOnce(() => wasmMod.setTree(wt, jsonStr)).elapsed
    const jt = jsMod.newTree('0', 26, 0)
    const jE = benchOnce(() => jsMod.setTree(jt, jsonStr)).elapsed
    log('setTree (from JSON string)', wE, jE)
    wasmMod.clear(wt); jsMod.clear(jt)
  }

  // 2. Real-world: WASM needs stringify, JS takes array directly
  {
    const wt = wasmMod.newTree('0', 26, 0)
    const wE = benchOnce(() => wasmMod.setTree(wt, JSON.stringify(nodesArray))).elapsed
    const jt = jsMod.newTree('0', 26, 0)
    const jE = benchOnce(() => jsMod.setTreeFromArray(jt, nodesArray)).elapsed
    log('setTree (real-world path)', wE, jE)
    wasmMod.clear(wt); jsMod.clear(jt)
  }

  // Setup trees for remaining tests
  const wt = wasmMod.newTree('0', 26, 0)
  wasmMod.setTree(wt, jsonStr)
  const jt = jsMod.newTree('0', 26, 0)
  jsMod.setTreeFromArray(jt, nodesArray)
  wasmMod.setBoundary(wt, 0, 800)
  jsMod.setBoundary(jt, 0, 800)

  // 3. getShownNodes + JSON.parse (real render cost)
  {
    const wMs = bench('vp', () => { JSON.parse(wasmMod.getShownNodes(wt)) })
    const jMs = bench('vp', () => { jsMod.getShownNodes(jt) })
    log('getShownNodes (render path)', wMs, jMs)
  }

  // 4. getShownNodes raw
  {
    const wMs = bench('vp-raw', () => { wasmMod.getShownNodes(wt) })
    const jMs = bench('vp-raw', () => { jsMod.getShownNodes(jt) })
    log('getShownNodes (raw, no parse)', wMs, jMs)
  }

  // 5. Expand root
  {
    const wMs = benchOnce(() => wasmMod.collapseTree(wt, '1', false)).elapsed
    const jMs = benchOnce(() => jsMod.collapseTree(jt, '1', false)).elapsed
    log('collapseTree expand root', wMs, jMs)
  }

  // 6. Collapse root
  {
    const wMs = benchOnce(() => wasmMod.collapseTree(wt, '1', true)).elapsed
    const jMs = benchOnce(() => jsMod.collapseTree(jt, '1', true)).elapsed
    log('collapseTree collapse root', wMs, jMs)
  }

  // 7. checkNode leaf
  {
    const wMs = bench('ck', () => { wasmMod.checkNode(wt, '2', 2) }, 1, 3)
    const jMs = bench('ck', () => { jsMod.checkNode(jt, '2', 2) }, 1, 3)
    log('checkNode leaf (CHECKBOX)', wMs, jMs)
  }

  // 8. checkNode root
  {
    const wMs = benchOnce(() => wasmMod.checkNode(wt, '1', 2)).elapsed
    const jMs = benchOnce(() => jsMod.checkNode(jt, '1', 2)).elapsed
    log('checkNode root (propagation)', wMs, jMs)
  }
  wasmMod.clearCheckedNodes(wt); jsMod.clearCheckedNodes(jt)

  // 9. setCheckedNodes batch
  {
    const batchSize = Math.floor(size * 0.1)
    const batchIds = []
    for (let i = 0; i < batchSize; i++) batchIds.push(String(2 + i))
    const wMs = benchOnce(() => wasmMod.setCheckedNodes(wt, batchIds)).elapsed
    const jMs = benchOnce(() => jsMod.setCheckedNodes(jt, batchIds)).elapsed
    log(`setCheckedNodes (${batchSize.toLocaleString()})`, wMs, jMs)
    wasmMod.clearCheckedNodes(wt); jsMod.clearCheckedNodes(jt)
  }

  // 10. fuzzySearch
  {
    const wMs = benchOnce(() => wasmMod.fuzzyTree(wt, 'Node-5')).elapsed
    const jMs = benchOnce(() => jsMod.fuzzyTree(jt, 'Node-5')).elapsed
    log('fuzzySearch "Node-5"', wMs, jMs)
  }

  // 11. Clear search
  {
    const wMs = benchOnce(() => wasmMod.fuzzyTree(wt, '')).elapsed
    const jMs = benchOnce(() => jsMod.fuzzyTree(jt, '')).elapsed
    log('fuzzySearch "" (clear)', wMs, jMs)
  }

  wasmMod.clear(wt); jsMod.clear(jt)
  if (global.gc) global.gc()
}

console.log(`\n${'='.repeat(90)}`)
console.log('  Benchmark complete')
console.log(`${'='.repeat(90)}`)
