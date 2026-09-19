import { performance } from 'node:perf_hooks'
import * as wasm from '../build/release.js'

const sizes = (process.env.BENCH_SIZES ?? '10000,100000')
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0)

const rounds = Math.max(1, Number.parseInt(process.env.BENCH_ROUNDS ?? '10', 10))
const scrollRounds = Math.max(
  1,
  Number.parseInt(process.env.BENCH_SCROLL_ROUNDS ?? '100', 10)
)
const inputMode = process.env.BENCH_INPUT_MODE ?? 'push'
const preserveExtendData = process.env.BENCH_PRESERVE_EXTEND_DATA !== 'false'

const shapes = (process.env.BENCH_SHAPES ?? 'wide,deep,random')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

function makeTree(size, shape) {
  const tree = new Array(size)
  let seed = 0x12345678
  const nextRandom = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }
  for (let i = 0; i < size; i++) {
    const id = i % 2 === 0 ? `node-${i}-${'x'.repeat(16)}` : `n${i}`
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

function timed(fn) {
  const start = performance.now()
  const result = fn()
  return { ms: performance.now() - start, result }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}

function formatMs(value) {
  return `${value.toFixed(3)} ms`
}

function buildTree(input) {
  const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX, preserveExtendData)
  wasm.clear(tree)
  if (inputMode === 'json') {
    wasm.setNeighborTree(tree, JSON.stringify(input))
    return tree
  }
  for (const node of input) {
    wasm.pushNeighborNode(tree, node.id, node.name, node.parentId)
  }
  wasm.popNeighbor(tree)
  return tree
}

function runOne(size, shape) {
  const input = makeTree(size, shape)
  const jsonInput = JSON.stringify(input)
  const buildTimes = []
  const memorySizes = []
  let tree

  for (let i = 0; i < rounds; i++) {
    if (typeof global.gc === 'function') global.gc()
    const measured = timed(() => buildTree(input))
    tree = measured.result
    buildTimes.push(measured.ms)
    memorySizes.push(wasm.memory.buffer.byteLength)
  }

  wasm.setBoundary(tree, 0, 520)
  const shownTimes = []
  const indexTimes = []
  const parseTimes = []
  const shownCounts = []
  for (let i = 0; i < scrollRounds; i++) {
    wasm.setBoundary(tree, (i * 26) % (size * 26), 520)
    const shown = timed(() => wasm.getShownNodes(tree))
    shownTimes.push(shown.ms)
    const indices = timed(() => wasm.getShownIndices(tree))
    indexTimes.push(indices.ms)
    shownCounts.push(JSON.parse(shown.result).length)
    const parse = timed(() => JSON.parse(shown.result))
    parseTimes.push(parse.ms)
  }

  const searchTimes = []
  for (let i = 0; i < rounds; i++) {
    const measured = timed(() => wasm.fuzzyTree(tree, `Node ${Math.floor(size / 2)}`))
    searchTimes.push(measured.ms)
  }
  wasm.fuzzyTree(tree, '')

  const collapseTimes = []
  for (let i = 0; i < rounds; i++) {
    const measured = timed(() => wasm.collapseTree(tree, idFor(0), false))
    collapseTimes.push(measured.ms)
    wasm.collapseTree(tree, idFor(0), true)
  }

  const checkTimes = []
  for (let i = 0; i < rounds; i++) {
    const measured = timed(() => wasm.checkNode(tree, idFor(Math.floor(size / 2)), wasm.CheckType.CHECKED))
    checkTimes.push(measured.ms)
    wasm.clearCheckedNodes(tree)
  }

  return {
    size,
    shape,
    inputBytes: jsonInput.length,
    build: buildTimes,
    shown: shownTimes,
    indices: indexTimes,
    parse: parseTimes,
    search: searchTimes,
    collapse: collapseTimes,
    check: checkTimes,
    shownCount: median(shownCounts),
    wasmMemoryBytes: Math.max(...memorySizes),
  }
}

console.log('Phase 0 benchmark (release WASM)')
console.log(`rounds=${rounds}, scrollRounds=${scrollRounds}, sizes=${sizes.join(',')}, shapes=${shapes.join(',')}, inputMode=${inputMode}, preserveExtendData=${preserveExtendData}`)
console.log(`node=${process.version}, gc=${typeof global.gc === 'function' ? 'enabled' : 'disabled'}`)

for (const shape of shapes) {
  for (const size of sizes) {
    try {
      const result = runOne(size, shape)
      console.log(`\nshape=${result.shape}, N=${result.size}, input=${result.inputBytes} bytes, shown=${result.shownCount}`)
      console.log(`build:    median=${formatMs(median(result.build))}, p95=${formatMs(p95(result.build))}`)
      console.log(`shown:    median=${formatMs(median(result.shown))}, p95=${formatMs(p95(result.shown))}`)
      console.log(`indices:  median=${formatMs(median(result.indices))}, p95=${formatMs(p95(result.indices))}`)
      console.log(`parse:    median=${formatMs(median(result.parse))}, p95=${formatMs(p95(result.parse))}`)
      console.log(`search:   median=${formatMs(median(result.search))}, p95=${formatMs(p95(result.search))}`)
      console.log(`collapse: median=${formatMs(median(result.collapse))}, p95=${formatMs(p95(result.collapse))}`)
      console.log(`check:    median=${formatMs(median(result.check))}, p95=${formatMs(p95(result.check))}`)
      console.log(`wasmMemory=${result.wasmMemoryBytes} bytes`)
    } catch (error) {
      console.log(`\nshape=${shape}, N=${size}, ERROR=${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
