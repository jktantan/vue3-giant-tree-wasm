import { CheckType, MpttTree, SelectType } from './models'
import { serializeMpttArray, serializeMpttNode } from './tree-serializer'

/**
 * 处理节点选中/取消选中操作，根据 selectType 分派到不同逻辑
 * Handles node check/uncheck operation, dispatches to different logic based on selectType
 * Обрабатывает операцию выбора/отмены узла, направляет к разной логике в зависимости от selectType
 *
 * RADIO: 全树仅一个节点 checked / Only one node checked in tree / Только один узел выбран
 * SELECT: 全树仅一个节点 selected / Only one node selected in tree / Только один узел selected
 * CHECKBOX: 设置目标+子树，回溯更新祖先半选 / Set target+subtree, backtrack ancestors / Установить цель+поддерево, обратный проход предков
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param idToIndex - id→索引映射 / id→index map / Маппинг id→индекс
 * @param id - 目标节点ID / Target node ID / ID целевого узла
 * @param checked - 目标选中状态 / Target check state / Целевое состояние выбора
 * @param selectType - 选择模式 / Selection mode / Режим выбора
 */
export function checkNodeInTree(
  fullTree: MpttTree[],
  idToIndex: Map<string, i32>,
  id: string,
  checked: CheckType,
  selectType: SelectType
): void {
  if (selectType === SelectType.RADIO) {
    if (idToIndex.has(id) && fullTree[idToIndex.get(id)].disabled) return
    for (let i = 0; i < fullTree.length; i++) {
      fullTree[i].checked =
        fullTree[i].id !== id ? CheckType.UNCHECKED : checked
    }
  } else if (selectType === SelectType.SELECT) {
    if (idToIndex.has(id) && fullTree[idToIndex.get(id)].disabled) return
    for (let i = 0; i < fullTree.length; i++) {
      fullTree[i].selected =
        fullTree[i].id !== id ? CheckType.UNCHECKED : checked
    }
  } else {
    if (idToIndex.has(id)) {
      const i: i32 = idToIndex.get(id)
      const node: MpttTree = fullTree[i]
      if (node.disabled) return
      node.checked = checked
      setSubTreeChecked(fullTree, node, checked, i + 1)
      for (let j = i - 1; j >= 0; j--) {
        const prevNode: MpttTree = fullTree[j]
        if (
          prevNode.leftNode <= node.leftNode &&
          prevNode.rightNode >= node.rightNode
        ) {
          prevNode.checked = getParentNodeCheckType(fullTree, prevNode, j + 1)
        }
      }
    }
  }
}

/**
 * 设置子树所有节点的选中状态
 * Sets check state of all nodes in a subtree
 * Устанавливает состояние выбора всех узлов в поддереве
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param node - 父节点 / Parent node / Родительский узел
 * @param checked - 目标选中状态 / Target check state / Целевое состояние выбора
 * @param startIndex - 起始索引 / Start index / Начальный индекс
 */
export function setSubTreeChecked(
  fullTree: MpttTree[],
  node: MpttTree,
  checked: CheckType,
  startIndex: i32
): void {
  for (let i = startIndex; i < fullTree.length; i++) {
    const currentNode: MpttTree = fullTree[i]
    if (
      currentNode.leftNode >= node.leftNode &&
      currentNode.rightNode <= node.rightNode
    ) {
      if (!currentNode.disabled) {
        currentNode.checked = checked
      }
    } else {
      break
    }
  }
}

/**
 * 计算父节点的选中状态：全选→CHECKED，全不选→UNCHECKED，部分→HALF_CHECKED
 * Calculates parent check state: all→CHECKED, none→UNCHECKED, partial→HALF_CHECKED
 * Вычисляет состояние родителя: все→CHECKED, ничего→UNCHECKED, частично→HALF_CHECKED
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param node - 父节点 / Parent node / Родительский узел
 * @param startIndex - 子节点起始索引 / Children start index / Начальный индекс дочерних
 * @returns 计算后的选中状态 / Calculated check state / Вычисленное состояние выбора
 */
