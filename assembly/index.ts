import { CheckType, MpttTree, NeighborTree } from './models'
import { JSON, JSONEncoder } from 'assemblyscript-json/assembly/index'

export { CheckType } from './models'

export enum SelectType {
  CHECKBOX,
  RADIO,
  SELECT,
}

export enum DisplayType {
  TREE,
  SEARCH,
}

class GiantTree {
  constructor(root: string, lineHeight: f32, selectType: SelectType) {
    this.root = root
    this.lineHeight = lineHeight
    this.selectType = selectType
  }

  tmpTree: NeighborTree[] = []
  fullTree: MpttTree[] = []
  searchTree: MpttTree[] = []
  tree: MpttTree[] = this.fullTree
  lineHeight: f32 = 20
  root: string = ''
  selectType: SelectType
  scrollTop: f32 = 0
  scrollHeight: f32 = 0

  // #1 shownCount 计数器
  shownCount: i32 = 0

  // #2 shownNodes 有序数组（仅 shown===true 的节点）
  _shownNodes: MpttTree[] = []

  // #3 idToIndex 映射
  idToIndex: Map<string, i32> = new Map()

  // #7 JSON 序列化缓存
  _cachedStartIdx: i32 = -1
  _cachedEndIdx: i32 = -1
  _cachedJson: string = ''
  _cacheValid: boolean = false

  _invalidateCache(): void {
    this._cacheValid = false
  }

  // #3 构建 id→index 映射
  _buildIdIndex(): void {
    this.idToIndex.clear()
    for (let i: i32 = 0; i < this.fullTree.length; i++) {
      this.idToIndex.set(this.fullTree[i].id, i)
    }
  }

  // #2 重建 shownNodes 数组
  _rebuildShownNodes(): void {
    this._shownNodes.splice(0)
    for (let i: i32 = 0; i < this.tree.length; i++) {
      if (this.tree[i].shown) {
        this._shownNodes.push(this.tree[i])
      }
    }
    this._invalidateCache()
  }

  setNeighborTree(jsonTree: JSON.Arr): void {
    this.tmpTree.splice(0)
    for (let i = 0; i < jsonTree.valueOf().length; i++) {
      const node: JSON.Obj = <JSON.Obj>jsonTree.valueOf()[i]
      const neighborTree: NeighborTree = new NeighborTree()
      const id: JSON.Str = <JSON.Str>node.get('id')
      if (id !== null) {
        neighborTree.id = id.toString()
      }
      const name: JSON.Str = <JSON.Str>node.get('name')
      if (name !== null) {
        neighborTree.name = name.toString()
      }
      const parentId: JSON.Str = <JSON.Str>node.get('parentId')
      if (parentId !== null) {
        neighborTree.parentId = parentId.toString()
      }
      this.tmpTree.push(neighborTree)
    }
    this._convertToMpttTree(this.tmpTree)
    this.tmpTree.splice(0)
  }

  _convertToMpttTree(neighborTrees: NeighborTree[]): void {
    const treeMap: Map<string, NeighborTree[]> = new Map()
    for (let i = 0; i < neighborTrees.length; i++) {
      const neighborTree: NeighborTree = neighborTrees[i]
      if (!treeMap.has(neighborTree.parentId)) {
        treeMap.set(neighborTree.parentId, [])
      }
      treeMap.get(neighborTree.parentId).push(neighborTree)
    }
    this.shownCount = 0
    this._recursiveAssembly(treeMap, this.root, 0, 0)
    treeMap.clear()
    this.fullTree.sort((a: MpttTree, b: MpttTree): i32 => {
      return a.leftNode - b.leftNode
    })
    this._buildIdIndex()
    this._rebuildShownNodes()
  }

