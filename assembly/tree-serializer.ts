import { MpttTree } from './models'
import { JsonEncoder } from './json/index'
import { escapeString } from './json/types'

export function serializeMpttArray(tree: MpttTree[]): string {
  if (tree.length === 0) return '[]'
  const parts = new Array<string>()
  parts.push('[')
  for (let i = 0; i < tree.length; i++) {
    if (i > 0) parts.push(',')
    const node: MpttTree = tree[i]
    parts.push('{"id":"')
    parts.push(escapeString(node.id))
    parts.push('","name":"')
    parts.push(escapeString(node.name))
    parts.push('","parentId":"')
    parts.push(escapeString(node.parentId))
    parts.push('","leftNode":')
    parts.push(node.leftNode.toString())
    parts.push(',"rightNode":')
    parts.push(node.rightNode.toString())
    parts.push(',"deep":')
    parts.push(node.deep.toString())
    parts.push(',"checked":')
    parts.push(node.checked.toString())
    parts.push(',"selected":')
    parts.push(node.selected.toString())
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
