import { MpttTree } from './models'
import { JsonEncoder } from './json/index'

/**
 * 将 MpttTree 数组序列化为 JSON 字符串
 * Serializes an array of MpttTree nodes to a JSON string
 * Сериализует массив узлов MpttTree в строку JSON
 *
 * @param tree - 待序列化的节点数组 / Array of nodes to serialize / Массив узлов для сериализации
 * @returns JSON 字符串，格式为 [{id,name,parentId,leftNode,rightNode,deep,checked,selected,collapsed}, ...] / JSON string / Строка JSON
 */
export function serializeMpttArray(tree: MpttTree[]): string {
  const encoder = new JsonEncoder()
  encoder.pushArray(null)
  for (let i = 0; i < tree.length; i++) {
    const node: MpttTree = tree[i]
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
    // extendData 包含完整的原始行数据（包括 id/name/parentId 及自定义字段），嵌入为原始 JSON 对象
    // embed original row data as raw JSON object, preserving all custom fields
    if (node.extendData.length > 0) {
      encoder.setRawJson('extendData', node.extendData)
    }
    encoder.popObject()
  }
  encoder.popArray()
  return encoder.toString()
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