  _recursiveAssembly(
    treeMap: Map<string, NeighborTree[]>,
    parentId: string,
    lNode: i32,
    deep: i32
  ): i32 {
    if (treeMap.has(parentId)) {
      const filterDatas = treeMap.get(parentId)
      const currentDeep: i32 = deep
      for (let i = 0; i < filterDatas.length; i++) {
        const neighborTree: NeighborTree = filterDatas[i]
        const mpttTree: MpttTree = new MpttTree()
        mpttTree.id = neighborTree.id
        mpttTree.name = neighborTree.name
        mpttTree.parentId = neighborTree.parentId
        mpttTree.leftNode = lNode
        mpttTree.deep = currentDeep

        const rightNode: i32 = this._recursiveAssembly(
          treeMap,
          mpttTree.id,
          lNode + 1,
          currentDeep + 1
        )

        mpttTree.rightNode = rightNode
        if (mpttTree.parentId === this.root) {
          mpttTree.shown = true
          this.shownCount++
        }
        lNode = rightNode + 1
        this.fullTree.push(mpttTree)
      }
    }
    return lNode
  }

  setMpttTree(tree: string): void {
    const jsonTree: JSON.Arr = <JSON.Arr>JSON.parse(tree)
    this.shownCount = 0
    for (let i = 0; i < jsonTree.valueOf().length; i++) {
      const node: JSON.Obj = <JSON.Obj>jsonTree.valueOf()[i]
      const mpttTree: MpttTree = new MpttTree()
      const id: JSON.Str = <JSON.Str>node.get('id')
      if (id !== null) {
        mpttTree.id = id.toString()
      }
      const name: JSON.Str = <JSON.Str>node.get('name')
      if (name !== null) {
        mpttTree.name = name.toString()
      }
      const parentId: JSON.Str = <JSON.Str>node.get('parentId')
      if (parentId !== null) {
        mpttTree.parentId = parentId.toString()
      }

      const leftNode: JSON.Integer = <JSON.Integer>node.get('leftNode')
      if (leftNode !== null) {
        mpttTree.leftNode = leftNode.valueOf() as i32
      }
      const rightNode: JSON.Integer = <JSON.Integer>node.get('rightNode')
      if (rightNode !== null) {
        mpttTree.rightNode = rightNode.valueOf() as i32
      }
      const deep: JSON.Integer = <JSON.Integer>node.get('deep')
      if (deep !== null) {
        mpttTree.deep = deep.valueOf() as i32
      }
      if (mpttTree.parentId === this.root) {
        mpttTree.shown = true
        this.shownCount++
      }
      this.fullTree.push(mpttTree)
    }
    this.fullTree.sort((a: MpttTree, b: MpttTree): i32 => {
      return a.leftNode - b.leftNode
    })
    this._buildIdIndex()
    this._rebuildShownNodes()
  }

  // #2 优化后的 getTmpShown：索引直跳 O(k)
  getTmpShown(): MpttTree[] {
    const startIdx: i32 = <i32>Math.floor(this.scrollTop / this.lineHeight)
    const endIdx: i32 =
      <i32>Math.ceil((this.scrollTop + this.scrollHeight) / this.lineHeight) + 1
    const clampedStart: i32 =
      startIdx < 0
        ? 0
        : startIdx >= this._shownNodes.length
          ? this._shownNodes.length
          : startIdx
    const clampedEnd: i32 =
      endIdx < 0
        ? 0
        : endIdx > this._shownNodes.length
          ? this._shownNodes.length
          : endIdx

    const result: MpttTree[] = []
    for (let i: i32 = clampedStart; i < clampedEnd; i++) {
      result.push(this._shownNodes[i])
    }
    return result
  }

