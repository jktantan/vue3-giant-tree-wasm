import { MpttTree } from './models'
import { CompactNodeStore } from './compact-store'
import { JsonEncoder } from './json/index'
import { escapeString } from './json/types'

// ITOA 查表：预计算 0..ITOA_MAX-1 的字符串，避免小整数 .toString() 堆分配
// 虚拟滚动中 leftNode/rightNode/deep/checked/selected 通常在此范围内
const ITOA_MAX: i32 = 4096
const _it: StaticArray<string> = new StaticArray<string>(ITOA_MAX)
{
  for (let i: i32 = 0; i < ITOA_MAX; i++) {
    _it[i] = i.toString()
  }
}

// @ts-ignore: decorator
@inline
function itoa(n: i32): string {
  if (n >= 0 && n < ITOA_MAX) return _it[n]
  return n.toString()
}

// @ts-ignore: decorator
@inline
function nodeToJson(node: MpttTree, comma: bool): string {
  let s: string = comma ? ',{"id":"' : '{"id":"'
  s += escapeString(node.id)
  s += '","name":"'
  s += escapeString(node.name)
  s += '","parentId":"'
  s += escapeString(node.parentId)
  s += '","leftNode":'
  s += itoa(node.leftNode)
  s += ',"rightNode":'
  s += itoa(node.rightNode)
  s += ',"deep":'
  s += itoa(node.deep)
  s += ',"checked":'
  s += itoa(node.checked)
  s += ',"selected":'
  s += itoa(node.selected)
  s += ',"collapsed":'
  s += node.collapsed ? 'true' : 'false'
  s += ',"disabled":'
  s += node.disabled ? 'true' : 'false'
  if (node.extendData.length > 0) {
    s += ',"extendData":'
    s += node.extendData
  }
  s += '}'
  return s
}

/** Serialize a visible node while sourcing numeric state from the compact store. */
function nodeToJsonCompact(node: MpttTree, index: i32, store: CompactNodeStore, comma: bool): string {
  let s: string = comma ? ',{"id":"' : '{"id":"'
  s += escapeString(node.id)
  s += '","name":"'
  s += escapeString(node.name)
  s += '","parentId":"'
  s += escapeString(node.parentId)
  s += '","leftNode":'
  s += itoa(store.left[index])
  s += ',"rightNode":'
  s += itoa(store.right[index])
  s += ',"deep":'
  s += itoa(store.depth[index])
  s += ',"checked":'
  s += itoa(store.checked[index])
  s += ',"selected":'
  s += itoa(store.selected[index])
  s += ',"collapsed":'
  s += store.collapsed[index] !== 0 ? 'true' : 'false'
  s += ',"disabled":'
  s += store.disabled[index] !== 0 ? 'true' : 'false'
  if (node.extendData.length > 0) {
    s += ',"extendData":'
    s += node.extendData
  }
  s += '}'
  return s
}

/**
 * 从 shownNodes 直接按索引范围序列化，合并 getVisibleSlice + serializeMpttArray，
 * 消除中间 MpttTree[] 分配。每帧省 1 次数组分配 + 1 次遍历。
 * 使用 ITOA 查表避免小整数 .toString() 堆分配。
 *
 * Serializes directly from shownNodes by index range, merging getVisibleSlice + serializeMpttArray.
 * Eliminates one intermediate MpttTree[] allocation per frame + one traversal.
 * Uses ITOA lookup table to avoid small-integer .toString() heap allocations.
 */
export function serializeShownSlice(
  shownNodes: MpttTree[],
  scrollTop: f32,
  scrollHeight: f32,
  lineHeight: f32
): string {
  const startIdx: i32 = <i32>Math.floor(scrollTop / lineHeight)
  const endIdx: i32 =
    <i32>Math.ceil((scrollTop + scrollHeight) / lineHeight) + 1

  const clampedStart: i32 =
    startIdx < 0
      ? 0
      : startIdx >= shownNodes.length
        ? shownNodes.length
        : startIdx
  const clampedEnd: i32 =
    endIdx < 0 ? 0 : endIdx > shownNodes.length ? shownNodes.length : endIdx

  if (clampedStart >= clampedEnd) return '[]'

  const parts: string[] = new Array<string>(clampedEnd - clampedStart + 2)
  parts[0] = '['
  for (let i: i32 = clampedStart; i < clampedEnd; i++) {
    parts[i - clampedStart + 1] = nodeToJson(shownNodes[i], i > clampedStart)
  }
  parts[clampedEnd - clampedStart + 1] = ']'
  return parts.join('')
}

