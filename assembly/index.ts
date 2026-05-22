/**
 * WASM 导出桥接层：所有 export function 声明，委托给 GiantTree 实例方法
 * WASM export bridge layer: all export function declarations, delegating to GiantTree instance methods
 * Мост экспорта WASM: все объявления export function, делегирующие методам экземпляра GiantTree
 */
import { CheckType, DisplayType, SelectType } from './models'
import { GiantTree } from './giant-tree'
import { JSON } from 'assemblyscript-json/assembly/index'

export { CheckType, SelectType, DisplayType } from './models'

export function newTree(
  root: string,
  lineHeight: f32,
  selectType: SelectType
): GiantTree {
  return new GiantTree(root, lineHeight, selectType)
}

export function setNeighborTree(target: GiantTree, tree: string): void {
  const jsonTree: JSON.Arr = <JSON.Arr>JSON.parse(tree)
  target.setNeighborTree(jsonTree)
}

export function setMpttTree(target: GiantTree, tree: string): void {
  target.setMpttTree(tree)
}

export function getSize(target: GiantTree): i32 {
  return target.getSize()
}

export function getShownNodes(target: GiantTree): string {
  return target.getShownNodes()
}

export function getCheckedNodes(target: GiantTree): string {
  return target.getCheckedNodes()
}

export function switchDisplayTree(
  target: GiantTree,
  displayType: DisplayType
): void {
  target.switchDisplayTree(displayType)
}

export function clear(target: GiantTree): void {
  target.clear()
}

export function popNeighbor(target: GiantTree): void {
  target.popNeighbor()
}

export function pushNeighborNode(
  target: GiantTree,
  id: string,
  name: string,
  parentId: string,
  disabled: boolean = false
): void {
  target.pushNeighborNode(id, name, parentId, disabled)
}

export function popMptt(target: GiantTree): void {
  target.popMptt()
}

export function pushMpttNode(
  target: GiantTree,
  id: string,
  name: string,
  parentId: string,
  leftNode: i32,
  rightNode: i32,
  deep: i32
): void {
  target.pushMpttNode(id, name, parentId, leftNode, rightNode, deep)
}

export function setBoundary(
  target: GiantTree,
  scrollTop: f32,
  scrollHeight: f32
): void {
  target.setBoundary(scrollTop, scrollHeight)
}

export function fuzzyTree(target: GiantTree, keyword: string): string {
  return target.fuzzySearch(keyword)
}

export function checkNode(
  target: GiantTree,
  id: string,
  checked: CheckType
): string {
  return target.checkNode(id, checked)
}

export function clearCheckedNodes(target: GiantTree): void {
  target.clearCheckedNodes()
}

export function setCheckedNode(target: GiantTree, id: string): void {
  target.setCheckedNode(id)
}

export function setCheckedNodes(target: GiantTree, ids: string[]): void {
  target.setCheckedNodes(ids)
}

export function getShownHeight(target: GiantTree): f32 {
  return target.getShownHeight()
}

export function collapseTree(
  target: GiantTree,
  id: string,
  isCollapse: boolean
): void {
  target.collapseTree(id, isCollapse)
}