  convertArrayToJsonString(tree: MpttTree[]): string {
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

  convertToJsonString(tree: MpttTree): string {
    const encoder = new JSONEncoder()
    encoder.pushObject(null)
    encoder.setString('id', tree.id)
    encoder.setString('name', tree.name)
    encoder.setString('parentId', tree.parentId)
    encoder.setInteger('leftNode', tree.leftNode)
    encoder.setInteger('rightNode', tree.rightNode)
    encoder.setInteger('deep', tree.deep)
    encoder.setInteger('checked', tree.checked)
    encoder.setInteger('selected', tree.selected)
    encoder.setBoolean('collapsed', tree.collapsed)
    encoder.popObject()
    return encoder.toString()
  }

  // #3 + #4 优化后的 collapseTree：O(1) id 查找 + 非递归展开
  collapseTree(id: string, collapsed: boolean): void {
    if (!this.idToIndex.has(id)) return
    const i: i32 = this.idToIndex.get(id)
    const node: MpttTree = this.fullTree[i]
    node.collapsed = collapsed
    this._setCollapsedShown(i + 1, node.leftNode, node.rightNode, !collapsed)
    this._rebuildShownNodes()
  }

  // #4 优化后：非递归，单次遍历 + 栈跟踪折叠状态
  _setCollapsedShown(
    startIndex: i32,
    parentLeftNode: i32,
    parentRightNode: i32,
    shown: boolean
  ): void {
    const collapsedBoundaries: i32[] = []

    for (let i: i32 = startIndex; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      if (node.leftNode >= parentRightNode) break

      while (
        collapsedBoundaries.length > 0 &&
        node.leftNode >= collapsedBoundaries[collapsedBoundaries.length - 1]
      ) {
        collapsedBoundaries.pop()
      }

      if (collapsedBoundaries.length > 0) {
        if (!shown) {
          if (node.shown) {
            node.shown = false
            this.shownCount--
          }
        }
      } else {
        const prevShown: boolean = node.shown
        node.shown = shown
        if (shown && !prevShown) this.shownCount++
        if (!shown && prevShown) this.shownCount--

        if (shown && node.collapsed && node.rightNode - node.leftNode > 1) {
          collapsedBoundaries.push(node.rightNode)
        }
      }
    }
  }

  collapseAll(collapsed: boolean): void {
    this.shownCount = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      node.collapsed = collapsed
      if (node.deep > 0) {
        node.shown = !collapsed
      }
      if (node.shown) this.shownCount++
    }
    this._rebuildShownNodes()
  }