export function serializeShownSliceCompact(
  shownNodes: MpttTree[],
  indices: Int32Array,
  store: CompactNodeStore,
  scrollTop: f32,
  scrollHeight: f32,
  lineHeight: f32
): string {
  const startIdx: i32 = <i32>Math.floor(scrollTop / lineHeight)
  const endIdx: i32 = <i32>Math.ceil((scrollTop + scrollHeight) / lineHeight) + 1
  const from: i32 = startIdx < 0 ? 0 : startIdx >= shownNodes.length ? shownNodes.length : startIdx
  const to: i32 = endIdx < from ? from : endIdx > shownNodes.length ? shownNodes.length : endIdx
  if (from >= to) return '[]'
  let result: string = '['
  for (let i: i32 = from; i < to; i++) {
    const fullIndex = indices[i]
    result += nodeToJsonCompact(shownNodes[i], fullIndex, store, i > from)
  }
  result += ']'
  return result
}

/** Serializes a virtual-list slice directly from compact full-tree indices. */
export function serializeShownIndicesCompact(
  tree: MpttTree[],
  indices: Int32Array,
  shownLength: i32,
  store: CompactNodeStore,
  scrollTop: f32,
  scrollHeight: f32,
  lineHeight: f32
): string {
  const startIdx: i32 = <i32>Math.floor(scrollTop / lineHeight)
  const endIdx: i32 = <i32>Math.ceil((scrollTop + scrollHeight) / lineHeight) + 1
  const from: i32 = startIdx < 0 ? 0 : startIdx >= shownLength ? shownLength : startIdx
  const to: i32 = endIdx < from ? from : endIdx > shownLength ? shownLength : endIdx
  if (from >= to) return '[]'
  let result = '['
  for (let i: i32 = from; i < to; i++) {
    const fullIndex = indices[i]
    result += nodeToJsonCompact(tree[fullIndex], fullIndex, store, i > from)
  }
  return result + ']'
}

/**
 * 将 MPTT 树数组序列化为 JSON 字符串（完整字段）
 * 主要用于非热路径（搜索结果等），滚动热路径请用 serializeShownSlice
 */
export function serializeMpttArray(tree: MpttTree[]): string {
  if (tree.length === 0) return '[]'
  const parts: string[] = new Array<string>(tree.length + 2)
  parts[0] = '['
  for (let i = 0; i < tree.length; i++) {
    parts[i + 1] = nodeToJson(tree[i], i > 0)
  }
  parts[tree.length + 1] = ']'
  return parts.join('')
}

/** Serialize full MPTT output while sourcing numeric/state fields from compact storage. */
export function serializeMpttArrayCompact(
  tree: MpttTree[],
  store: CompactNodeStore
): string {
  if (tree.length === 0) return '[]'
  let result: string = '['
  for (let i: i32 = 0; i < tree.length; i++) {
    result += nodeToJsonCompact(tree[i], i, store, i > 0)
  }
  result += ']'
  return result
}

/**
 * 将单个 MpttTree 节点序列化为 JSON 字符串
 * Serializes a single MpttTree node to a JSON string
 * Сериализует один узел MpttTree в строку JSON
 *
 * @param node - 待序列化的节点 / Node to serialize / Узел для сериализации
 * @returns JSON 字符串，格式为 {id,name,parentId,...} / JSON string / Строка JSON
 */
/**
 * 将节点数组序列化为 extendData（原始行数据），用于 JSON 输出模式
 * Serializes an array of nodes as extendData (original row data), for JSON output mode
 * Сериализует массив узлов как extendData (исходные данные строки), для режима вывода JSON
 *
 * 当节点有 extendData 时只输出 extendData（原始 JSON）；空时回退输出 MPTT 字段
 * When extendData is non-empty, outputs only extendData; falls back to MPTT fields when empty
 *
 * @param tree - 节点数组 / Node array / Массив узлов
 * @returns JSON 字符串 / JSON string / Строка JSON
 */
