import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const candidates = (
  process.env.CAPACITY_SIZES ?? '100000,250000,500000,750000,1000000'
)
  .split(',')
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isInteger(value) && value > 0)

function idFor(index) {
  return `node-${index.toString(36).padStart(7, '0')}-${'x'.repeat(24)}`
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  ]
}

function makeComplexTree(size) {
  const tree = new Array(size)
  for (let i = 0; i < size; i++) {
    tree[i] = makeNode(i, i === 0 ? 'root' : idFor(Math.floor((i - 1) / 10)))
  }
  return tree
}

function makeNode(index, parentId) {
  return {
    id: idFor(index),
    name: `Complex node ${index} ${'name-value-'.repeat(3)}`,
    parentId,
    disabled: index % 97 === 0,
    category: index % 3 === 0 ? 'A' : index % 3 === 1 ? 'B' : 'C',
    metadata: {
      rank: index % 17,
      tags: [`tag-${index % 11}`, `group-${index % 23}`],
      description: 'payload-'.repeat(8),
    },
  }
}

function makeDeepTree(depth, width) {
  const tree = []
  let nextIndex = 0
  let parentId = 'root'
  for (let level = 0; level < depth; level++) {
    const chainId = idFor(nextIndex)
    tree.push(makeNode(nextIndex++, parentId))
    for (let sibling = 1; sibling < width; sibling++) {
      tree.push(makeNode(nextIndex++, chainId))
    }
    parentId = chainId
  }
  return tree
}

async function runSingle(size) {
  const wasm = await import(new URL('../build/release.js', import.meta.url))
  const input = makeComplexTree(size)
  const json = JSON.stringify(input)
  const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX, true)
  wasm.clear(tree)
  const start = performance.now()
  wasm.setNeighborTree(tree, json)
  const buildMs = performance.now() - start
  wasm.setBoundary(tree, 0, 520)
  const shownStart = performance.now()
  const indices = wasm.getShownIndices(tree)
  const shownMs = performance.now() - shownStart
  console.log(
    JSON.stringify({
      size,
      inputBytes: json.length,
      buildMs: Number(buildMs.toFixed(3)),
      shownMs: Number(shownMs.toFixed(3)),
      shownCount: indices.length,
      wasmMemoryBytes: wasm.memory.buffer.byteLength,
    })
  )
}

async function runPush(size) {
  const wasm = await import(new URL('../build/release.js', import.meta.url))
  const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX, false)
  wasm.clear(tree)
  const start = performance.now()
  for (let i = 0; i < size; i++) {
    wasm.pushNeighborNode(
      tree,
      idFor(i),
      `Complex push node ${i} ${'name-value-'.repeat(3)}`,
      i === 0 ? 'root' : idFor(Math.floor((i - 1) / 10))
    )
  }
  wasm.popNeighbor(tree)
  const buildMs = performance.now() - start
  wasm.setBoundary(tree, 0, 520)
  const searchStart = performance.now()
  const keyword = `Complex push node ${Math.floor(size / 2)}`
  wasm.fuzzyTree(tree, keyword)
  const searchMs = performance.now() - searchStart
  const repeatStart = performance.now()
  wasm.fuzzyTree(tree, keyword)
  const repeatSearchMs = performance.now() - repeatStart
  const alternateStart = performance.now()
  wasm.fuzzyTree(tree, `Complex push node ${Math.floor(size / 3)}`)
  const alternateSearchMs = performance.now() - alternateStart
  console.log(
    JSON.stringify({
      size,
      inputMode: 'push',
      buildMs: Number(buildMs.toFixed(3)),
      searchMs: Number(searchMs.toFixed(3)),
      wasmMemoryBytes: wasm.memory.buffer.byteLength,
    })
  )
}

