/// <reference lib="webworker" />
import type { CheckType, CheckedOutputMode, SelectType } from '../build/release'
// release loader 静态导入（而非动态 import()）：这样它会被打进 worker 自己的 chunk，
// worker 首次启动只需要一次请求，详见文件末尾的说明。
import * as wasmModule from '../build/release'

type WasmModule = typeof import('../build/release')
/** 树实例句柄（AssemblyScript 生成的内部引用类型）。 */
type TreeInstance = ReturnType<WasmModule['newTree']>
type Input = Record<string, unknown>
/** `wasm.getAllNodes` 返回的 JSON 行。 */
type SerializedRow = {
  id: string
  name: string
  parentId: string
  disabled?: boolean
}
type WorkerFieldKeys = {
  idField?: string
  nameField?: string
  parentIdField?: string
  leftNodeField?: string
  rightNodeField?: string
}
type WorkerConfig = {
  root: string
  lineHeight: number
  selectType: SelectType
  checkedOutputMode: CheckedOutputMode
  fieldKeys: WorkerFieldKeys
  preorderedInput?: boolean
}
/** 主线程 → worker 的命令。字段按 `type` 取用，未用到的字段由发送方省略。 */
type WorkerCommand = {
  type: string
  revision?: number
  scrollTop?: number
  scrollHeight?: number
  config: WorkerConfig
  tree: Input[]
  payload: ArrayBufferLike
  node: Input
  id: string
  ids: string[]
  collapsed: boolean
  checked: CheckType
  mode: CheckedOutputMode
  keyword: string
  patch: Record<string, unknown>
}
/** `applyStructure` 的输出，随 snapshot 一起回传主线程。 */
type StructureMutation =
  { type: 'add'; node: Input } | { type: 'remove'; ids: string[] }

let wasm: WasmModule
let tree: TreeInstance | null = null
let input: Input[] = []
let inputReady = false
let config: WorkerConfig
let scrollTop = 0
let scrollHeight = 0
let ready = false
const queue: WorkerCommand[] = []
let pendingSnapshotRevision = -1
let snapshotScheduled = false
let pendingCheckedResultRevision = -1
let checkedResultScheduled = false
const pendingStructure: WorkerCommand[] = []
let structureFlushScheduled = false
let commandsHandled = 0
let snapshotsSent = 0
let structuralBatches = 0
let structuralOperations = 0
let lastBatchSize = 0
let lastCommandStartedAt = 0
let lastSerializeMs = 0

