import { MpttTree, NeighborTree } from './models'
import { JSON } from 'assemblyscript-json/assembly/index'

/**
 * 从 JSON 数组解析邻接表节点列表
 * Parses adjacency list nodes from a JSON array
 * Разбирает узлы списка смежности из массива JSON
 *
 * @param jsonTree - assemblyscript-json 解析后的 JSON 数组 / Parsed JSON array / Разобранный массив JSON
 * @returns 邻接表节点数组 / Array of adjacency list nodes / Массив узлов списка смежности
 */
export function parseNeighborTreeFromJson(jsonTree: JSON.Arr): NeighborTree[] {
  const result: NeighborTree[] = []
  for (let i = 0; i < jsonTree.valueOf().length; i++) {
    const node: JSON.Obj = <JSON.Obj>jsonTree.valueOf()[i]
    const neighborTree: NeighborTree = new NeighborTree()
    // 使用安全 getter 替代强制转型，避免缺少字段时 null 转型失败
    // Use safe getters instead of forceful casts to avoid null cast failure on missing fields
    // Использование безопасных геттеров вместо принудительного приведения для избежания ошибок при отсутствии полей
    const id: JSON.Str | null = node.getString('id')
    if (id !== null) neighborTree.id = id.toString()
    const name: JSON.Str | null = node.getString('name')
    if (name !== null) neighborTree.name = name.toString()
    const parentId: JSON.Str | null = node.getString('parentId')
    if (parentId !== null) neighborTree.parentId = parentId.toString()
    const disabled: JSON.Bool | null = node.getBool('disabled')
    if (disabled !== null) neighborTree.disabled = disabled.valueOf()
    result.push(neighborTree)
  }
  return result
}

/**
 * 将邻接表结构转换为 MPTT 树结构，结果追加到 fullTree 数组
 * Converts adjacency list structure to MPTT tree, appending results to fullTree array
 * Преобразует структуру списка смежности в дерево MPTT, добавляя результаты в массив fullTree
 *
 * 步骤：1) 按 parentId 分组  2) 递归装配 MPTT 编号  3) 按 leftNode 排序
 * Steps: 1) Group by parentId  2) Recursively assign MPTT numbers  3) Sort by leftNode
 * Шаги: 1) Группировка по parentId  2) Рекурсивное назначение номеров MPTT  3) Сортировка по leftNode
 *
 * @param neighborTrees - 邻接表节点数组 / Adjacency list nodes / Узлы списка смежности
 * @param root - 根节点标识，顶层节点的 parentId 等于此值 / Root ID, top-level parentId equals this / ID корня, parentId верхнего уровня равен этому
 * @param fullTree - 输出数组 / Output array / Массив для вывода
 * @returns 初始可见节点计数（仅顶层） / Initially visible node count (top-level only) / Количество изначально видимых узлов (только верхний уровень)
 */
export function convertNeighborToMptt(
  neighborTrees: NeighborTree[],
  root: string,
  fullTree: MpttTree[]
): i32 {
  // 按 parentId 分组建立子节点映射
  // Group children by parentId into a lookup map
  // Группировка дочерних узлов по parentId в маппинг
  const treeMap: Map<string, NeighborTree[]> = new Map()
  for (let i = 0; i < neighborTrees.length; i++) {
    const nt: NeighborTree = neighborTrees[i]
    if (!treeMap.has(nt.parentId)) {
      treeMap.set(nt.parentId, [])
    }
    treeMap.get(nt.parentId).push(nt)
  }

  // shownCount 通过数组引用传递（AssemblyScript 无 ref/out 参数）
  // shownCount passed via array reference (AssemblyScript has no ref/out params)
  // shownCount передаётся через ссылку на массив (AssemblyScript не имеет ref/out параметров)
  const shownCountRef: i32[] = [0]
  // 前序 push 已保证 fullTree 按 leftNode 升序，无需排序
  // Preorder push guarantees fullTree is in leftNode ascending order, no sort needed
  // Пре-порядок push гарантирует порядок fullTree по leftNode, сортировка не требуется
  _recursiveAssembly(treeMap, root, 0, 0, root, fullTree, shownCountRef)
  treeMap.clear()
  return shownCountRef[0]
}

/**
 * 递归装配 MPTT 编号：深度优先遍历，为每个节点分配 leftNode / rightNode
 * Recursively assigns MPTT numbers via DFS, setting leftNode / rightNode for each node
 * Рекурсивно назначает номера MPTT через обход в глубину, устанавливая leftNode / rightNode для каждого узла
 *
 * 返回值为下一个可用的 leftNode 编号，用于父节点计算 rightNode。
 * 同时通过 shownCountRef 累加顶层可见节点数。
 *
 * Returns the next available leftNode number, used by parent to calculate rightNode.
 * Also accumulates top-level visible node count via shownCountRef.
 *
 * Возвращает следующий доступный номер leftNode для вычисления rightNode родителя.
 * Также накапливает количество видимых узлов верхнего уровня через shownCountRef.
 *
 * @param treeMap - parentId → 子节点列表映射 / parentId → children mapping / Маппинг parentId → дочерние
 * @param parentId - 当前父节点ID / Current parent ID / Текущий ID родителя
 * @param lNode - 当前左节点编号 / Current left node number / Текущий номер левого узла
 * @param deep - 当前深度 / Current depth / Текущая глубина
 * @param root - 树根标识 / Tree root identifier / Идентификатор корня дерева
 * @param fullTree - 输出数组 / Output array / Массив для вывода
 * @param shownCountRef - 可见节点计数引用 / Shown count reference / Ссылка на счётчик видимых узлов
 * @returns 下一个可用的 leftNode 编号 / Next available leftNode number / Следующий доступный номер leftNode
 */