async function runPushOps(size) {
  const wasm = await import(new URL('../build/release.js', import.meta.url))
  const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX, false)
  wasm.clear(tree)
  for (let i = 0; i < size; i++) {
    wasm.pushNeighborNode(
      tree,
      idFor(i),
      `Complex push node ${i} ${'name-value-'.repeat(3)}`,
      i === 0 ? 'root' : idFor(Math.floor((i - 1) / 10))
    )
  }
  wasm.popNeighbor(tree)
  wasm.setBoundary(tree, 0, 520)
  const layoutDiagnostics = {
    compactBytes: wasm.getCompactMemoryBytes(tree),
    compactMirrorBytes: wasm.getCompactMirrorBytes(tree),
    objectStringPayloadBytes: wasm.getObjectStringPayloadBytes(tree),
  }
  const expandStart = performance.now()
  wasm.collapseTree(tree, idFor(0), false)
  const expandMs = performance.now() - expandStart
  const searchStart = performance.now()
  const keyword = `Complex push node ${Math.floor(size / 2)}`
  wasm.fuzzyTree(tree, keyword)
  const searchMs = performance.now() - searchStart
  const repeatStart = performance.now()
  wasm.fuzzyTree(tree, keyword)
  const repeatSearchMs = performance.now() - repeatStart
  const alternateStart = performance.now()
  wasm.fuzzyTree(tree, `Complex push node ${Math.floor(size / 3)}`)
  const alternateSearchMs = performance.now() - alternateStart
  wasm.fuzzyTree(tree, '')
  wasm.fuzzyTree(tree, '')
  const leafChecks = []
  const rootChecks = []
  for (let round = 0; round < 5; round++) {
    const leafCheckStart = performance.now()
    wasm.checkNode(tree, idFor(size - 1), wasm.CheckType.CHECKED)
    leafChecks.push(performance.now() - leafCheckStart)
    const rootCheckStart = performance.now()
    wasm.checkNode(tree, idFor(0), wasm.CheckType.UNCHECKED)
    rootChecks.push(performance.now() - rootCheckStart)
  }
  const typingTimes = []
  for (const keywordPart of ['C', 'Co', 'Complex', 'Complex push node']) {
    const typingStart = performance.now()
    wasm.fuzzyTree(tree, keywordPart)
    typingTimes.push(performance.now() - typingStart)
  }
  const outputModes = [
    ['all', wasm.CheckedOutputMode.All],
    ['rootOnly', wasm.CheckedOutputMode.RootOnly],
    ['leafOnly', wasm.CheckedOutputMode.LeafOnly],
  ]
  const outputCosts = {}
  for (const [label, mode] of outputModes) {
    wasm.clearCheckedNodes(tree)
    wasm.setCheckedOutputMode(tree, mode)
    const writeStart = performance.now()
    wasm.checkNode(tree, idFor(0), wasm.CheckType.CHECKED)
    const writeMs = performance.now() - writeStart
    const outputStart = performance.now()
    const outputLength = wasm.getCheckedIds(tree).length
    const outputMs = performance.now() - outputStart
    outputCosts[label] = {
      writeMs: Number(writeMs.toFixed(3)),
      outputMs: Number(outputMs.toFixed(3)),
      outputLength,
    }
  }
  wasm.clearCheckedNodes(tree)
  wasm.setCheckedOutputMode(tree, wasm.CheckedOutputMode.RootOnly)
  wasm.setUseLazyCheckboxRanges(tree, true)
  const lazyWriteStart = performance.now()
  wasm.checkNode(tree, idFor(0), wasm.CheckType.CHECKED)
  const lazyWriteMs = performance.now() - lazyWriteStart
  const lazyOutputStart = performance.now()
  const lazyOutputLength = wasm.getCheckedIds(tree).length
  const lazyOutputMs = performance.now() - lazyOutputStart
  outputCosts.lazyRootOnly = {
    writeMs: Number(lazyWriteMs.toFixed(3)),
    outputMs: Number(lazyOutputMs.toFixed(3)),
    outputLength: lazyOutputLength,
  }
  wasm.clearCheckedNodes(tree)
  const lazyNestedWriteStart = performance.now()
  wasm.checkNode(tree, idFor(1), wasm.CheckType.CHECKED)
  const lazyNestedWriteMs = performance.now() - lazyNestedWriteStart
  const lazyNestedOutputStart = performance.now()
  const lazyNestedOutputLength = wasm.getCheckedIds(tree).length
  const lazyNestedOutputMs = performance.now() - lazyNestedOutputStart
  outputCosts.lazyNestedRootOnly = {
    writeMs: Number(lazyNestedWriteMs.toFixed(3)),
    outputMs: Number(lazyNestedOutputMs.toFixed(3)),
    outputLength: lazyNestedOutputLength,
  }
  wasm.setUseLazyCheckboxRanges(tree, false)
  wasm.setCheckedOutputMode(tree, wasm.CheckedOutputMode.All)
  console.log(
    JSON.stringify({
      size,
      inputMode: 'push',
      expandMs: Number(expandMs.toFixed(3)),
      searchMs: Number(searchMs.toFixed(3)),
      repeatSearchMs: Number(repeatSearchMs.toFixed(3)),
      alternateSearchMs: Number(alternateSearchMs.toFixed(3)),
      typingMedianMs: Number(median(typingTimes).toFixed(3)),
      typingP95Ms: Number(p95(typingTimes).toFixed(3)),
      leafCheckMedianMs: Number(median(leafChecks).toFixed(3)),
      leafCheckP95Ms: Number(p95(leafChecks).toFixed(3)),
      rootCheckMedianMs: Number(median(rootChecks).toFixed(3)),
      rootCheckP95Ms: Number(p95(rootChecks).toFixed(3)),
      outputCosts,
      layoutDiagnostics,
      wasmMemoryBytes: wasm.memory.buffer.byteLength,
    })
  )
}

