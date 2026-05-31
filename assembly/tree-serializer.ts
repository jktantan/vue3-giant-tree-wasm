import { MpttTree } from './models'
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
function pushNodeJson(parts: string[], node: MpttTree, comma: bool): void {
  if (comma) parts.push(',')
  parts.push('{"id":"')
  parts.push(escapeString(node.id))
  parts.push('","name":"')
  parts.push(escapeString(node.name))
  parts.push('","parentId":"')
  parts.push(escapeString(node.parentId))
  parts.push('","leftNode":')
  parts.push(itoa(node.leftNode))
  parts.push(',"rightNode":')
  parts.push(itoa(node.rightNode))
  parts.push(',"deep":')
  parts.push(itoa(node.deep))
  parts.push(',"checked":')
  parts.push(itoa(node.checked))
  parts.push(',"selected":')
  parts.push(itoa(node.selected))
  parts.push(',"collapsed":')
  parts.push(node.collapsed ? 'true' : 'false')
  parts.push(',"disabled":')
  parts.push(node.disabled ? 'true' : 'false')
  if (node.extendData.length > 0) {
    parts.push(',"extendData":')
    parts.push(node.extendData)
  }
  parts.push('}')
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

  const count: i32 = clampedEnd - clampedStart
  // 每节点约 22 片段 + 首尾 2，预分配容量避免动态扩容
  const parts: string[] = new Array<string>(count * 22 + 2)
  parts.push('[')
  for (let i: i32 = clampedStart; i < clampedEnd; i++) {
    pushNodeJson(parts, shownNodes[i], i > clampedStart)
  }
  parts.push(']')
  return parts.join('')
}

/**
 * 将 MPTT 树数组序列化为 JSON 字符串（完整字段）
 * 主要用于非热路径（搜索结果等），滚动热路径请用 serializeShownSlice
 */
export function serializeMpttArray(tree: MpttTree[]): string {
  if (tree.length === 0) return '[]'
  const parts: string[] = new Array<string>(tree.length * 22 + 2)
  parts.push('[')
  for (let i = 0; i < tree.length; i++) {
    pushNodeJson(parts, tree[i], i > 0)
  }
  parts.push(']')
  return parts.join('')
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
