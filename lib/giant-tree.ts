/**
 * 纯 JS 版本的 GiantTree 核心模块
 * MPTT（Modified Preorder Tree Traversal）算法实现
 */

export const enum CheckType {
  UNCHECKED = 0,
  HALF_CHECKED = 1,
  CHECKED = 2,
}

export const enum SelectType {
  CHECKBOX = 0,
  RADIO = 1,
  SELECT = 2,
}

export const enum DisplayType {
  TREE = 0,
  SEARCH = 1,
}

export const enum CheckedOutputMode {
  All = 0,
  RootOnly = 1,
  LeafOnly = 2,
  Custom = 3,
}

export interface MpttNode {
  id: string
  name: string
  parentId: string
  disabled: boolean
  leftNode: number
  rightNode: number
  deep: number
  checked: CheckType
  selected: CheckType
  collapsed: boolean
  shown: boolean
  extendData: Record<string, unknown> | null
}

function createNode(
  id: string,
  name: string,
  parentId: string,
  disabled: boolean
): MpttNode {
  return {
    id,
    name,
    parentId,
    disabled,
    leftNode: 0,
    rightNode: 0,
    deep: 0,
    checked: CheckType.UNCHECKED,
    selected: CheckType.UNCHECKED,
    collapsed: true,
    shown: false,
    extendData: null,
  }
}

interface StackFrame {
  children: Record<string, unknown>[]
  childIdx: number
  deep: number
  parentDisabled: boolean
  owner: MpttNode | null
}

export class GiantTree {
  root: string
  lineHeight: number
  selectType: SelectType
  checkedOutputMode: CheckedOutputMode = CheckedOutputMode.All
  fullTree: MpttNode[] = []
  searchTree: MpttNode[] = []
  tree: MpttNode[] = this.fullTree
  shownCount = 0
  _shownNodes: MpttNode[] = []
  idToIndex: Map<string, number> = new Map()
  scrollTop = 0
  scrollHeight = 0
  _radioCheckedIdx = -1
  _selectSelectedIdx = -1
  _cachedStartIdx = -1
  _cachedEndIdx = -1
  _cachedSlice: MpttNode[] | null = null
  _cacheValid = false

  private _idField: string
  private _nameField: string
  private _parentIdField: string

  constructor(
    root: string,
    lineHeight: number,
    selectType: SelectType,
    idField = 'id',
    nameField = 'name',
    parentIdField = 'parentId'
  ) {
    this.root = root
    this.lineHeight = lineHeight > 0 ? lineHeight : 20
    this.selectType = selectType
    this._idField = idField
    this._nameField = nameField
    this._parentIdField = parentIdField
  }

  _invalidateCache(): void {
    this._cacheValid = false
  }