async function runSearchAb(size) {
  const wasm = await import(new URL('../build/release.js', import.meta.url))
  const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX, false)
  for (let i = 0; i < size; i++) {
    wasm.pushNeighborNode(
      tree,
      idFor(i),
      `Complex push node ${i} ${'name-value-'.repeat(3)}`,
      i === 0 ? 'root' : idFor(Math.floor((i - 1) / 10))
    )
  }
  wasm.popNeighbor(tree)
  wasm.setBoundary(tree, 0, 520)
  if (global.gc) global.gc()
  const beforeIndex = {
    heapUsedBytes: process.memoryUsage().heapUsed,
    wasmMemoryBytes: wasm.memory.buffer.byteLength,
  }
  const keywords = [
    `Complex push node ${Math.floor(size / 2)}`,
    `node ${Math.floor(size / 3)}`,
    'name-value',
    'missing-search-term',
    `Complex push node ${Math.floor(size * 0.8)}`,
  ]
  const measure = enabled => {
    wasm.setUseSearchCandidateIndex(tree, enabled)
    const samples = []
    for (const keyword of keywords) {
      wasm.fuzzyTree(tree, '')
      const start = performance.now()
      wasm.fuzzyTree(tree, keyword)
      samples.push(performance.now() - start)
    }
    return {
      medianMs: Number(median(samples).toFixed(3)),
      p95Ms: Number(p95(samples).toFixed(3)),
    }
  }
  const indexed = measure(true)
  if (global.gc) global.gc()
  const afterIndexed = {
    heapUsedBytes: process.memoryUsage().heapUsed,
    wasmMemoryBytes: wasm.memory.buffer.byteLength,
  }
  const legacy = measure(false)
  if (global.gc) global.gc()
  const afterDisabled = {
    heapUsedBytes: process.memoryUsage().heapUsed,
    wasmMemoryBytes: wasm.memory.buffer.byteLength,
  }
  console.log(
    JSON.stringify({
      size,
      inputMode: 'push-search-ab',
      indexed,
      legacy,
      memory: {
        beforeIndex,
        afterIndexed,
        afterDisabled,
        indexedHeapDeltaBytes:
          afterIndexed.heapUsedBytes - beforeIndex.heapUsedBytes,
        indexedWasmDeltaBytes:
          afterIndexed.wasmMemoryBytes - beforeIndex.wasmMemoryBytes,
        releasedHeapBytes:
          afterIndexed.heapUsedBytes - afterDisabled.heapUsedBytes,
      },
    })
  )
}

