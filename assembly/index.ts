// The entry file of your WebAssembly module.
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
  /**
   * 完整的树
   */
  fullTree: MpttTree[] = []
  /**
   * 搜索树
   */
  searchTree: MpttTree[] = []
  /**
   *  展示树
   */
  tree: MpttTree[] = this.fullTree
  /**
   * 每行高度
   */
  lineHeight: f32 = 20
  /**
   * 根节点
   */
  root: string = ''
  /**
   * 选择方式
   */
  selectType: SelectType
  /**
   * 实时滚动条位置
   */
  scrollTop: f32 = 0
  /**
   * 实时滚动条高度
   */
  scrollHeight: f32 = 0

  /**
   * 传入邻接树的json字符串，解析成预排序树
   * @param jsonTree
   */
  setNeighborTree(jsonTree: JSON.Arr): void {
    this.tmpTree.splice(0)
    // let neighborTrees: NeighborTree[] = [];
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
    // this._setPosition();
  }

  /**
   * 转换成预排序树
   * @param neighborTrees
   */
  _convertToMpttTree(neighborTrees: NeighborTree[]): void {
    const treeMap: Map<string, NeighborTree[]> = new Map()
    for (let i = 0; i < neighborTrees.length; i++) {
      const neighborTree: NeighborTree = neighborTrees[i]
      if (!treeMap.has(neighborTree.parentId)) {
        treeMap.set(neighborTree.parentId, [])
      }
      treeMap.get(neighborTree.parentId).push(neighborTree)
    }
    this._recursiveAssembly(treeMap, this.root, 0, 0)
    treeMap.clear()
    this.fullTree.sort((a: MpttTree, b: MpttTree): i32 => {
      return a.leftNode - b.leftNode
    })
  }

  /**
   * 递归转换成预排序树
   * @param treeMap
   * @param parentId
   * @param lNode
   * @param deep
   */
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
        // 如果是根节点，则显示
        if (mpttTree.parentId === this.root) {
          mpttTree.shown = true
        }
        lNode = rightNode + 1
        this.fullTree.push(mpttTree)
      }
    }
    return lNode
  }

  /**
   * 传入预排序树的json字符串，解析成预排序树
   * @param tree
   */
  setMpttTree(tree: string): void {
    const jsonTree: JSON.Arr = <JSON.Arr>JSON.parse(tree)
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
      }
      this.fullTree.push(mpttTree)
    }
    this.fullTree.sort((a: MpttTree, b: MpttTree): i32 => {
      return a.leftNode - b.leftNode
    })
    // this._setPosition();
  }

  getTmpShown(): MpttTree[] {
    const maxHeight: f32 = this.scrollTop + this.scrollHeight
    let top: f32 = 0,
      bottom: f32 = 0
    const result: MpttTree[] = []
    let index: i32 = 0
    for (let i = 0; i < this.tree.length; i++) {
      const node: MpttTree = this.tree[i]
      if (node.shown) {
        top = (index as f32) * this.lineHeight
        bottom = top + this.lineHeight - 1
        if (
          (top >= this.scrollTop && bottom <= maxHeight) ||
          (top <= this.scrollTop && bottom >= this.scrollTop) ||
          (top <= maxHeight && bottom >= maxHeight)
        ) {
          result.push(node)
        }
        if (top > maxHeight) {
          break
        }
        index += 1
      }
    }
    return result
  }

  /**
   * 将结果数组转换成json字符串
   * convert array to json string.
   * @param tree
   */
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

  /**
   * 将结果转换成json字符串
   * Convert single result to json string.
   * @param tree
   */
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

  /**
   * 展开 / 收缩指定ID的节点
   * @param id
   * @param collapsed
   */
  collapseTree(id: string, collapsed: boolean): void {
    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      if (node.id === id) {
        node.collapsed = collapsed
        this._setCollapsedShown(
          i + 1,
          node.leftNode,
          node.rightNode,
          node.deep + 1,
          !collapsed
        )
        break
      }
    }
  }
  _setCollapsedShown(
    startIndex: i32,
    leftNode: i32,
    rightNode: i32,
    deep: i32,
    shown: boolean
  ): void {
    for (let i = startIndex; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      if (node.leftNode >= leftNode && node.leftNode <= rightNode) {
        if (node.deep === deep) {
          node.shown = shown
          if (node.rightNode - node.leftNode > 1 && !node.collapsed) {
            this._setCollapsedShown(
              i + 1,
              node.leftNode,
              node.rightNode,
              deep + 1,
              shown
            )
          }
        }
      }
    }
  }

  /**
   * 展开 / 收缩所有节点
   * @param collapsed true 收缩 false 展开
   */
  collapseAll(collapsed: boolean): void {
    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      node.collapsed = collapsed
      if (node.deep > 0) {
        node.shown = !collapsed
      }
    }
  }

  /**
   * 下面两个是初始化后批量设置选择的结点
   * @param ids
   */
  setCheckedNodes(ids: string[]): void {
    const idSet: Set<string> = new Set()
    const parentNodes: MpttTree[] = []
    const parentIdSet: Set<string> = new Set()

    for (let i = 0; i < ids.length; i++) {
      idSet.add(ids[i])
    }

    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.tree[i]
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

  /**
   * check了当前节点
   * @param id
   * @param checked
   * @param scrollTop
   * @param scrollHeight
   */
  checkNode(id: string, checked: CheckType): string {
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
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        if (node.id === id) {
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
          break
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

  /**
   * 设置子树的选中状态
   * @param node
   * @param checked
   * @param startIndex
   */
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

  /**
   * 获取选中的节点（结果）
   * Get the selected node (result).
   */
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

  /**
   *
   * 清空所有选中的节点
   */
  clearCheckedNodes(): void {
    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      node.checked = CheckType.UNCHECKED
    }
  }

  /**
   * 获取当前应显示的节点
   * Get the nodes that should be displayed.
   * @param scrollTop
   * @param scrollHeight
   */
  getShownNodes(): string {
    const result: MpttTree[] = this.getTmpShown()
    return this.convertArrayToJsonString(result)
  }

  /**
   * 获取节点数量
   * Get the size of the tree.
   * @returns {number}
   */
  getSize(): i32 {
    return this.fullTree.length
  }

  /**
   * 转换要显示的树
   * @param type
   */
  switchDisplayTree(type: DisplayType): void {
    if (type === DisplayType.TREE) {
      this.tree = this.fullTree
      this.searchTree.splice(0)
    } else if (type === DisplayType.SEARCH) {
      this.tree = this.searchTree
    }
  }

  fuzzySearch(keyword: string): string {
    if (keyword === null || keyword === '') {
      this.tree = this.fullTree
      return this.convertArrayToJsonString(this.getTmpShown())
    } else {
      this.searchTree.splice(0)
      this.tree = this.searchTree
      const idSet: Set<string> = new Set()
      const tmpTree: MpttTree[] = []
      // 先搜索符合条件的
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        if (node.name.indexOf(keyword) !== -1) {
          this.searchTree.push(node)
          idSet.add(node.id)
        }
      }
      // 再把父节点搜索出来
      for (let i = 0; i < this.fullTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        if (idSet.has(node.id)) {
          continue
        }
        for (let j = 0; j < this.searchTree.length; j++) {
          const searchNode: MpttTree = this.searchTree[j]
          if (
            node.leftNode <= searchNode.leftNode &&
            node.rightNode >= searchNode.rightNode
          ) {
            idSet.add(node.id)
            tmpTree.push(node)
            break
          }
        }
      }
      // 整合
      for (let i = 0; i < tmpTree.length; i++) {
        const node: MpttTree = this.fullTree[i]
        this.searchTree.push(node)
      }
      // 排序
      this.searchTree.sort((a: MpttTree, b: MpttTree): i32 => {
        return a.leftNode - b.leftNode
      })
      this.tree = this.searchTree
      // 清空临时变量
      idSet.clear()
      tmpTree.splice(0)
      return this.convertArrayToJsonString(this.getTmpShown())
    }
  }

  setBoundary(scrollTop: f32, scrollHeight: f32): void {
    this.scrollTop = scrollTop
    this.scrollHeight = scrollHeight
  }

  getShownHeight(): f32 {
    let num: f32 = 0
    for (let i = 0; i < this.tree.length; i++) {
      const node: MpttTree = this.tree[i]
      if (node.shown) {
        num += 1
      }
    }
    return num * this.lineHeight
  }
  clear(): void {
    this.fullTree.splice(0)
    this.searchTree.splice(0)
    this.tree = this.fullTree
    this.tmpTree.splice(0)
  }

  /**
   * 以下用于创建新的树
   * @param id
   * @param name
   * @param parentId
   */
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
    }
    this.fullTree.push(mpttTree)
  }

  popMptt(): void {
    this.fullTree.sort((a: MpttTree, b: MpttTree): i32 => {
      return a.leftNode - b.leftNode
    })
  }
}

