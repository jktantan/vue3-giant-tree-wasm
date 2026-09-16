import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const releasePath = join(__dirname, '..', 'build', 'release.js')
const mod = await import(pathToFileURL(releasePath).href)

const {
  newTree,
  setTree,
  getSize,
  getShownNodes,
  getShownHeight,
  setBoundary,
  fuzzyTree,
  checkNode,
  collapseTree,
  setCheckedNodes,
  clearCheckedNodes,
  clear,
} = mod

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
  return JSON.stringify(nodes)
}

function generateDeepTree(nodeCount) {
  const nodes = []
  nodes.push({ id: '1', name: 'Root', parentId: '0' })
  for (let i = 2; i <= nodeCount; i++) {
    const parentId = String(Math.ceil(Math.random() * (i - 1)))
    nodes.push({ id: String(i), name: `Node-${i}`, parentId })
  }
  return JSON.stringify(nodes)
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
  const median = times[Math.floor(times.length / 2)]
  const min = times[0]
  const max = times[times.length - 1]
  return { label, median, min, max }
}

function benchOnce(label, fn) {
  const start = performance.now()
  const result = fn()
  const elapsed = performance.now() - start
  return { label, median: elapsed, min: elapsed, max: elapsed, result }
}

function formatMs(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function printResult(r) {
  const extra = r.min !== r.max ? ` (min=${formatMs(r.min)}, max=${formatMs(r.max)})` : ''
  console.log(`  ${r.label.padEnd(40)} ${formatMs(r.median).padStart(10)}${extra}`)
}

function getMemoryMB() {
  const mem = process.memoryUsage()
  return (mem.heapUsed / 1024 / 1024).toFixed(1)
}

const sizes = [10_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000]

console.log('='.repeat(80))
console.log('  vue3-giant-tree-wasm Benchmark')
console.log('='.repeat(80))
console.log()

for (const size of sizes) {
  console.log(`\n${'─'.repeat(80)}`)
  console.log(`  ${size.toLocaleString()} nodes (fanout=10)`)
  console.log(`${'─'.repeat(80)}`)

  // 1. Generate JSON
  const memBefore = getMemoryMB()
  let jsonStr
  const genResult = benchOnce('JSON generation (JS)', () => {
    jsonStr = generateTree(size)
    return jsonStr.length
  })
  printResult(genResult)
  console.log(`    JSON size: ${(jsonStr.length / 1024 / 1024).toFixed(1)}MB`)

  // 2. Parse + Build MPTT
  const tree = newTree('0', 26, 0)
  const loadResult = benchOnce('setTree (parse+MPTT+index)', () => {
    setTree(tree, jsonStr)
    return getSize(tree)
  })
  printResult(loadResult)
  console.log(`    Tree size: ${loadResult.result.toLocaleString()} nodes`)

  const memAfter = getMemoryMB()
  console.log(`    Heap: ${memBefore}MB → ${memAfter}MB`)

  // 3. Virtual scroll render
  setBoundary(tree, 0, 800)
  const scrollResult = bench('getShownNodes (viewport)', () => {
    getShownNodes(tree)
  })
  printResult(scrollResult)

  // 4. Scroll to middle
  const totalHeight = getShownHeight(tree)
  setBoundary(tree, totalHeight / 2, 800)
  const scrollMidResult = bench('getShownNodes (mid-scroll)', () => {
    getShownNodes(tree)
  }, 0, 1)
  printResult(scrollMidResult)

  // 5. Expand root node (id='1')
  const expandResult = benchOnce('collapseTree expand root', () => {
    collapseTree(tree, '1', false)
  })
  printResult(expandResult)

  // 6. Collapse root node
  const collapseResult = benchOnce('collapseTree collapse root', () => {
    collapseTree(tree, '1', true)
  })
  printResult(collapseResult)

  // 7. Check node (CHECKBOX mode — tree is in CHECKBOX mode = 0)
  const checkResult = bench('checkNode (CHECKBOX leaf)', () => {
    checkNode(tree, '2', 2)
  }, 1, 3)
  printResult(checkResult)

  // 8. Check root node (propagates to entire subtree)
  const checkRootResult = benchOnce('checkNode root (full propagation)', () => {
    checkNode(tree, '1', 2)
  })
  printResult(checkRootResult)

  clearCheckedNodes(tree)

  // 9. Batch set checked (10% of nodes)
  const batchSize = Math.min(size, Math.floor(size * 0.1))
  const batchIds = []
  for (let i = 0; i < batchSize; i++) {
    batchIds.push(String(2 + i))
  }
  const batchResult = benchOnce(`setCheckedNodes (${batchSize.toLocaleString()})`, () => {
    setCheckedNodes(tree, batchIds)
  })
  printResult(batchResult)
  clearCheckedNodes(tree)

  // 10. Fuzzy search
  const searchResult = benchOnce('fuzzySearch "Node-5"', () => {
    return fuzzyTree(tree, 'Node-5')
  })
  printResult(searchResult)

  // 11. Clear search
  const clearSearchResult = benchOnce('fuzzySearch "" (clear)', () => {
    return fuzzyTree(tree, '')
  })
  printResult(clearSearchResult)

  // Cleanup
  clear(tree)
  if (global.gc) global.gc()

  // Memory pressure check
  if (size >= 2_000_000) {
    console.log(`\n  ⚠ Reached ${size.toLocaleString()} nodes — checking stability...`)
  }
}

console.log(`\n${'='.repeat(80)}`)
console.log('  Benchmark complete')
console.log(`${'='.repeat(80)}`)