async function runLazyMode(size, useLazy) {
  const wasm = await import(new URL('../build/release.js', import.meta.url))
  const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX, false)
  for (let i = 0; i < size; i++) {
    wasm.pushNeighborNode(
      tree,
      idFor(i),
      `Complex push node ${i}`,
      i === 0 ? 'root' : idFor(Math.floor((i - 1) / 10))
    )
  }
  wasm.popNeighbor(tree)
  wasm.setCheckedOutputMode(tree, wasm.CheckedOutputMode.RootOnly)
  wasm.setUseLazyCheckboxRanges(tree, useLazy)
  const writeSamples = []
  const outputSamples = []
  for (let round = 0; round < 12; round++) {
    wasm.clearCheckedNodes(tree)
    const writeStart = performance.now()
    wasm.checkNode(tree, idFor(0), wasm.CheckType.CHECKED)
    writeSamples.push(performance.now() - writeStart)
    const outputStart = performance.now()
    wasm.getCheckedIds(tree)
    outputSamples.push(performance.now() - outputStart)
  }
  console.log(
    JSON.stringify({
      size,
      mode: useLazy ? 'lazy' : 'legacy',
      writeP50Ms: Number(median(writeSamples).toFixed(3)),
      writeP95Ms: Number(p95(writeSamples).toFixed(3)),
      outputP50Ms: Number(median(outputSamples).toFixed(3)),
      outputP95Ms: Number(p95(outputSamples).toFixed(3)),
      wasmMemoryBytes: wasm.memory.buffer.byteLength,
    })
  )
}

async function runCompactMode(size, useCompactSelection) {
  const wasm = await import(new URL('../build/release.js', import.meta.url))
  const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX, false)
  for (let i = 0; i < size; i++) {
    wasm.pushNeighborNode(
      tree,
      idFor(i),
      `Compact comparison node ${i}`,
      i === 0 ? 'root' : idFor(Math.floor((i - 1) / 10))
    )
  }
  wasm.popNeighbor(tree)
  wasm.setBoundary(tree, 0, 520)
  wasm.setUseCompactSelection(tree, useCompactSelection)

  // Warm the same public operations before collecting the independent sample set.
  for (let round = 0; round < 3; round++) {
    wasm.checkNode(tree, idFor(size - 1), wasm.CheckType.CHECKED)
    wasm.clearCheckedNodes(tree)
    wasm.collapseTree(tree, idFor(0), false)
    wasm.collapseTree(tree, idFor(0), true)
  }
  if (global.gc) global.gc()

  const rootChecks = []
  const leafChecks = []
  const batchChecks = []
  const expands = []
  const collapses = []
  for (let round = 0; round < 12; round++) {
    wasm.clearCheckedNodes(tree)
    let start = performance.now()
    wasm.checkNode(tree, idFor(0), wasm.CheckType.CHECKED)
    rootChecks.push(performance.now() - start)

    wasm.clearCheckedNodes(tree)
    start = performance.now()
    wasm.checkNode(tree, idFor(size - 1), wasm.CheckType.CHECKED)
    leafChecks.push(performance.now() - start)

    start = performance.now()
    wasm.setCheckedNodes(tree, [
      idFor(Math.floor(size / 4)),
      idFor(Math.floor(size / 2)),
      idFor(size - 1),
    ])
    batchChecks.push(performance.now() - start)

    start = performance.now()
    wasm.collapseTree(tree, idFor(0), false)
    expands.push(performance.now() - start)
    start = performance.now()
    wasm.collapseTree(tree, idFor(0), true)
    collapses.push(performance.now() - start)
  }
  if (global.gc) global.gc()
  console.log(
    JSON.stringify({
      size,
      mode: useCompactSelection ? 'compact' : 'legacy',
      rounds: 12,
      rootCheckP50Ms: Number(median(rootChecks).toFixed(3)),
      rootCheckP95Ms: Number(p95(rootChecks).toFixed(3)),
      leafCheckP50Ms: Number(median(leafChecks).toFixed(3)),
      leafCheckP95Ms: Number(p95(leafChecks).toFixed(3)),
      batchCheckP50Ms: Number(median(batchChecks).toFixed(3)),
      batchCheckP95Ms: Number(p95(batchChecks).toFixed(3)),
      expandP50Ms: Number(median(expands).toFixed(3)),
      expandP95Ms: Number(p95(expands).toFixed(3)),
      collapseP50Ms: Number(median(collapses).toFixed(3)),
      collapseP95Ms: Number(p95(collapses).toFixed(3)),
      wasmMemoryBytes: wasm.memory.buffer.byteLength,
      jsHeapUsedBytes: process.memoryUsage().heapUsed,
    })
  )
}