  setTree(nodes: Record<string, unknown>[]): void {
    this.fullTree.length = 0
    this.shownCount = 0
    const treeMap = new Map<string, Record<string, unknown>[]>()
    const pidKey = this._parentIdField
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const pid = String(n[pidKey])
      let list = treeMap.get(pid)
      if (!list) {
        list = []
        treeMap.set(pid, list)
      }
      list.push(n)
    }
    this._iterativeBuild(treeMap, this.root)
    treeMap.clear()
    this.idToIndex = this._buildIdIndex()
    this._rebuildShownNodes()
  }

  private _iterativeBuild(
    treeMap: Map<string, Record<string, unknown>[]>,
    root: string
  ): void {
    const rootChildren = treeMap.get(root)
    if (!rootChildren) return
    const idKey = this._idField
    const nameKey = this._nameField
    const pidKey = this._parentIdField
    let lNode = 0
    const stack: StackFrame[] = [
      {
        children: rootChildren,
        childIdx: 0,
        deep: 0,
        parentDisabled: false,
        owner: null,
      },
    ]
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      if (frame.childIdx >= frame.children.length) {
        stack.pop()
        if (frame.owner) {
          frame.owner.rightNode = lNode
          if (frame.owner.parentId === root) {
            frame.owner.shown = true
            this.shownCount++
          }
          lNode = frame.owner.rightNode + 1
        }
        continue
      }
      const raw = frame.children[frame.childIdx++]
      const id = String(raw[idKey])
      const node = createNode(
        id,
        (raw[nameKey] as string) || '',
        String(raw[pidKey]),
        !!raw.disabled || frame.parentDisabled
      )
      node.leftNode = lNode
      node.deep = frame.deep
      node.extendData = raw as Record<string, unknown>
      this.fullTree.push(node)
      const kids = treeMap.get(id)
      if (kids) {
        lNode = node.leftNode + 1
        stack.push({
          children: kids,
          childIdx: 0,
          deep: frame.deep + 1,
          parentDisabled: node.disabled,
          owner: node,
        })
      } else {
        node.rightNode = node.leftNode + 1
        if (node.parentId === root) {
          node.shown = true
          this.shownCount++
        }
        lNode = node.rightNode + 1
      }
    }
  }

  private _buildIdIndex(): Map<string, number> {
    const map = new Map<string, number>()
    for (let i = 0; i < this.fullTree.length; i++)
      map.set(this.fullTree[i].id, i)
    return map
  }

  _rebuildShownNodes(): void {
    const arr: MpttNode[] = []
    const tree = this.tree
    for (let i = 0; i < tree.length; i++) {
      if (tree[i].shown) arr.push(tree[i])
    }
    this._shownNodes = arr
    this.shownCount = arr.length
    this._invalidateCache()
  }

  collapseTree(id: string, collapsed: boolean): void {
    if (!this.idToIndex.has(id)) return
    const i = this.idToIndex.get(id)!
    const node = this.fullTree[i]
    node.collapsed = collapsed
    const delta = this._setCollapsedShown(i + 1, node.rightNode, !collapsed)
    this.shownCount += delta
    this._incrementalUpdate(i, node.leftNode, node.rightNode, !collapsed)
    this._invalidateCache()
  }

  private _setCollapsedShown(
    startIndex: number,
    parentRightNode: number,
    shown: boolean
  ): number {
    let delta = 0
    const cb: number[] = []
    for (let i = startIndex; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      if (node.leftNode >= parentRightNode) break
      while (cb.length > 0 && node.leftNode >= cb[cb.length - 1]) cb.pop()
      if (cb.length > 0) {
        if (!shown && node.shown) {
          node.shown = false
          delta--
        }
      } else {
        const prev = node.shown
        node.shown = shown
        if (shown && !prev) delta++
        if (!shown && prev) delta--
        if (shown && node.collapsed && node.rightNode - node.leftNode > 1)
          cb.push(node.rightNode)
      }
    }
    return delta
  }

  private _binarySearch(targetLeftNode: number): number {
    let lo = 0,
      hi = this._shownNodes.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const v = this._shownNodes[mid].leftNode
      if (v === targetLeftNode) return mid
      if (v < targetLeftNode) lo = mid + 1
      else hi = mid - 1
    }
    return -1
  }

  private _incrementalUpdate(
    parentIdx: number,
    parentLeftNode: number,
    parentRightNode: number,
    expanded: boolean
  ): void {
    const parentNode = this.fullTree[parentIdx]
    if (expanded) {
      const toInsert: MpttNode[] = []
      for (let i = parentIdx + 1; i < this.fullTree.length; i++) {
        const node = this.fullTree[i]
        if (node.leftNode >= parentRightNode) break
        if (node.shown) toInsert.push(node)
      }
      if (toInsert.length === 0) return
      const insertPos = this._binarySearch(parentNode.leftNode) + 1
      this._shownNodes.splice(insertPos, 0, ...toInsert)
    } else {
      const psi = this._binarySearch(parentNode.leftNode)
      if (psi < 0) return
      const rs = psi + 1
      let re = rs
      while (re < this._shownNodes.length) {
        const node = this._shownNodes[re]
        if (node.leftNode < parentLeftNode || node.leftNode >= parentRightNode)
          break
        re++
      }
      if (re > rs) this._shownNodes.splice(rs, re - rs)
    }
  }

  collapseAll(collapsed: boolean): void {
    this._shownNodes.length = 0
    this.shownCount = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      node.collapsed = collapsed
      node.shown = !collapsed || node.parentId === this.root
      if (node.shown) {
        this._shownNodes.push(node)
        this.shownCount++
      }
    }
    this._invalidateCache()
  }

  setBoundary(scrollTop: number, scrollHeight: number): void {
    this.scrollTop = scrollTop
    this.scrollHeight = scrollHeight
  }

  getShownHeight(): number {
    return this.shownCount * this.lineHeight
  }

  getShownNodes(): MpttNode[] {
    const startIdx = Math.floor(this.scrollTop / this.lineHeight)
    const endIdx =
      Math.ceil((this.scrollTop + this.scrollHeight) / this.lineHeight) + 1
    if (
      this._cacheValid &&
      startIdx === this._cachedStartIdx &&
      endIdx === this._cachedEndIdx
    )
      return this._cachedSlice!
    const s = Math.max(0, Math.min(startIdx, this._shownNodes.length))
    const e = Math.max(0, Math.min(endIdx, this._shownNodes.length))
    const slice = this._shownNodes.slice(s, e)
    this._cachedStartIdx = startIdx
    this._cachedEndIdx = endIdx
    this._cachedSlice = slice
    this._cacheValid = true
    return slice
  }

  checkNode(id: string, checked: CheckType): MpttNode[] {
    this._invalidateCache()
    if (this.selectType === SelectType.RADIO) {
      if (!this.idToIndex.has(id)) return this.getShownNodes()
      const idx = this.idToIndex.get(id)!
      if (this.fullTree[idx].disabled) return this.getShownNodes()
      if (this._radioCheckedIdx >= 0 && this._radioCheckedIdx !== idx)
        this.fullTree[this._radioCheckedIdx].checked = CheckType.UNCHECKED
      this.fullTree[idx].checked = checked
      this._radioCheckedIdx = checked === CheckType.CHECKED ? idx : -1
    } else if (this.selectType === SelectType.SELECT) {
      if (!this.idToIndex.has(id)) return this.getShownNodes()
      const idx = this.idToIndex.get(id)!
      if (this.fullTree[idx].disabled) return this.getShownNodes()
      if (this._selectSelectedIdx >= 0 && this._selectSelectedIdx !== idx)
        this.fullTree[this._selectSelectedIdx].selected = CheckType.UNCHECKED
      this.fullTree[idx].selected = checked
      this._selectSelectedIdx = checked === CheckType.CHECKED ? idx : -1
    } else {
      this._checkNodeCB(id, checked)
    }
    return this.getShownNodes()
  }

  private _checkNodeCB(id: string, checked: CheckType): void {
    if (!this.idToIndex.has(id)) return
    const i = this.idToIndex.get(id)!
    const node = this.fullTree[i]
    if (node.disabled) return
    node.checked = checked
    for (let j = i + 1; j < this.fullTree.length; j++) {
      const c = this.fullTree[j]
      if (c.leftNode >= node.leftNode && c.rightNode <= node.rightNode) {
        if (!c.disabled) c.checked = checked
      } else break
    }
    for (let j = i - 1; j >= 0; j--) {
      const p = this.fullTree[j]
      if (p.leftNode <= node.leftNode && p.rightNode >= node.rightNode)
        p.checked = this._calcParentCheck(p, j + 1)
    }
  }

  private _calcParentCheck(node: MpttNode, startIndex: number): CheckType {
    let cN = 0,
      uN = 0,
      hN = 0
    for (let i = startIndex; i < this.fullTree.length; i++) {
      const c = this.fullTree[i]
      if (c.leftNode >= node.leftNode && c.rightNode <= node.rightNode) {
        if (c.deep === node.deep + 1) {
          if (c.checked === CheckType.CHECKED) cN++
          else if (c.checked === CheckType.HALF_CHECKED) hN++
          else uN++
          if ((cN > 0 && (uN > 0 || hN > 0)) || (uN > 0 && hN > 0))
            return CheckType.HALF_CHECKED
        }
      } else break
    }
    return cN > 0 ? CheckType.CHECKED : CheckType.UNCHECKED
  }

  setCheckedNode(id: string): void {
    this._invalidateCache()
    if (!this.idToIndex.has(id)) return
    const targetIdx = this.idToIndex.get(id)!
    if (this.fullTree[targetIdx].disabled) return
    if (this.selectType === SelectType.RADIO) {
      if (this._radioCheckedIdx >= 0 && this._radioCheckedIdx !== targetIdx)
        this.fullTree[this._radioCheckedIdx].checked = CheckType.UNCHECKED
      this.fullTree[targetIdx].checked = CheckType.CHECKED
      this._radioCheckedIdx = targetIdx
    } else if (this.selectType === SelectType.SELECT) {
      if (this._selectSelectedIdx >= 0 && this._selectSelectedIdx !== targetIdx)
        this.fullTree[this._selectSelectedIdx].selected = CheckType.UNCHECKED
      this.fullTree[targetIdx].selected = CheckType.CHECKED
      this._selectSelectedIdx = targetIdx
    } else {
      this._checkNodeCB(id, CheckType.CHECKED)
    }
  }

  setCheckedNodes(ids: string[]): void {
    for (let i = 0; i < this.fullTree.length; i++) {
      if (!this.fullTree[i].disabled)
        this.fullTree[i].checked = CheckType.UNCHECKED
    }
    const ancestorSet = new Set<string>()
    const ancestors: MpttNode[] = []
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      if (!this.idToIndex.has(id)) continue
      const idx = this.idToIndex.get(id)!
      const node = this.fullTree[idx]
      if (node.disabled) continue
      node.checked = CheckType.CHECKED
      for (let j = idx + 1; j < this.fullTree.length; j++) {
        const c = this.fullTree[j]
        if (c.leftNode >= node.leftNode && c.rightNode <= node.rightNode) {
          if (!c.disabled) c.checked = CheckType.CHECKED
        } else break
      }
      for (let j = idx - 1; j >= 0; j--) {
        const prev = this.fullTree[j]
        if (
          prev.leftNode <= node.leftNode &&
          prev.rightNode >= node.rightNode
        ) {
          if (ancestorSet.has(prev.id)) break
          ancestorSet.add(prev.id)
          ancestors.push(prev)
        }
      }
    }
    ancestors.sort((a, b) => b.leftNode - a.leftNode)
    for (let a = 0; a < ancestors.length; a++) {
      const anc = ancestors[a]
      anc.checked = this._calcParentCheck(anc, this.idToIndex.get(anc.id)! + 1)
    }
    this._invalidateCache()
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
  }

  getCheckedNodes(): MpttNode[] {
    if (this.selectType === SelectType.RADIO) {
      if (
        this._radioCheckedIdx >= 0 &&
        this._radioCheckedIdx < this.fullTree.length &&
        this.fullTree[this._radioCheckedIdx].checked === CheckType.CHECKED
      )
        return [this.fullTree[this._radioCheckedIdx]]
      for (let i = 0; i < this.fullTree.length; i++) {
        if (this.fullTree[i].checked === CheckType.CHECKED)
          return [this.fullTree[i]]
      }
      return []
    }
    if (this.selectType === SelectType.SELECT) {
      if (
        this._selectSelectedIdx >= 0 &&
        this._selectSelectedIdx < this.fullTree.length &&
        this.fullTree[this._selectSelectedIdx].selected === CheckType.CHECKED
      )
        return [this.fullTree[this._selectSelectedIdx]]
      for (let i = 0; i < this.fullTree.length; i++) {
        if (this.fullTree[i].selected === CheckType.CHECKED)
          return [this.fullTree[i]]
      }
      return []
    }
    const mode = this.checkedOutputMode
    if (mode === CheckedOutputMode.RootOnly) {
      const result: MpttNode[] = []
      const coverStack: number[] = []
      for (let i = 0; i < this.fullTree.length; i++) {
        const node = this.fullTree[i]
        while (
          coverStack.length > 0 &&
          node.leftNode >= coverStack[coverStack.length - 1]
        )
          coverStack.pop()
        if (node.checked !== CheckType.CHECKED) continue
        if (coverStack.length > 0) continue
        result.push(node)
        coverStack.push(node.rightNode)
      }
      return result
    }
    const result: MpttNode[] = []
    for (let i = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      if (node.checked !== CheckType.CHECKED) continue
      if (
        mode === CheckedOutputMode.LeafOnly &&
        node.rightNode - node.leftNode !== 1
      )
        continue
      result.push(node)
    }
    return result
  }

  getCheckedIds(): string[] {
    return this.getCheckedNodes().map(n => n.id)
  }

  clearCheckedNodes(): void {
    for (let i = 0; i < this.fullTree.length; i++) {
      this.fullTree[i].checked = CheckType.UNCHECKED
      this.fullTree[i].selected = CheckType.UNCHECKED
    }
    this._invalidateCache()
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
  }

  fuzzySearch(keyword: string): MpttNode[] {
    if (!keyword) {
      this.tree = this.fullTree
      this._resetShownFlags()
      this._rebuildShownNodes()
      return this.getShownNodes()
    }
    this.searchTree.length = 0
    const idSet = new Set<string>()
    const parentNodes: MpttNode[] = []
    const MAX_RESULTS = 5000
    let matchCount = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      if (node.name.indexOf(keyword) !== -1) {
        this.searchTree.push(node)
        idSet.add(node.id)
        matchCount++
        if (matchCount >= MAX_RESULTS) break
      }
    }
    let searchIdx = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      if (idSet.has(node.id)) continue
      while (
        searchIdx < this.searchTree.length &&
        this.searchTree[searchIdx].leftNode < node.leftNode
      )
        searchIdx++
      let isAnc = false
      for (let j = searchIdx; j < this.searchTree.length; j++) {
        const sn = this.searchTree[j]
        if (sn.leftNode >= node.rightNode) break
        if (sn.rightNode <= node.rightNode) {
          isAnc = true
          break
        }
      }
      if (isAnc) {
        idSet.add(node.id)
        parentNodes.push(node)
      }
    }
    for (let i = 0; i < parentNodes.length; i++)
      this.searchTree.push(parentNodes[i])
    this.searchTree.sort((a, b) => a.leftNode - b.leftNode)
    this.tree = this.searchTree
    this._shownNodes = this.searchTree.slice()
    for (let i = 0; i < this._shownNodes.length; i++)
      this._shownNodes[i].shown = true
    this.shownCount = this._shownNodes.length
    this._invalidateCache()
    return this.getShownNodes()
  }

  private _resetShownFlags(): void {
    for (let i = 0; i < this.fullTree.length; i++)
      this.fullTree[i].shown = false
    const cb: number[] = []
    for (let i = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      while (cb.length > 0 && node.leftNode >= cb[cb.length - 1]) cb.pop()
      if (cb.length === 0) {
        node.shown = true
        if (node.collapsed && node.rightNode - node.leftNode > 1)
          cb.push(node.rightNode)
      }
    }
  }

  switchDisplayTree(type: DisplayType): void {
    if (type === DisplayType.TREE) this.tree = this.fullTree
    else if (type === DisplayType.SEARCH) this.tree = this.searchTree
    this._rebuildShownNodes()
  }

  getSize(): number {
    return this.fullTree.length
  }

  clear(): void {
    this.fullTree.length = 0
    this.searchTree.length = 0
    this.tree = this.fullTree
    this.shownCount = 0
    this.idToIndex.clear()
    this._shownNodes.length = 0
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
    this._invalidateCache()
  }
}
