import { performance } from 'node:perf_hooks'
import * as wasm from '../build/release.js'

const size = Number.parseInt(process.env.BENCH_SELECTION_SIZE ?? '100000', 10)
const rounds = Number.parseInt(process.env.BENCH_SELECTION_ROUNDS ?? '100000', 10)
const warmupRounds = Number.parseInt(process.env.BENCH_SELECTION_WARMUP ?? '10000', 10)

function build(selectType) {
  const tree = wasm.newTree('root', 26, selectType, false)
  for (let i = 0; i < size; i++) {
    wasm.pushNeighborNode(tree, `n${i}`, `Node ${i}`, 'root')
  }
  wasm.popNeighbor(tree)
  wasm.setBoundary(tree, 0, 520)
  return tree
}

for (const [name, type] of [
  ['RADIO', wasm.SelectType.RADIO],
  ['SELECT', wasm.SelectType.SELECT],
]) {
  for (const compact of [false, true]) {
    const tree = build(type)
    wasm.setUseCompactSelection(tree, compact)
    for (let i = 0; i < warmupRounds; i++) {
      wasm.setCheckedNode(tree, `n${i % size}`)
    }
    const start = performance.now()
    for (let i = 0; i < rounds; i++) {
      const id = `n${i % size}`
      wasm.setCheckedNode(tree, id)
    }
    const elapsed = performance.now() - start
    console.log(`${name} compact=${compact}: N=${size}, rounds=${rounds}, total=${elapsed.toFixed(3)} ms, perOp=${(elapsed / rounds).toFixed(6)} ms, compactBytes=${wasm.getCompactMemoryBytes(tree)}`)
  }
}