  // #6 修复：this.tree[i] → this.fullTree[i]
  setCheckedNodes(ids: string[]): void {
    const idSet: Set<string> = new Set()
    const parentNodes: MpttTree[] = []
    const parentIdSet: Set<string> = new Set()

    for (let i = 0; i < ids.length; i++) {
      idSet.add(ids[i])
    }

    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      if (idSet.has(node.id)) {
        node.checked = CheckType.CHECKED
        this._getParentNodes(node, i - 1, parentNodes, parentIdSet)
      } else {
        node.checked = CheckType.UNCHECKED
      }
    }
    parentNodes.sort((a: MpttTree, b: MpttTree) => {
      return b.leftNode - a.leftNode
    })
    for (let i = 0; i < parentNodes.length; i++) {
      const node: MpttTree = parentNodes[i]
      node.checked = this._getParentNodeCheckType(node, i + 1)
    }
  }

  setCheckedNode(id: string): void {
    if (this.selectType === SelectType.RADIO) {
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        node.checked = node.id !== id ? CheckType.UNCHECKED : CheckType.CHECKED
      }
    } else if (this.selectType === SelectType.SELECT) {
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        node.selected = node.id !== id ? CheckType.UNCHECKED : CheckType.CHECKED
      }
    }
  }

  // #3 优化：CHECKBOX 分支使用 idToIndex 直接跳转
  checkNode(id: string, checked: CheckType): string {
    this._invalidateCache()
    const result: MpttTree[] = this.getTmpShown()
    if (this.selectType === SelectType.RADIO) {
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        node.checked = node.id !== id ? CheckType.UNCHECKED : checked
      }
    } else if (this.selectType === SelectType.SELECT) {
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        node.selected = node.id !== id ? CheckType.UNCHECKED : checked
      }
    } else {
      if (this.idToIndex.has(id)) {
        const i: i32 = this.idToIndex.get(id)
        const node: MpttTree = this.fullTree[i]
        node.checked = checked
        this._setSubTreeChecked(node, checked, i + 1)

        for (let j = i - 1; j >= 0; j--) {
          const prevNode: MpttTree = this.fullTree[j]
          if (
            prevNode.leftNode <= node.leftNode &&
            prevNode.rightNode >= node.rightNode
          ) {
            prevNode.checked = this._getParentNodeCheckType(prevNode, j + 1)
          }
        }
      }
    }
    return this.convertArrayToJsonString(result)
  }

  _getParentNodes(
    node: MpttTree,
    startIndex: i32,
    parentNodes: MpttTree[],
    parentIdSet: Set<string>
  ): void {
    for (let i = startIndex; i >= 0; i--) {
      const currentNode: MpttTree = this.fullTree[i]
      if (
        currentNode.leftNode <= node.leftNode &&
        currentNode.rightNode >= node.rightNode
      ) {
        if (parentIdSet.has(currentNode.id)) {
          break
        }
        parentNodes.push(currentNode)
        parentIdSet.delete(currentNode.id)
      }
    }
  }

  _getParentNodeCheckType(node: MpttTree, startIndex: i32): CheckType {
    let checkedNum: i32 = 0
    let unCheckedNum: i32 = 0
    let halfCheckedNum: i32 = 0
    for (let i = startIndex; i < this.fullTree.length; i++) {
      const currentNode: MpttTree = this.fullTree[i]
      if (
        currentNode.leftNode >= node.leftNode &&
        currentNode.rightNode <= node.rightNode
      ) {
        if (currentNode.deep === node.deep + 1) {
          if (currentNode.checked === CheckType.CHECKED) {
            checkedNum += 1
          } else if (currentNode.checked === CheckType.HALF_CHECKED) {
            halfCheckedNum += 1
          } else {
            unCheckedNum += 1
          }
        }
      } else {
        break
      }
    }
    if (unCheckedNum === 0 && halfCheckedNum === 0 && checkedNum > 0) {
      return CheckType.CHECKED
    } else if ((unCheckedNum > 0 && checkedNum > 0) || halfCheckedNum > 0) {
      return CheckType.HALF_CHECKED
    } else {
      return CheckType.UNCHECKED
    }
  }

  _setSubTreeChecked(
    node: MpttTree,
    checked: CheckType,
    startIndex: i32
  ): void {
    for (let i = startIndex; i < this.fullTree.length; i++) {
      const currentNode: MpttTree = this.fullTree[i]
      if (
        currentNode.leftNode >= node.leftNode &&
        currentNode.rightNode <= node.rightNode
      ) {
        currentNode.checked = checked
      } else {
        break
      }
    }
  }

  getCheckedNodes(): string {
    if (this.selectType === SelectType.RADIO) {
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        if (node.checked === CheckType.CHECKED) {
          return this.convertToJsonString(node)
        }
      }
    } else if (this.selectType === SelectType.SELECT) {
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        if (node.selected === CheckType.CHECKED) {
          return this.convertToJsonString(node)
        }
      }
    } else {
      const tree: MpttTree[] = []
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        if (node.checked === CheckType.CHECKED) {
          tree.push(node)
        }
      }
      return this.convertArrayToJsonString(tree)
    }
    return ''
  }

  clearCheckedNodes(): void {
    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      node.checked = CheckType.UNCHECKED
    }
  }

  // #7 JSON 序列化缓存
  getShownNodes(): string {
    const startIdx: i32 = <i32>Math.floor(this.scrollTop / this.lineHeight)
    const endIdx: i32 =
      <i32>Math.ceil((this.scrollTop + this.scrollHeight) / this.lineHeight) + 1

    if (
      this._cacheValid &&
      startIdx === this._cachedStartIdx &&
      endIdx === this._cachedEndIdx
    ) {
      return this._cachedJson
    }

    const result: MpttTree[] = this.getTmpShown()
    const json: string = this.convertArrayToJsonString(result)

    this._cachedStartIdx = startIdx
    this._cachedEndIdx = endIdx
    this._cachedJson = json
    this._cacheValid = true

    return json
  }

  getSize(): i32 {
    return this.fullTree.length
  }

  switchDisplayTree(type: DisplayType): void {
    if (type === DisplayType.TREE) {
      this.tree = this.fullTree
      this.searchTree.splice(0)
    } else if (type === DisplayType.SEARCH) {
      this.tree = this.searchTree
    }
    this._recalcShownCount()
    this._rebuildShownNodes()
  }

  // #5 优化后的 fuzzySearch：修复 bug + O(n) 单次遍历父节点查找
  fuzzySearch(keyword: string): string {
    if (keyword === null || keyword === '') {
      this.tree = this.fullTree
      this._recalcShownCount()
      this._rebuildShownNodes()
      return this.convertArrayToJsonString(this.getTmpShown())
    } else {
      this.searchTree.splice(0)
      this.tree = this.searchTree
      const idSet: Set<string> = new Set()

      for (let i: i32 = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        if (node.name.indexOf(keyword) !== -1) {
          this.searchTree.push(node)
          idSet.add(node.id)
        }
      }

      const parentNodes: MpttTree[] = []
      for (let i: i32 = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        if (idSet.has(node.id)) continue

        let isAncestor: boolean = false
        for (let j: i32 = 0; j < this.searchTree.length; j++) {
          const searchNode: MpttTree = this.searchTree[j]
          if (
            node.leftNode <= searchNode.leftNode &&
            node.rightNode >= searchNode.rightNode
          ) {
            isAncestor = true
            break
          }
        }
        if (isAncestor) {
          idSet.add(node.id)
          parentNodes.push(node)
        }
      }

      // #5 修复 bug：使用 parentNodes[i] 而非错误的 this.fullTree[i]
      for (let i: i32 = 0; i < parentNodes.length; i++) {
        this.searchTree.push(parentNodes[i])
      }

      this.searchTree.sort((a: MpttTree, b: MpttTree): i32 => {
        return a.leftNode - b.leftNode
      })
      this.tree = this.searchTree

      idSet.clear()
      parentNodes.splice(0)

      this.shownCount = this.searchTree.length
      for (let i: i32 = 0; i < this.searchTree.length; i++) {
        this.searchTree[i].shown = true
      }
      this._rebuildShownNodes()

      return this.convertArrayToJsonString(this.getTmpShown())
    }
  }

  setBoundary(scrollTop: f32, scrollHeight: f32): void {
    this.scrollTop = scrollTop
    this.scrollHeight = scrollHeight
  }

  // #1 优化后的 getShownHeight：O(1)
  getShownHeight(): f32 {
    return (this.shownCount as f32) * this.lineHeight
  }

  _recalcShownCount(): void {
    this.shownCount = 0
    for (let i: i32 = 0; i < this.tree.length; i++) {
      if (this.tree[i].shown) this.shownCount++
    }
  }

  clear(): void {
    this.fullTree.splice(0)
    this.searchTree.splice(0)
    this.tree = this.fullTree
    this.tmpTree.splice(0)
    this.shownCount = 0
    this.idToIndex.clear()
    this._shownNodes.splice(0)
    this._invalidateCache()
  }

  pushNeighborNode(id: string, name: string, parentId: string): void {
    const neighborTree: NeighborTree = new NeighborTree()
    neighborTree.id = id
    neighborTree.name = name
    neighborTree.parentId = parentId
    this.tmpTree.push(neighborTree)
  }

  popNeighbor(): void {
    this._convertToMpttTree(this.tmpTree)
    this.tmpTree.splice(0)
  }

  pushMpttNode(
    id: string,
    name: string,
    parentId: string,
    leftNode: i32,
    rightNode: i32,
    deep: i32
  ): void {
    const mpttTree: MpttTree = new MpttTree()
    mpttTree.id = id
    mpttTree.name = name
    mpttTree.parentId = parentId
    mpttTree.leftNode = leftNode
    mpttTree.rightNode = rightNode
    mpttTree.deep = deep
    if (mpttTree.deep === 0) {
      mpttTree.shown = true
      this.shownCount++
    }
    this.fullTree.push(mpttTree)
  }

  popMptt(): void {
    this.fullTree.sort((a: MpttTree, b: MpttTree): i32 => {
      return a.leftNode - b.leftNode
    })
    this._buildIdIndex()
    this._rebuildShownNodes()
  }
}

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
  parentId: string
): void {
  target.pushNeighborNode(id, name, parentId)
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