// export function add(a: i32, b: i32): i32 {
//   // let jsonTree: JSON.Arr = <JSON.Arr>(JSON.parse('[{"a":1,"b":2}]'));
//   // for (let i=0;i<jsonTree.valueOf().length;i++){
//   //     let node:JSON.Obj = <JSON.Obj>jsonTree.valueOf()[i];
//   //     console.log(`${node.getInteger("a")}`);
//   // }
//   //
//   const encoder = new JSONEncoder()
//   encoder.pushArray(null)
//   encoder.pushObject(null)
//   encoder.setInteger('a', 1)
//   encoder.setInteger('b', 2)
//   encoder.popObject()
//   encoder.popArray()
//   // console.log(encoder.toString());
//   return a + b
// }

/**
 * 生成一个新的树
 */
export function newTree(
  root: string,
  lineHeight: f32,
  selectType: SelectType
): GiantTree {
  return new GiantTree(root, lineHeight, selectType)
}

/**
 * 设置邻接树
 * @param target
 * @param tree
 */
export function setNeighborTree(target: GiantTree, tree: string): void {
  const jsonTree: JSON.Arr = <JSON.Arr>JSON.parse(tree)
  target.setNeighborTree(jsonTree)
}

/**
 * 设置预排序树
 * @param target
 * @param tree
 */
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

/**
 * 切换显示树
 * @param target
 * @param displayType
 */
export function switchDisplayTree(
  target: GiantTree,
  displayType: DisplayType
): void {
  target.switchDisplayTree(displayType)
}

/**
 * 清空树
 * @param target
 */
export function clear(target: GiantTree): void {
  target.clear()
}

/**
 * 弹出邻接节点
 * @param target
 */
// 弹出邻接节点
export function popNeighbor(target: GiantTree): void {
  target.popNeighbor()
}

/**
 * 插入邻接节点
 * @param target
 * @param id
 * @param name
 * @param parentId
 */
export function pushNeighborNode(
  target: GiantTree,
  id: string,
  name: string,
  parentId: string
): void {
  target.pushNeighborNode(id, name, parentId)
}

/**
 * 弹出预排序节点(组装好后）
 * @param target
 */
export function popMptt(target: GiantTree): void {
  target.popMptt()
}

/**
 * 插入预排序节点
 * @param target
 * @param id
 * @param name
 * @param parentId
 * @param leftNode
 * @param rightNode
 * @param deep
 */
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