const idField = () => config.fieldKeys.idField ?? 'id'
const parentField = () => config.fieldKeys.parentIdField ?? 'parentId'
const idOf = (node: Input) => String(node[idField()] ?? '')
const workerMetrics = () => ({
  commandsHandled,
  snapshotsSent,
  structuralBatches,
  structuralOperations,
  lastBatchSize,
  lastResponseMs: performance.now() - lastCommandStartedAt,
  lastSerializeMs,
})
const scheduleCheckedResult = (revision: number) => {
  pendingCheckedResultRevision = revision
  if (checkedResultScheduled) return
  checkedResultScheduled = true
  // Visual state must be responsive even when the selected-ID result is huge.
  // Coalescing keeps a rapid sequence of checkbox clicks to one large clone.
  setTimeout(() => {
    checkedResultScheduled = false
    if (!tree) return
    self.postMessage({
      type: 'checked',
      revision: pendingCheckedResultRevision,
      checkedIds: wasm.getCheckedIdList(tree),
    })
  }, 48)
}
const snapshot = (revision: number, mutation?: unknown) => {
  if (mutation && tree) {
    const serializeStartedAt = performance.now()
    wasm.setBoundary(tree, scrollTop, scrollHeight)
    const size = wasm.getSize(tree),
      listHeight = wasm.getShownHeight(tree),
      rows = JSON.parse(wasm.getShownNodes(tree))
    lastSerializeMs = performance.now() - serializeStartedAt
    snapshotsSent++
    self.postMessage({
      type: 'snapshot',
      revision,
      size,
      listHeight,
      rows,
      mutation,
      metrics: workerMetrics(),
    })
    return
  }
  pendingSnapshotRevision = revision
  if (snapshotScheduled) return
  snapshotScheduled = true
  setTimeout(() => {
    snapshotScheduled = false
    const nextRevision = pendingSnapshotRevision
    if (!tree) return
    const serializeStartedAt = performance.now()
    wasm.setBoundary(tree, scrollTop, scrollHeight)
    const size = wasm.getSize(tree),
      listHeight = wasm.getShownHeight(tree),
      rows = JSON.parse(wasm.getShownNodes(tree))
    lastSerializeMs = performance.now() - serializeStartedAt
    snapshotsSent++
    self.postMessage({
      type: 'snapshot',
      revision: nextRevision,
      size,
      listHeight,
      rows,
      metrics: workerMetrics(),
    })
  }, 0)
}
const rebuild = (next: Input[]) => {
  input = next
  // 复用 tree 实例：每次 newTree 会让旧实例的线性内存依赖 GC 异步回收，
  // 高频 replace 时分配速度超过回收速度，形成"内存棘轮"（实测 12 次
  // replace 20 万节点内存涨至 1980MB）。clear() 后 TLSF 分配器原地复用，
  // 内存稳定不涨。仅当 root/lineHeight/selectType/fieldKeys 变化时才重建实例。
  if (tree && !treeConfigMatches()) {
    tree = null
  }
  tree = ensureTree()
  wasm.clear(tree)
  wasm.setNeighborTree(tree, JSON.stringify(input))
  wasm.setCheckedOutputMode(tree, config.checkedOutputMode)
}
let treeSignature: string | null = null
function treeConfigMatches(): boolean {
  const k = config.fieldKeys
  const signature = [
    config.root,
    config.lineHeight,
    config.selectType,
    Object.keys(k).length
      ? [
          k.idField ?? 'id',
          k.nameField ?? 'name',
          k.parentIdField ?? 'parentId',
          k.leftNodeField ?? 'leftNode',
          k.rightNodeField ?? 'rightNode',
        ].join('\u0000')
      : '',
  ].join('\u0001')
  return treeSignature === signature
}
function ensureTree() {
  if (tree) return tree
  const k = config.fieldKeys
  tree = Object.keys(k).length
    ? wasm.newTreeWithKeys(
        config.root,
        config.lineHeight,
        config.selectType,
        k.idField ?? 'id',
        k.nameField ?? 'name',
        k.parentIdField ?? 'parentId',
        k.leftNodeField ?? 'leftNode',
        k.rightNodeField ?? 'rightNode',
        false
      )
    : wasm.newTree(config.root, config.lineHeight, config.selectType, false)
  treeSignature = [
    config.root,
    config.lineHeight,
    config.selectType,
    Object.keys(k).length
      ? [
          k.idField ?? 'id',
          k.nameField ?? 'name',
          k.parentIdField ?? 'parentId',
          k.leftNodeField ?? 'leftNode',
          k.rightNodeField ?? 'rightNode',
        ].join('\u0000')
      : '',
  ].join('\u0001')
  wasm.setTrackInputLayouts(tree, false)
  wasm.setUsePreorderedNeighborInput(tree, config.preorderedInput === true)
  return tree
}
const createEmptyTree = () => {
  if (tree && !treeConfigMatches()) {
    tree = null
  }
  tree = ensureTree()
  wasm.clear(tree)
  wasm.setCheckedOutputMode(tree, config.checkedOutputMode)
}
const ensureInput = () => {
  if (inputReady || !tree) return
  const nameField = config.fieldKeys.nameField ?? 'name'
  input = (JSON.parse(wasm.getAllNodes(tree)) as SerializedRow[]).map(node => ({
    [idField()]: node.id,
    [nameField]: node.name,
    [parentField()]: node.parentId,
    disabled: node.disabled === true,
  }))
  inputReady = true
}
const applyStructure = (m: WorkerCommand): StructureMutation | undefined => {
  if (!tree) return undefined
  if (m.type === 'add') {
    const parentId = String(m.node[parentField()] ?? '')
    const nameField = config.fieldKeys.nameField ?? 'name'
    if (
      idOf(m.node) &&
      wasm.appendChild(
        tree,
        idOf(m.node),
        String(m.node[nameField] ?? idOf(m.node)),
        parentId,
        m.node.disabled === true
      )
    ) {
      if (inputReady) input.push(m.node)
      return { type: 'add', node: m.node }
    }
  } else if (m.type === 'remove') {
    const removed = wasm.getSubtreeIds(tree, m.id) as string[]
    if (wasm.removeSubtree(tree, m.id)) {
      if (inputReady) {
        const removedSet = new Set(removed)
        input = input.filter(node => !removedSet.has(idOf(node)))
      }
      return { type: 'remove', ids: removed }
    }
  }
  return undefined
}
const flushStructure = () => {
  if (!tree || pendingStructure.length === 0) return
  structureFlushScheduled = false
  const operations = pendingStructure.splice(0)
  structuralBatches++
  structuralOperations += operations.length
  lastBatchSize = operations.length
  const mutations: StructureMutation[] = []
  let revision = 0
  wasm.beginStructureBatch(tree)
  for (const operation of operations) {
    revision = Number(operation.revision ?? revision)
    const mutation = applyStructure(operation)
    if (mutation) mutations.push(mutation)
  }
  wasm.endStructureBatch(tree)
  if (mutations.length > 0) {
    snapshot(revision, { type: 'batch', mutations })
    scheduleCheckedResult(revision)
  } else snapshot(revision)
}
const enqueueStructure = (m: WorkerCommand) => {
  pendingStructure.push(m)
  if (structureFlushScheduled) return
  structureFlushScheduled = true
  // postMessage deliveries are separate tasks; a zero-delay timer can run
  // between two synchronous calls from the same UI handler. One short frame
  // window groups those calls while keeping CRUD feedback immediate.
  setTimeout(flushStructure, 16)
}
const handle = (m: WorkerCommand) => {
  commandsHandled++
  lastCommandStartedAt = performance.now()
  const revision = Number(m.revision ?? 0)
  if (m.type === 'stream-start') {
    config = m.config
    scrollTop = m.scrollTop ?? 0
    scrollHeight = m.scrollHeight ?? 0
    input = []
    inputReady = false
    createEmptyTree()
    return
  }
  if (m.type === 'stream-batch') {
    if (!tree) return
    const payload = new Uint8Array(m.payload)
    wasm.pushNeighborNodesUtf8(tree, payload)
    return
  }
  if (m.type === 'stream-finish') {
    if (!tree) return
    wasm.popNeighbor(tree)
    snapshot(revision)
    scheduleCheckedResult(revision)
    return
  }
  if (m.type === 'init' || m.type === 'replace') {
    config = m.config
    scrollTop = m.scrollTop ?? 0
    scrollHeight = m.scrollHeight ?? 0
    rebuild(m.tree)
    inputReady = true
    snapshot(revision)
    scheduleCheckedResult(revision)
    return
  }
  if (!tree) return
  if (m.type === 'add' || m.type === 'remove') {
    enqueueStructure(m)
    return
  }
  // Preserve command order: a check/collapse/search after an add or delete
  // must observe that structural change, even before the timer fires.
  flushStructure()
  if (m.type === 'boundary') {
    scrollTop = m.scrollTop
    scrollHeight = m.scrollHeight
  } else if (m.type === 'collapse') wasm.collapseTree(tree, m.id, m.collapsed)
  else if (m.type === 'collapse-all') wasm.collapseAll(tree, m.collapsed)
  else if (m.type === 'check') wasm.checkNode(tree, m.id, m.checked)
  else if (m.type === 'clear-check') wasm.clearCheckedNodes(tree)
  else if (m.type === 'set-check') wasm.setCheckedNode(tree, m.id)
  else if (m.type === 'set-checks') wasm.setCheckedNodes(tree, m.ids)
  else if (m.type === 'set-output') wasm.setCheckedOutputMode(tree, m.mode)
  else if (m.type === 'search') wasm.fuzzyTree(tree, m.keyword)
  else if (m.type === 'update') {
    const nameField = config.fieldKeys.nameField ?? 'name'
    const structural = parentField() in m.patch || 'disabled' in m.patch
    if (structural) {
      ensureInput()
      const index = input.findIndex(node => idOf(node) === m.id)
      if (index < 0) {
        snapshot(revision)
        return
      }
      input[index] = { ...input[index], ...m.patch }
      rebuild(input)
    } else if (
      nameField in m.patch &&
      wasm.updateNodeName(tree, m.id, String(m.patch[nameField]))
    ) {
      snapshot(revision, { type: 'update', id: m.id, patch: m.patch })
      return
    }
  }
  snapshot(revision)
  if (
    m.type === 'check' ||
    m.type === 'clear-check' ||
    m.type === 'set-check' ||
    m.type === 'set-checks' ||
    m.type === 'set-output'
  )
    scheduleCheckedResult(revision)
}
self.onmessage = e => {
  const command = e.data as WorkerCommand
  if (ready) handle(command)
  else queue.push(command)
}
// `../build/release` 是静态导入，wasm 已在本模块求值阶段实例化完毕，因此这里不会有
// 排队命令；保留 queue 分支只是防御。
//
// 之所以不用 `import().then()`：动态 import 会让 loader 变成一个独立 chunk，worker
// 首次启动要「worker 脚本 + loader chunk」两次请求 —— 慢网络下每次 1~2 秒，直接体现为
// worker 首次建树的 roundTrip 变长。静态导入把两者合并为一次请求。
wasm = wasmModule
ready = true
self.postMessage({ type: 'ready' })
for (const command of queue.splice(0)) handle(command)