function runLazyAb(size) {
  for (const mode of ['legacy', 'lazy']) {
    const result = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        fileURLToPath(import.meta.url),
        '--lazy-mode',
        String(size),
        mode,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env },
        maxBuffer: 1024 * 1024,
      }
    )
    const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop()
    if (result.status !== 0 || !line)
      throw new Error(result.stderr || result.stdout || `lazy ${mode} failed`)
    console.log(line)
  }
}

function runCompactAb(size) {
  for (const mode of ['legacy', 'compact']) {
    const result = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        fileURLToPath(import.meta.url),
        '--compact-mode',
        String(size),
        mode,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env },
        maxBuffer: 1024 * 1024,
      }
    )
    const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop()
    if (result.status !== 0 || !line)
      throw new Error(
        result.stderr || result.stdout || `compact ${mode} failed`
      )
    console.log(line)
  }
}

if (process.argv[2] === '--single') {
  await runSingle(Number.parseInt(process.argv[3], 10))
} else if (process.argv[2] === '--push') {
  await runPush(Number.parseInt(process.argv[3], 10))
} else if (process.argv[2] === '--push-ops') {
  await runPushOps(Number.parseInt(process.argv[3], 10))
} else if (process.argv[2] === '--search-ab') {
  await runSearchAb(Number.parseInt(process.argv[3], 10))
} else if (process.argv[2] === '--lazy-mode') {
  await runLazyMode(
    Number.parseInt(process.argv[3], 10),
    process.argv[4] === 'lazy'
  )
} else if (process.argv[2] === '--lazy-ab') {
  runLazyAb(Number.parseInt(process.argv[3], 10))
} else if (process.argv[2] === '--compact-mode') {
  await runCompactMode(
    Number.parseInt(process.argv[3], 10),
    process.argv[4] === 'compact'
  )
} else if (process.argv[2] === '--compact-ab') {
  runCompactAb(Number.parseInt(process.argv[3], 10))
} else if (process.argv[2] === '--deep') {
  const depth = Number.parseInt(process.argv[3], 10)
  const width = Number.parseInt(process.argv[4] ?? '4', 10)
  const wasm = await import(new URL('../build/release.js', import.meta.url))
  const input = makeDeepTree(depth, width)
  const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX, true)
  wasm.clear(tree)
  const start = performance.now()
  wasm.setNeighborTree(tree, JSON.stringify(input))
  const buildMs = performance.now() - start
  wasm.setBoundary(tree, 0, 520)
  const collapseStart = performance.now()
  wasm.collapseTree(tree, idFor(0), false)
  const collapseMs = performance.now() - collapseStart
  const searchStart = performance.now()
  wasm.fuzzyTree(tree, `Complex node ${idFor(Math.floor(depth / 2))}`)
  const searchMs = performance.now() - searchStart
  wasm.fuzzyTree(tree, '')
  const checkStart = performance.now()
  wasm.checkNode(tree, idFor(input.length - 1), wasm.CheckType.CHECKED)
  const checkMs = performance.now() - checkStart
  console.log(
    JSON.stringify({
      depth,
      width,
      size: input.length,
      buildMs: Number(buildMs.toFixed(3)),
      collapseMs: Number(collapseMs.toFixed(3)),
      searchMs: Number(searchMs.toFixed(3)),
      checkMs: Number(checkMs.toFixed(3)),
      wasmMemoryBytes: wasm.memory.buffer.byteLength,
    })
  )
} else {
  console.log(
    `Complex capacity benchmark (release WASM), candidates=${candidates.join(',')}`
  )
  for (const size of candidates) {
    const result = spawnSync(
      process.execPath,
      ['--expose-gc', fileURLToPath(import.meta.url), '--single', String(size)],
      {
        encoding: 'utf8',
        env: { ...process.env },
        maxBuffer: 1024 * 1024,
      }
    )
    const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop()
    if (result.status === 0 && line) {
      console.log(line)
    } else {
      const error = (result.stderr || result.stdout || `exit=${result.status}`)
        .trim()
        .split(/\r?\n/)
        .slice(-4)
        .join(' | ')
      console.log(
        JSON.stringify({
          size,
          status: 'failed',
          exitCode: result.status,
          error,
        })
      )
      break
    }
  }
}
