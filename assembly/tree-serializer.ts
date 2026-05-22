import { MpttTree } from './models'
import { JSONEncoder } from 'assemblyscript-json'

/**
 * 将 MpttTree 数组序列化为 JSON 字符串
 * Serializes an array of MpttTree nodes to a JSON string
 * Сериализует массив узлов MpttTree в строку JSON
 *
 * @param tree - 待序列化的节点数组 / Array of nodes to serialize / Массив узлов для сериализации
 * @returns JSON 字符串，格式为 [{id,name,parentId,leftNode,rightNode,deep,checked,selected,collapsed}, ...] / JSON string / Строка JSON
 */
export function serializeMpttArray(tree: MpttTree[]): string {
  const encoder = new JSONEncoder()
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
export function serializeMpttNode(node: MpttTree): string {
  const encoder = new JSONEncoder()
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
  encoder.popObject()
  return encoder.toString()
}
