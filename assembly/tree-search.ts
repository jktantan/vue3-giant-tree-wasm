import { MpttTree } from './models'
import { sortByLeftNode } from './tree-builder'

/**
 * 模糊搜索：按关键词匹配节点名称，并自动补全所有匹配节点的祖先链
 * Fuzzy search: matches node names by keyword, automatically completes ancestor chains of all matched nodes
 * Нечёткий поиск: сопоставление имён узлов по ключевому слову, автоматическое дополнение цепочек предков всех совпавших узлов
 *
 * 搜索结果存储在 searchTree 中，所有结果节点的 shown 设为 true。
 * 祖先节点通过 MPTT 范围 (leftNode/rightNode) 判定，避免递归查找。
 *
 * Results are stored in searchTree, all result nodes' shown is set to true.
 * Ancestor nodes are determined via MPTT range (leftNode/rightNode), avoiding recursive lookup.
 *
 * Результаты хранятся в searchTree, shown всех результатов устанавливается в true.
 * Узлы-предки определяются через диапазон MPTT (leftNode/rightNode), избегая рекурсивного поиска.
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param searchTree - 搜索结果数组（将被清空后重新填充） / Search result array (will be cleared and refilled) / Массив результатов поиска (будет очищен и перезаполнен)
 * @param keyword - 搜索关键词 / Search keyword / Ключевое слово поиска
 * @returns 搜索结果中的可见节点总数 / Total visible node count in search results / Общее количество видимых узлов в результатах поиска
 */
export function fuzzySearchTree(
  fullTree: MpttTree[],
  searchTree: MpttTree[],
  keyword: string
): i32 {
  searchTree.splice(0)
  const idSet: Set<string> = new Set()

  // 第一遍：收集名称匹配的节点
  // Pass 1: collect nodes whose names match the keyword
  // Проход 1: сбор узлов, имена которых совпадают с ключевым словом
  for (let i: i32 = 0; i < fullTree.length; i++) {
    const node: MpttTree = fullTree[i]
    if (node.name.indexOf(keyword) !== -1) {
      searchTree.push(node)
      idSet.add(node.id)
    }
  }

  // 第二遍：收集匹配节点的祖先节点（通过 MPTT 范围判定）
  // Pass 2: collect ancestor nodes of matched nodes (via MPTT range check)
  // Проход 2: сбор узлов-предков совпавших узлов (через проверку диапазона MPTT)
  const parentNodes: MpttTree[] = []
  for (let i: i32 = 0; i < fullTree.length; i++) {
    const node: MpttTree = fullTree[i]
    if (idSet.has(node.id)) continue

    // 检查该节点是否是任何搜索结果节点的祖先
    // Check if this node is an ancestor of any search result node
    // Проверить, является ли этот узел предком любого узла результатов поиска
    let isAncestor: boolean = false
    for (let j: i32 = 0; j < searchTree.length; j++) {
      const searchNode: MpttTree = searchTree[j]
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

  // 将祖先节点合并到搜索结果中
  // Merge ancestor nodes into search results
  // Объединить узлы-предки с результатами поиска
  for (let i: i32 = 0; i < parentNodes.length; i++) {
    searchTree.push(parentNodes[i])
  }

  // 按 leftNode 排序，保持树的遍历顺序
  // Sort by leftNode to maintain tree traversal order
  // Сортировка по leftNode для сохранения порядка обхода дерева
  sortByLeftNode(searchTree)

  // 清理临时数据
  // Clean up temporary data
  // Очистка временных данных
  idSet.clear()
  parentNodes.splice(0)

  // 设置所有搜索结果节点为可见
  // Set all search result nodes as visible
  // Установить все узлы результатов поиска как видимые
  for (let i: i32 = 0; i < searchTree.length; i++) {
    searchTree[i].shown = true
  }

  return searchTree.length
}
