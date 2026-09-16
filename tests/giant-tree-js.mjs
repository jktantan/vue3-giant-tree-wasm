/**
 * 纯 JS 版本的 GiantTree 核心模块
 * 与 WASM 版本完全对等的 MPTT 算法实现，零序列化开销
 */

const UNCHECKED = 0
const HALF_CHECKED = 1
const CHECKED = 2

class MpttNode {
  constructor(id, name, parentId, disabled) {
    this.id = id
    this.name = name
    this.parentId = parentId
    this.disabled = disabled
    this.leftNode = 0
    this.rightNode = 0
    this.deep = 0
    this.checked = UNCHECKED
    this.selected = UNCHECKED
    this.collapsed = true
    this.shown = false
    this.extendData = null
  }
}

class GiantTree {
  constructor(root, lineHeight, selectType) {
    this.root = root
    this.lineHeight = lineHeight > 0 ? lineHeight : 20
    this.selectType = selectType
    this.fullTree = []
    this.searchTree = []
    this.tree = this.fullTree
    this.shownCount = 0
    this._shownNodes = []
    this.idToIndex = new Map()
    this.scrollTop = 0
    this.scrollHeight = 0
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
    this._cachedStartIdx = -1
    this._cachedEndIdx = -1
    this._cachedSlice = null
    this._cacheValid = false
  }

  _invalidateCache() { this._cacheValid = false }

