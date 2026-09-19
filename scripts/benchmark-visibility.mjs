import { performance } from 'node:perf_hooks'
import * as wasm from '../build/release.js'

const groups = Number.parseInt(process.env.BENCH_VIS_GROUPS ?? '1000', 10)
const children = Number.parseInt(process.env.BENCH_VIS_CHILDREN ?? '100', 10)
const rounds = Number.parseInt(process.env.BENCH_VIS_ROUNDS ?? '100', 10)

const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX)
for (let group = 0; group < groups; group++) {
  const parent = `p${group}`
  wasm.pushNeighborNode(tree, parent, `Parent ${group}`, 'root')
  for (let child = 0; child < children; child++) {
    wasm.pushNeighborNode(tree, `${parent}-c${child}`, `Child ${child}`, parent)
  }
}
wasm.popNeighbor(tree)
wasm.setBoundary(tree, 0, 520)

function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

console.log(`visibility: groups=${groups}, children=${children}, visible=${groups * (children + 1)}, rounds=${rounds}`)
for (const [label, group] of [['begin', 1], ['middle', Math.floor(groups / 2)], ['end', groups - 2]]) {
  const collapse = []
  const expand = []
  const target = `p${group}`
  for (let i = 0; i < rounds; i++) {
    let start = performance.now()
    wasm.collapseTree(tree, target, true)
    collapse.push(performance.now() - start)
    start = performance.now()
    wasm.collapseTree(tree, target, false)
    expand.push(performance.now() - start)
  }
  console.log(`${label}: collapse median=${median(collapse).toFixed(3)} ms, expand median=${median(expand).toFixed(3)} ms`)
}