function _recursiveAssembly(
  treeMap: Map<string, NeighborTree[]>,
  parentId: string,
  lNode: i32,
  deep: i32,
  root: string,
  fullTree: MpttTree[],
  shownCountRef: i32[]
): i32 {
  if (treeMap.has(parentId)) {
    const children = treeMap.get(parentId)
    const currentDeep: i32 = deep
    for (let i = 0; i < children.length; i++) {
      const nt: NeighborTree = children[i]
      const mptt: MpttTree = new MpttTree()
      mptt.id = nt.id
      mptt.name = nt.name
      mptt.parentId = nt.parentId
      mptt.disabled = nt.disabled
      mptt.leftNode = lNode
      mptt.deep = currentDeep

      // 前序 push：在递归子节点之前推入数组（使 push 顺序 = leftNode 升序，无需后续排序）
      // Preorder push: push before recursing children (push order = leftNode asc, no sort needed)
      // Пре-порядок push: помещаем в массив до рекурсии потомков (порядок push = порядок leftNode)
      fullTree.push(mptt)

      // 递归处理子节点，返回值为子树消耗后的下一个可用编号
      // Recurse into children; return value is the next number after subtree
      // Рекурсия в дочерние; возвращаемое значение — следующий номер после поддерева
      const rightNode: i32 = _recursiveAssembly(
        treeMap,
        mptt.id,
        lNode + 1,
        currentDeep + 1,
        root,
        fullTree,
        shownCountRef
      )

      mptt.rightNode = rightNode

      // 仅顶层节点（parentId === root）初始可见
      // Only top-level nodes (parentId === root) are initially visible
      // Изначально видимы только узлы верхнего уровня (parentId === root)
      if (mptt.parentId === root) {
        mptt.shown = true
        shownCountRef[0]++
      }
      lNode = rightNode + 1
    }
  }
  return lNode
}

/**
 * 从 JSON 字符串解析已有的 MPTT 树数据，结果追加到 fullTree 数组
 * Parses existing MPTT tree data from a JSON string, appending to fullTree array
 * Разбирает существующие данные дерева MPTT из строки JSON, добавляя в массив fullTree
 *
 * @param tree - JSON 字符串 / JSON string / Строка JSON
 * @param root - 根节点标识 / Root identifier / Идентификатор корня
 * @param fullTree - 输出数组 / Output array / Массив для вывода
 * @returns 初始可见节点计数 / Initially visible node count / Количество изначально видимых узлов
 */
export function parseMpttTreeFromJson(
  tree: string,
  root: string,
  fullTree: MpttTree[]
): i32 {
  const jsonTree: JSON.Arr = <JSON.Arr>JSON.parse(tree)
  let shownCount: i32 = 0
  for (let i = 0; i < jsonTree.valueOf().length; i++) {
    const node: JSON.Obj = <JSON.Obj>jsonTree.valueOf()[i]
    const mptt: MpttTree = new MpttTree()

    // 使用安全 getter 替代强制转型，避免缺少字段时 null 转型失败
    // Use safe getters instead of forceful casts to avoid null cast failure on missing fields
    // Использование безопасных геттеров вместо принудительного приведения для избежания ошибок при отсутствии полей
    const id: JSON.Str | null = node.getString('id')
    if (id !== null) mptt.id = id.toString()
    const name: JSON.Str | null = node.getString('name')
    if (name !== null) mptt.name = name.toString()
    const parentId: JSON.Str | null = node.getString('parentId')
    if (parentId !== null) mptt.parentId = parentId.toString()
    const leftNode: JSON.Integer | null = node.getInteger('leftNode')
    if (leftNode !== null) mptt.leftNode = leftNode.valueOf() as i32
    const rightNode: JSON.Integer | null = node.getInteger('rightNode')
    if (rightNode !== null) mptt.rightNode = rightNode.valueOf() as i32
    const deep: JSON.Integer | null = node.getInteger('deep')
    if (deep !== null) mptt.deep = deep.valueOf() as i32
    const disabled: JSON.Bool | null = node.getBool('disabled')
    if (disabled !== null) mptt.disabled = disabled.valueOf()

    if (mptt.parentId === root) {
      mptt.shown = true
      shownCount++
    }
    fullTree.push(mptt)
  }
  sortByLeftNode(fullTree)
  return shownCount
}

/**
 * 构建 id → fullTree 索引位置的映射表，用于 O(1) 节点查找
 * Builds an id → fullTree index position map for O(1) node lookup
 * Строит маппинг id → позиция в fullTree для поиска узла за O(1)
 *
 * @param fullTree - 已排序的 MPTT 树数组 / Sorted MPTT tree array / Отсортированный массив дерева MPTT
 * @returns id 到索引的映射 / id-to-index map / Маппинг id к индексу
 */
export function buildIdIndex(fullTree: MpttTree[]): Map<string, i32> {
  const idToIndex: Map<string, i32> = new Map()
  for (let i: i32 = 0; i < fullTree.length; i++) {
    idToIndex.set(fullTree[i].id, i)
  }
  return idToIndex
}

/**
 * 按 leftNode 升序对 MPTT 树数组就地排序
 * Sorts MPTT tree array in-place by leftNode ascending
 * Сортирует массив дерева MPTT на месте по leftNode по возрастанию
 *
 * @param tree - 待排序数组 / Array to sort / Массив для сортировки
 */
export function sortByLeftNode(tree: MpttTree[]): void {
  tree.sort((a: MpttTree, b: MpttTree): i32 => {
    return a.leftNode - b.leftNode
  })
}
