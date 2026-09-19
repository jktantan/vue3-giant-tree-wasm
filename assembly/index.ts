/**
 * WASM 导出桥接层：所有 export function 声明，委托给 GiantTree 实例方法
 * WASM export bridge layer: all export function declarations, delegating to GiantTree instance methods
 * Мост экспорта WASM: все объявления export function, делегирующие методам экземпляра GiantTree
 */
import {
  CheckType,
  CheckedOutputMode,
  DisplayType,
  SelectType,
  TreeFieldKeys,
} from './models'
import { GiantTree } from './giant-tree'
import { LazyCheckRangeStore } from './lazy-check-range-store'

export { CheckType, SelectType, DisplayType, CheckedOutputMode } from './models'

/** Experimental range store exports used for correctness tests before tree integration. */
export function newLazyCheckRangeStore(): LazyCheckRangeStore {
  return new LazyCheckRangeStore()
}

export function lazySetCheckedRange(
  target: LazyCheckRangeStore,
  left: i32,
  right: i32,
  value: u8
): void {
  target.setRange(left, right, value)
}

export function lazyGetCheckedPoint(
  target: LazyCheckRangeStore,
  index: i32
): i32 {
  return target.getPoint(index)
}

export function lazyGetRangeCount(target: LazyCheckRangeStore): i32 {
  return target.size
}

export function clearLazyCheckedRanges(target: LazyCheckRangeStore): void {
  target.clear()
}

export function newTree(
  root: string,
  lineHeight: f32,
  selectType: SelectType,
  preserveExtendData: bool = true
): GiantTree {
  return new GiantTree(
    root,
    lineHeight,
    selectType,
    'id',
    'name',
    'parentId',
    'leftNode',
    'rightNode',
    preserveExtendData
  )
}

export function newTreeWithKeys(
  root: string,
  lineHeight: f32,
  selectType: SelectType,
  idField: string,
  nameField: string,
  parentIdField: string,
  leftNodeField: string,
  rightNodeField: string,
  preserveExtendData: bool = true
): GiantTree {
  return new GiantTree(
    root,
    lineHeight,
    selectType,
    idField,
    nameField,
    parentIdField,
    leftNodeField,
    rightNodeField,
    preserveExtendData
  )
}

export function setTree(target: GiantTree, tree: string): void {
  target.setTree(tree)
}

export function setNeighborTree(target: GiantTree, tree: string): void {
  target.setNeighborTree(tree)
}

export function setPreserveExtendData(target: GiantTree, value: bool): void {
  target.setPreserveExtendData(value)
}

export function setUseCompactSelection(target: GiantTree, value: bool): void {
  target.setUseCompactSelection(value)
}

/** Enables the experimental lazy CHECKBOX range path for eligible RootOnly subtrees. */
export function setUseLazyCheckboxRanges(target: GiantTree, value: bool): void {
  target.setUseLazyCheckboxRanges(value)
}

export function setUseSearchCandidateIndex(
  target: GiantTree,
  value: bool
): void {
  target.setUseSearchCandidateIndex(value)
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

export function getAllNodes(target: GiantTree): string {
  return target.getAllNodes()
}

export function getCompactMemoryBytes(target: GiantTree): i32 {
  return target.getCompactMemoryBytes()
}

export function getCompactMirrorBytes(target: GiantTree): i32 {
  return target.getCompactMirrorBytes()
}

export function getObjectStringPayloadBytes(target: GiantTree): i32 {
  return target.getObjectStringPayloadBytes()
}

/** Reports whether a checkbox subtree has no disabled-node exception. */
export function canUseLazyCheckboxRange(target: GiantTree, id: string): bool {
  return target.canUseLazyCheckboxRange(id)
}

export function getShownIndices(target: GiantTree): i32[] {
  return target.getShownIndices()
}

export function getNodeSelectionStates(
  target: GiantTree,
  indices: i32[]
): i32[] {
  return target.getNodeSelectionStates(indices)
}

export function getNodeCollapsedStates(
  target: GiantTree,
  indices: i32[]
): i32[] {
  return target.getNodeCollapsedStates(indices)
}

export function getNodeLayouts(target: GiantTree, ids: string[]): i32[] {
  return target.getNodeLayouts(ids)
}

export function getAllNodeIds(target: GiantTree): string[] {
  return target.getAllNodeIds()
}

export function getAllNodeLayouts(target: GiantTree): i32[] {
  return target.getAllNodeLayouts()
}

export function getInputNodeLayouts(target: GiantTree): i32[] {
  return target.getInputNodeLayouts()
}

export function clearInputNodeLayouts(target: GiantTree): void {
  target.clearInputNodeLayouts()
}

export function getCheckedNodes(target: GiantTree): string {
  return target.getCheckedNodes()
}

export function getCheckedIds(target: GiantTree): string {
  return target.getCheckedIds()
}

export function getCheckedIdList(target: GiantTree): string[] {
  return target.getCheckedIdList()
}

export function setCheckedOutputMode(
  target: GiantTree,
  mode: CheckedOutputMode
): void {
  target.setCheckedOutputMode(mode)
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

/**
 * Appends one adjacency-list batch. Call popNeighbor after the final batch.
 * This is intentionally separate from the JSON setter so callers can yield
 * between batches without changing the default synchronous API.
 */
export function pushNeighborNodes(
  target: GiantTree,
  ids: string[],
  names: string[],
  parentIds: string[],
  disabled: bool[]
): void {
  target.pushNeighborNodes(ids, names, parentIds, disabled)
}

/**
 * Appends UTF-8 adjacency-list records encoded as one linear byte payload.
 * Used only by the opt-in chunked bridge.
 */
export function pushNeighborNodesUtf8(
  target: GiantTree,
  payload: Uint8Array
): void {
  target.pushNeighborNodesUtf8(payload)
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

export function collapseAll(target: GiantTree, isCollapse: boolean): void {
  target.collapseAll(isCollapse)
}

export function collapseTree(
  target: GiantTree,
  id: string,
  isCollapse: boolean
): void {
  target.collapseTree(id, isCollapse)
}