export function getParentNodeCheckType(
  fullTree: MpttTree[],
  node: MpttTree,
  startIndex: i32
): CheckType {
  let checkedNum: i32 = 0
  let unCheckedNum: i32 = 0
  let halfCheckedNum: i32 = 0
  for (let i = startIndex; i < fullTree.length; i++) {
    const currentNode: MpttTree = fullTree[i]
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
 * 收集指定节点的所有祖先节点
 * Collects all ancestor nodes of a given node
 * Собирает все узлы-предки указанного узла
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param node - 目标节点 / Target node / Целевой узел
 * @param startIndex - 向前搜索起始索引 / Backward search start index / Начальный индекс обратного поиска
 * @param parentNodes - 输出祖先数组 / Output ancestor array / Массив предков для вывода
 * @param parentIdSet - 去重集合 / Dedup set / Набор для дедупликации
 */
export function collectParentNodes(
  fullTree: MpttTree[],
  node: MpttTree,
  startIndex: i32,
  parentNodes: MpttTree[],
  parentIdSet: Set<string>
): void {
  for (let i = startIndex; i >= 0; i--) {
    const currentNode: MpttTree = fullTree[i]
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

/**
 * 批量设置多个节点选中（CHECKBOX 模式），并更新祖先
 * Batch-sets check state for multiple nodes (CHECKBOX mode), updating ancestors
 * Пакетная установка выбора для нескольких узлов (CHECKBOX), обновление предков
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param ids - 选中节点ID列表 / Checked node ID list / Список ID выбранных узлов
 */
export function setCheckedNodesInTree(
  fullTree: MpttTree[],
  ids: string[]
): void {
  const idSet: Set<string> = new Set()
  const parentNodes: MpttTree[] = []
  const parentIdSet: Set<string> = new Set()

  for (let i = 0; i < ids.length; i++) {
    idSet.add(ids[i])
  }
  for (let i = 0; i < fullTree.length; i++) {
    const node: MpttTree = fullTree[i]
    if (idSet.has(node.id) && !node.disabled) {
      node.checked = CheckType.CHECKED
      collectParentNodes(fullTree, node, i - 1, parentNodes, parentIdSet)
    } else if (!node.disabled) {
      node.checked = CheckType.UNCHECKED
    }
  }
  parentNodes.sort((a: MpttTree, b: MpttTree) => {
    return b.leftNode - a.leftNode
  })
  for (let i = 0; i < parentNodes.length; i++) {
    parentNodes[i].checked = getParentNodeCheckType(
      fullTree,
      parentNodes[i],
      i + 1
    )
  }
}

/**
 * 设置单个节点选中（RADIO/SELECT 简化版本）
 * Sets single node checked (simplified RADIO/SELECT version)
 * Устанавливает один узел выбранным (упрощённая версия RADIO/SELECT)
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param id - 目标节点ID / Target node ID / ID целевого узла
 * @param selectType - 选择模式 / Selection mode / Режим выбора
 */
export function setCheckedNodeInTree(
  fullTree: MpttTree[],
  id: string,
  selectType: SelectType
): void {
  if (selectType === SelectType.RADIO) {
    let targetDisabled = false
    for (let i = 0; i < fullTree.length; i++) {
      if (fullTree[i].id === id && fullTree[i].disabled) {
        targetDisabled = true
        break
      }
    }
    if (targetDisabled) return
    for (let i = 0; i < fullTree.length; i++) {
      fullTree[i].checked =
        fullTree[i].id !== id ? CheckType.UNCHECKED : CheckType.CHECKED
    }
  } else if (selectType === SelectType.SELECT) {
    let targetDisabled = false
    for (let i = 0; i < fullTree.length; i++) {
      if (fullTree[i].id === id && fullTree[i].disabled) {
        targetDisabled = true
        break
      }
    }
    if (targetDisabled) return
    for (let i = 0; i < fullTree.length; i++) {
      fullTree[i].selected =
        fullTree[i].id !== id ? CheckType.UNCHECKED : CheckType.CHECKED
    }
  }
}

/**
 * 获取所有已选中节点的 JSON 字符串
 * Gets JSON string of all checked nodes
 * Получает строку JSON всех выбранных узлов
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param selectType - 选择模式 / Selection mode / Режим выбора
 * @returns JSON 字符串 / JSON string / Строка JSON
 */
export function getCheckedNodesFromTree(
  fullTree: MpttTree[],
  selectType: SelectType
): string {
  if (selectType === SelectType.RADIO) {
    for (let i = 0; i < fullTree.length; i++) {
      if (fullTree[i].checked === CheckType.CHECKED) {
        return serializeMpttNode(fullTree[i])
      }
    }
  } else if (selectType === SelectType.SELECT) {
    for (let i = 0; i < fullTree.length; i++) {
      if (fullTree[i].selected === CheckType.CHECKED) {
        return serializeMpttNode(fullTree[i])
      }
    }
  } else {
    const tree: MpttTree[] = []
    for (let i = 0; i < fullTree.length; i++) {
      if (fullTree[i].checked === CheckType.CHECKED) {
        tree.push(fullTree[i])
      }
    }
    return serializeMpttArray(tree)
  }
  return ''
}

/**
 * 清除所有节点的选中状态
 * Clears check state of all nodes
 * Сбрасывает состояние выбора всех узлов
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 */
export function clearAllChecked(fullTree: MpttTree[]): void {
  for (let i = 0; i < fullTree.length; i++) {
    fullTree[i].checked = CheckType.UNCHECKED
  }
}
