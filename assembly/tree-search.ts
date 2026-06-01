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
  keyword: string,
  reusableIdSet: Set<string> | null = null,
  reusableParents: MpttTree[] | null = null
): i32 {
  searchTree.splice(0)
  const idSet: Set<string> =
    reusableIdSet !== null ? (reusableIdSet as Set<string>) : new Set<string>()
  idSet.clear()
  const parentNodes: MpttTree[] =
    reusableParents !== null ? (reusableParents as MpttTree[]) : []
  parentNodes.splice(0)

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

  let searchIdx: i32 = 0
  for (let i: i32 = 0; i < fullTree.length; i++) {
    const node: MpttTree = fullTree[i]
    if (idSet.has(node.id)) continue

    while (
      searchIdx < searchTree.length &&
      searchTree[searchIdx].leftNode < node.leftNode
    ) {
      searchIdx++
    }

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

  for (let i: i32 = 0; i < parentNodes.length; i++) {
    searchTree.push(parentNodes[i])
  }

  sortByLeftNode(searchTree)

  idSet.clear()
  parentNodes.splice(0)

  return searchTree.length
}