  setTreeFromArray(nodes) {
    this.fullTree.length = 0
    this.shownCount = 0
    const treeMap = new Map()
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const pid = String(n.parentId)
      let list = treeMap.get(pid)
      if (!list) { list = []; treeMap.set(pid, list) }
      list.push(n)
    }
    this._iterativeBuild(treeMap, this.root)
    treeMap.clear()
    this.idToIndex = this._buildIdIndex()
    this._rebuildShownNodes()
  }

  setTree(jsonStr) { this.setTreeFromArray(JSON.parse(jsonStr)) }

  _iterativeBuild(treeMap, root) {
    const rootChildren = treeMap.get(root)
    if (!rootChildren) return
    let lNode = 0
    const stack = [{ children: rootChildren, childIdx: 0, deep: 0, parentDisabled: false, owner: null }]
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      if (frame.childIdx >= frame.children.length) {
        stack.pop()
        if (frame.owner) {
          frame.owner.rightNode = lNode
          if (frame.owner.parentId === root) { frame.owner.shown = true; this.shownCount++ }
          lNode = frame.owner.rightNode + 1
        }
        continue
      }
      const raw = frame.children[frame.childIdx++]
      const id = String(raw.id)
      const node = new MpttNode(id, raw.name || '', String(raw.parentId), !!(raw.disabled) || frame.parentDisabled)
      node.leftNode = lNode
      node.deep = frame.deep
      node.extendData = raw
      this.fullTree.push(node)
      const kids = treeMap.get(id)
      if (kids) {
        lNode = node.leftNode + 1
        stack.push({ children: kids, childIdx: 0, deep: frame.deep + 1, parentDisabled: node.disabled, owner: node })
      } else {
        node.rightNode = node.leftNode + 1
        if (node.parentId === root) { node.shown = true; this.shownCount++ }
        lNode = node.rightNode + 1
      }
    }
  }

  _buildIdIndex() {
    const map = new Map()
    for (let i = 0; i < this.fullTree.length; i++) map.set(this.fullTree[i].id, i)
    return map
  }

  _rebuildShownNodes() {
    const arr = []
    const tree = this.tree
    for (let i = 0; i < tree.length; i++) { if (tree[i].shown) arr.push(tree[i]) }
    this._shownNodes = arr
    this.shownCount = arr.length
    this._invalidateCache()
  }

  collapseTree(id, collapsed) {
    if (!this.idToIndex.has(id)) return
    const i = this.idToIndex.get(id)
    const node = this.fullTree[i]
    node.collapsed = collapsed
    const delta = this._setCollapsedShown(i + 1, node.rightNode, !collapsed)
    this.shownCount += delta
    this._incrementalUpdate(i, node.leftNode, node.rightNode, !collapsed)
    this._invalidateCache()
  }

  _setCollapsedShown(startIndex, parentRightNode, shown) {
    let delta = 0
    const cb = []
    for (let i = startIndex; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      if (node.leftNode >= parentRightNode) break
      while (cb.length > 0 && node.leftNode >= cb[cb.length - 1]) cb.pop()
      if (cb.length > 0) {
        if (!shown && node.shown) { node.shown = false; delta-- }
      } else {
        const prev = node.shown
        node.shown = shown
        if (shown && !prev) delta++
        if (!shown && prev) delta--
        if (shown && node.collapsed && node.rightNode - node.leftNode > 1) cb.push(node.rightNode)
      }
    }
    return delta
  }

  _binarySearch(targetLeftNode) {
    let lo = 0, hi = this._shownNodes.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const v = this._shownNodes[mid].leftNode
      if (v === targetLeftNode) return mid
      if (v < targetLeftNode) lo = mid + 1; else hi = mid - 1
    }
    return -1
  }

  _incrementalUpdate(parentIdx, parentLeftNode, parentRightNode, expanded) {
    const parentNode = this.fullTree[parentIdx]
    if (expanded) {
      const toInsert = []
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
        if (node.leftNode < parentLeftNode || node.leftNode >= parentRightNode) break
        re++
      }
      if (re > rs) this._shownNodes.splice(rs, re - rs)
    }
  }

  setBoundary(scrollTop, scrollHeight) { this.scrollTop = scrollTop; this.scrollHeight = scrollHeight }
  getShownHeight() { return this.shownCount * this.lineHeight }

  getShownNodes() {
    const startIdx = Math.floor(this.scrollTop / this.lineHeight)
    const endIdx = Math.ceil((this.scrollTop + this.scrollHeight) / this.lineHeight) + 1
    if (this._cacheValid && startIdx === this._cachedStartIdx && endIdx === this._cachedEndIdx) return this._cachedSlice
    const s = Math.max(0, Math.min(startIdx, this._shownNodes.length))
    const e = Math.max(0, Math.min(endIdx, this._shownNodes.length))
    const slice = this._shownNodes.slice(s, e)
    this._cachedStartIdx = startIdx
    this._cachedEndIdx = endIdx
    this._cachedSlice = slice
    this._cacheValid = true
    return slice
  }

  checkNode(id, checked) {
    this._invalidateCache()
    if (this.selectType === 1) {
      if (!this.idToIndex.has(id)) return this.getShownNodes()
      const idx = this.idToIndex.get(id)
      if (this.fullTree[idx].disabled) return this.getShownNodes()
      if (this._radioCheckedIdx >= 0 && this._radioCheckedIdx !== idx) this.fullTree[this._radioCheckedIdx].checked = UNCHECKED
      this.fullTree[idx].checked = checked
      this._radioCheckedIdx = checked === CHECKED ? idx : -1
    } else if (this.selectType === 2) {
      if (!this.idToIndex.has(id)) return this.getShownNodes()
      const idx = this.idToIndex.get(id)
      if (this.fullTree[idx].disabled) return this.getShownNodes()
      if (this._selectSelectedIdx >= 0 && this._selectSelectedIdx !== idx) this.fullTree[this._selectSelectedIdx].selected = UNCHECKED
      this.fullTree[idx].selected = checked
      this._selectSelectedIdx = checked === CHECKED ? idx : -1
    } else {
      this._checkNodeCB(id, checked)
    }
    return this.getShownNodes()
  }

  _checkNodeCB(id, checked) {
    if (!this.idToIndex.has(id)) return
    const i = this.idToIndex.get(id)
    const node = this.fullTree[i]
    if (node.disabled) return
    node.checked = checked
    for (let j = i + 1; j < this.fullTree.length; j++) {
      const c = this.fullTree[j]
      if (c.leftNode >= node.leftNode && c.rightNode <= node.rightNode) { if (!c.disabled) c.checked = checked } else break
    }
    for (let j = i - 1; j >= 0; j--) {
      const p = this.fullTree[j]
      if (p.leftNode <= node.leftNode && p.rightNode >= node.rightNode) p.checked = this._calcParentCheck(p, j + 1)
    }
  }

  _calcParentCheck(node, startIndex) {
    let cN = 0, uN = 0, hN = 0
    for (let i = startIndex; i < this.fullTree.length; i++) {
      const c = this.fullTree[i]
      if (c.leftNode >= node.leftNode && c.rightNode <= node.rightNode) {
        if (c.deep === node.deep + 1) {
          if (c.checked === CHECKED) cN++; else if (c.checked === HALF_CHECKED) hN++; else uN++
          if ((cN > 0 && (uN > 0 || hN > 0)) || (uN > 0 && hN > 0)) return HALF_CHECKED
        }
      } else break
    }
    return cN > 0 ? CHECKED : UNCHECKED
  }

  setCheckedNodes(ids) {
    for (let i = 0; i < this.fullTree.length; i++) { if (!this.fullTree[i].disabled) this.fullTree[i].checked = UNCHECKED }
    const ancestorSet = new Set()
    const ancestors = []
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      if (!this.idToIndex.has(id)) continue
      const idx = this.idToIndex.get(id)
      const node = this.fullTree[idx]
      if (node.disabled) continue
      node.checked = CHECKED
      for (let j = idx + 1; j < this.fullTree.length; j++) {
        const c = this.fullTree[j]
        if (c.leftNode >= node.leftNode && c.rightNode <= node.rightNode) { if (!c.disabled) c.checked = CHECKED } else break
      }
      for (let j = idx - 1; j >= 0; j--) {
        const prev = this.fullTree[j]
        if (prev.leftNode <= node.leftNode && prev.rightNode >= node.rightNode) {
          if (ancestorSet.has(prev.id)) break
          ancestorSet.add(prev.id)
          ancestors.push(prev)
        }
      }
    }
    ancestors.sort((a, b) => b.leftNode - a.leftNode)
    for (let a = 0; a < ancestors.length; a++) {
      const anc = ancestors[a]
      anc.checked = this._calcParentCheck(anc, this.idToIndex.get(anc.id) + 1)
    }
    this._invalidateCache()
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
  }

  clearCheckedNodes() {
    for (let i = 0; i < this.fullTree.length; i++) { this.fullTree[i].checked = UNCHECKED; this.fullTree[i].selected = UNCHECKED }
    this._invalidateCache()
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
  }

  fuzzySearch(keyword) {
    if (!keyword) {
      this.tree = this.fullTree
      this._resetShownFlags()
      this._rebuildShownNodes()
      return this.getShownNodes()
    }
    this.searchTree.length = 0
    const idSet = new Set()
    const parentNodes = []
    let matchCount = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      if (node.name.indexOf(keyword) !== -1) {
        this.searchTree.push(node); idSet.add(node.id); matchCount++
        if (matchCount >= 5000) break
      }
    }
    let searchIdx = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      if (idSet.has(node.id)) continue
      while (searchIdx < this.searchTree.length && this.searchTree[searchIdx].leftNode < node.leftNode) searchIdx++
      let isAnc = false
      for (let j = searchIdx; j < this.searchTree.length; j++) {
        const sn = this.searchTree[j]
        if (sn.leftNode >= node.rightNode) break
        if (sn.rightNode <= node.rightNode) { isAnc = true; break }
      }
      if (isAnc) { idSet.add(node.id); parentNodes.push(node) }
    }
    for (let i = 0; i < parentNodes.length; i++) this.searchTree.push(parentNodes[i])
    this.searchTree.sort((a, b) => a.leftNode - b.leftNode)
    this.tree = this.searchTree
    this._shownNodes = this.searchTree.slice()
    for (let i = 0; i < this._shownNodes.length; i++) this._shownNodes[i].shown = true
    this.shownCount = this._shownNodes.length
    this._invalidateCache()
    return this.getShownNodes()
  }

  _resetShownFlags() {
    for (let i = 0; i < this.fullTree.length; i++) this.fullTree[i].shown = false
    const cb = []
    let count = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      while (cb.length > 0 && node.leftNode >= cb[cb.length - 1]) cb.pop()
      if (cb.length === 0) {
        node.shown = true; count++
        if (node.collapsed && node.rightNode - node.leftNode > 1) cb.push(node.rightNode)
      }
    }
    return count
  }

  getSize() { return this.fullTree.length }

  clear() {
    this.fullTree.length = 0; this.searchTree.length = 0; this.tree = this.fullTree
    this.shownCount = 0; this.idToIndex.clear(); this._shownNodes.length = 0
    this._radioCheckedIdx = -1; this._selectSelectedIdx = -1; this._invalidateCache()
  }
}

export function newTree(root, lineHeight, selectType) { return new GiantTree(root, lineHeight, selectType) }
export function setTree(target, jsonStr) { target.setTree(jsonStr) }
export function setTreeFromArray(target, arr) { target.setTreeFromArray(arr) }
export function getSize(target) { return target.getSize() }
export function getShownNodes(target) { return target.getShownNodes() }
export function getShownHeight(target) { return target.getShownHeight() }
export function setBoundary(target, scrollTop, scrollHeight) { target.setBoundary(scrollTop, scrollHeight) }
export function fuzzyTree(target, keyword) { return target.fuzzySearch(keyword) }
export function checkNode(target, id, checked) { return target.checkNode(id, checked) }
export function collapseTree(target, id, isCollapse) { target.collapseTree(id, isCollapse) }
export function setCheckedNodes(target, ids) { target.setCheckedNodes(ids) }
export function clearCheckedNodes(target) { target.clearCheckedNodes() }
export function clear(target) { target.clear() }
