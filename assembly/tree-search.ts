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
  reusableParents: MpttTree[] | null = null,
  candidateIndex: Map<string, i32[]> | null = null,
  parentIndices: Int32Array | null = null
): i32 {
  searchTree.splice(0)
  const idSet: Set<string> =
    reusableIdSet !== null ? (reusableIdSet as Set<string>) : new Set<string>()
  idSet.clear()
  const parentNodes: MpttTree[] =
    reusableParents !== null ? (reusableParents as MpttTree[]) : []
  parentNodes.splice(0)
  const matchedIndices: i32[] = []

  const MAX_RESULTS: i32 = 5000
  let matchCount: i32 = 0
  let candidates: i32[] | null = null
  if (candidateIndex !== null && keyword.length > 0) {
    for (let i: i32 = 0; i < keyword.length; i++) {
      const key = keyword.charAt(i)
      if (!candidateIndex.has(key)) {
        candidates = []
        break
      }
      const bucket = candidateIndex.get(key)
      if (candidates === null || bucket.length < (candidates as i32[]).length) {
        candidates = bucket
      }
    }
  }
  const scanCount = candidates !== null ? candidates.length : fullTree.length
  for (let c: i32 = 0; c < scanCount; c++) {
    const i = candidates !== null ? candidates[c] : c
    const node: MpttTree = fullTree[i]
    if (node.name.indexOf(keyword) !== -1) {
      searchTree.push(node)
      idSet.add(node.id)
      matchedIndices.push(i)
      matchCount++
      if (matchCount >= MAX_RESULTS) break
    }
  }

  if (parentIndices !== null) {
    for (let i: i32 = 0; i < matchedIndices.length; i++) {
      let parentIndex = parentIndices[matchedIndices[i]]
      while (parentIndex >= 0) {
        const parent = fullTree[parentIndex]
        if (!idSet.has(parent.id)) {
          idSet.add(parent.id)
          parentNodes.push(parent)
        }
        parentIndex = parentIndices[parentIndex]
      }
    }
  } else {
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
  }

  for (let i: i32 = 0; i < parentNodes.length; i++) {
    searchTree.push(parentNodes[i])
  }

  sortByLeftNode(searchTree)

  idSet.clear()
  parentNodes.splice(0)

  return searchTree.length
}
