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

  // 第一遍：收集名称匹配的节点（上限 5000，避免单汉字"一"匹配全树的极端情况）
  // Pass 1: collect matched nodes (cap at 5000 to avoid worst-case single-char match)
  // Проход 1: сбор совпавших узлов (макс 5000, чтобы избежать худшего случая)
  const MAX_RESULTS: i32 = 5000
  let matchCount: i32 = 0
  for (let i: i32 = 0; i < fullTree.length; i++) {
    const node: MpttTree = fullTree[i]
    if (node.name.indexOf(keyword) !== -1) {
      searchTree.push(node)
      idSet.add(node.id)
      matchCount++
      if (matchCount >= MAX_RESULTS) break
    }
  }

  // 第二遍：收集匹配节点的祖先节点（通过 MPTT 范围判定）
  // Pass 2: collect ancestor nodes of matched nodes (via MPTT range check)
  // Проход 2: сбор узлов-предков совпавших узлов (через проверку диапазона MPTT)
  //
  // 优化：双指针法 O(N+M+K) 替代 O(N×M)
  // 由于 searchTree 和 fullTree 都按 leftNode 顺序遍历，
  // 维护一个 searchIdx 指针跳跃式前进，避免每次扫描全部 searchTree。
  //
  // Optimization: two-pointer O(N+M+K) replaces O(N×M)
  // Both searchTree and fullTree traverse in leftNode order,
  // maintain a searchIdx pointer that advances, avoiding full scan of searchTree.
  //
  // Оптимизация: двухpointerный метод O(N+M+K) вместо O(N×M)
  // searchTree и fullTree обходятся в порядке leftNode,
  // поддерживается указатель searchIdx, избегая полного сканирования searchTree.
  const parentNodes: MpttTree[] = []
  let searchIdx: i32 = 0
  for (let i: i32 = 0; i < fullTree.length; i++) {
    const node: MpttTree = fullTree[i]
    if (idSet.has(node.id)) continue

    // 推进 searchIdx 到第一个 leftNode >= node.leftNode 的结果
    // Advance searchIdx to the first result with leftNode >= node.leftNode
    // Продвинуть searchIdx к первому результату с leftNode >= node.leftNode
    while (
      searchIdx < searchTree.length &&
      searchTree[searchIdx].leftNode < node.leftNode
    ) {
      searchIdx++
    }

    // 检查 [searchIdx..) 范围内是否有节点被 node 包含
    // Check if any node in the range [searchIdx..) is contained by node
    // Проверить, содержится ли какой-либо узел в диапазоне [searchIdx..) внутри node
    let isAncestor: boolean = false
    for (let j: i32 = searchIdx; j < searchTree.length; j++) {
      const searchNode: MpttTree = searchTree[j]
      if (searchNode.leftNode >= node.rightNode) break
      if (searchNode.rightNode <= node.rightNode) {
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

  // 注意：不再修改 fullTree 节点的 shown 标志（searchTree 存储的是引用）
  // 搜索结果中的可见性由 GiantTree.fuzzySearch 直接设置 _shownNodes
  // Note: no longer modifies shown flag on fullTree nodes (searchTree stores references)
  // Visibility for search results is set by GiantTree.fuzzySearch via _shownNodes directly
  // Примечание: больше не изменяем флаг shown на узлах fullTree (searchTree хранит ссылки)
  // Видимость результатов поиска устанавливается GiantTree.fuzzySearch через _shownNodes

  return searchTree.length
}