export function serializeCheckedArray(tree: MpttTree[]): string {
  const encoder = new JsonEncoder()
  encoder.pushArray(null)
  for (let i = 0; i < tree.length; i++) {
    const node: MpttTree = tree[i]
    if (node.extendData.length > 0) {
      encoder.setRawJson(null, node.extendData)
    } else {
      // 回退：输出 MPTT 字段
      encoder.pushObject(null)
      encoder.setString('id', node.id)
      encoder.setString('name', node.name)
      encoder.setString('parentId', node.parentId)
      encoder.setInteger('leftNode', node.leftNode)
      encoder.setInteger('rightNode', node.rightNode)
      encoder.setInteger('deep', node.deep)
      encoder.setInteger('checked', node.checked)
      encoder.setInteger('selected', node.selected)
      encoder.setBoolean('collapsed', node.collapsed)
      encoder.setBoolean('disabled', node.disabled)
      encoder.popObject()
    }
  }
  encoder.popArray()
  return encoder.toString()
}

/**
 * Serializes selected nodes using object strings/extendData and compact numeric
 * state. `indices` is already filtered by the caller's output mode.
 */
export function serializeCheckedArrayCompact(
  tree: MpttTree[],
  indices: i32[],
  store: CompactNodeStore
): string {
  const encoder = new JsonEncoder()
  encoder.pushArray(null)
  for (let i: i32 = 0; i < indices.length; i++) {
    const index = indices[i]
    const node = tree[index]
    if (node.extendData.length > 0) {
      encoder.setRawJson(null, node.extendData)
      continue
    }
    encoder.pushObject(null)
    encoder.setString('id', node.id)
    encoder.setString('name', node.name)
    encoder.setString('parentId', node.parentId)
    encoder.setInteger('leftNode', store.left[index])
    encoder.setInteger('rightNode', store.right[index])
    encoder.setInteger('deep', store.depth[index])
    encoder.setInteger('checked', store.checked[index])
    encoder.setInteger('selected', store.selected[index])
    encoder.setBoolean('collapsed', store.collapsed[index] !== 0)
    encoder.setBoolean('disabled', store.disabled[index] !== 0)
    encoder.popObject()
  }
  encoder.popArray()
  return encoder.toString()
}

/**
 * 将单个节点序列化为 extendData（原始行数据），用于 JSON 输出模式（RADIO/SELECT）
 * Serializes a single node as extendData, for JSON output mode (RADIO/SELECT)
 * Сериализует один узел как extendData, для режима вывода JSON (RADIO/SELECT)
 */
export function serializeCheckedNode(node: MpttTree): string {
  if (node.extendData.length > 0) {
    return node.extendData
  }
  // 回退：输出 MPTT 字段
  const encoder = new JsonEncoder()
  encoder.pushObject(null)
  encoder.setString('id', node.id)
  encoder.setString('name', node.name)
  encoder.setString('parentId', node.parentId)
  encoder.setInteger('leftNode', node.leftNode)
  encoder.setInteger('rightNode', node.rightNode)
  encoder.setInteger('deep', node.deep)
  encoder.setInteger('checked', node.checked)
  encoder.setInteger('selected', node.selected)
  encoder.setBoolean('collapsed', node.collapsed)
  encoder.setBoolean('disabled', node.disabled)
  encoder.popObject()
  return encoder.toString()
}

/**
 * 将单个 MpttTree 节点序列化为 JSON 字符串（使用 JsonEncoder）
 * Serializes a single MpttTree node to a JSON string (using JsonEncoder)
 * Сериализует один узел MpttTree в строку JSON (используя JsonEncoder)
 *
 * @param node - 待序列化的节点 / Node to serialize / Узел для сериализации
 * @returns JSON 字符串 / JSON string / Строка JSON
 */
export function serializeMpttNode(node: MpttTree): string {
  const encoder = new JsonEncoder()
  encoder.pushObject(null)
  encoder.setString('id', node.id)
  encoder.setString('name', node.name)
  encoder.setString('parentId', node.parentId)
  encoder.setInteger('leftNode', node.leftNode)
  encoder.setInteger('rightNode', node.rightNode)
  encoder.setInteger('deep', node.deep)
  encoder.setInteger('checked', node.checked)
  encoder.setInteger('selected', node.selected)
  encoder.setBoolean('collapsed', node.collapsed)
  encoder.setBoolean('disabled', node.disabled)
  if (node.extendData.length > 0) {
    encoder.setRawJson('extendData', node.extendData)
  }
  encoder.popObject()
  return encoder.toString()
}
