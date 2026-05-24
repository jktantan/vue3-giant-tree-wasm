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
 * 修复了三个 Bug:
 * 1. 不再破坏性地清除非目标节点（先清全树再设置目标）
 * 2. 使用 ancestorSet 正确去重祖先节点（替代原形同虚设的 parentIdSet）
 * 3. 通过 idToIndex 获取正确索引传入 getParentNodeCheckType
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param ids - 选中节点ID列表 / Checked node ID list / Список ID выбранных узлов
 * @param idToIndex - id→索引映射 / id→index map / Маппинг id→индекс
 */
export function setCheckedNodesInTree(
  fullTree: MpttTree[],
  ids: string[],
  idToIndex: Map<string, i32>
): void {
  // Pass 1: 将所有非禁用节点重置为 UNCHECKED
  // Pass 1: reset all non-disabled nodes to UNCHECKED
  // Проход 1: сброс всех неотключённых узлов в UNCHECKED
  for (let i = 0; i < fullTree.length; i++) {
    if (!fullTree[i].disabled) {
      fullTree[i].checked = CheckType.UNCHECKED
    }
  }

  // Pass 2: 设置目标节点 + 子树为 CHECKED，收集唯一祖先
  // Pass 2: set target nodes + subtree to CHECKED, collect unique ancestors
  // Проход 2: установка целевых узлов + поддерева в CHECKED, сбор уникальных предков
  const ancestorSet: Set<string> = new Set()
  const ancestors: MpttTree[] = []

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (!idToIndex.has(id)) continue
    const idx: i32 = idToIndex.get(id)
    const node: MpttTree = fullTree[idx]
    if (node.disabled) continue

    node.checked = CheckType.CHECKED
    setSubTreeChecked(fullTree, node, CheckType.CHECKED, idx + 1)

    // 逆序遍历收集祖先节点（使用 MPTT 范围判定），遇到已处理过的祖先则跳出
    // Backward traversal to collect ancestors (via MPTT range), break on already-seen
    // Обратный обход для сбора предков (через диапазон MPTT), останов при уже обработанном
    for (let j: i32 = idx - 1; j >= 0; j--) {
      const prev: MpttTree = fullTree[j]
      if (prev.leftNode <= node.leftNode && prev.rightNode >= node.rightNode) {
        if (ancestorSet.has(prev.id)) break
        ancestorSet.add(prev.id)
        ancestors.push(prev)
      }
    }
  }

  // 按 leftNode 降序排序（从最深祖先开始，构建自底向上的更新顺序）
  // Sort by leftNode descending (deepest first) for bottom-up ancestor update
  // Сортировка по leftNode по убыванию (сначала самый глубокий) для обновления снизу вверх
  ancestors.sort((a: MpttTree, b: MpttTree): i32 => {
    return b.leftNode - a.leftNode
  })

  // 用正确的 fullTree 索引重算每个祖先的选中状态
  // Recalculate each ancestor using its actual fullTree index
  // Пересчёт каждого предка с использованием его реального индекса в fullTree
  for (let i = 0; i < ancestors.length; i++) {
    const anc: MpttTree = ancestors[i]
    const ancIdx: i32 = idToIndex.get(anc.id)
    anc.checked = getParentNodeCheckType(fullTree, anc, ancIdx + 1)
  }

  // 清理临时集合
  // Cleanup
  // Очистка
  ancestorSet.clear()
  ancestors.splice(0)
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
 * 清除所有节点的选中状态（同时清理 checked 和 selected 字段）
 * Clears check state of all nodes (clears both checked and selected fields)
 * Сбрасывает состояние выбора всех узлов (очищает поля checked и selected)
 *
 * 修复：SELECT 模式需要清理 selected 而非 checked
 * Fix: SELECT mode requires clearing selected instead of checked
 * Исправление: режим SELECT требует очистки selected, а не checked
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 */
export function clearAllChecked(fullTree: MpttTree[]): void {
  for (let i = 0; i < fullTree.length; i++) {
    fullTree[i].checked = CheckType.UNCHECKED
    fullTree[i].selected = CheckType.UNCHECKED
  }
}
