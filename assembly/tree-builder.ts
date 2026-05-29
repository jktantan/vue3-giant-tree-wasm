import { MpttTree, NeighborTree, TreeFieldKeys } from './models'
import { jsonParse, JsonArr, JsonObj } from './json'

/**
 * 检测 JSON 数组中是否包含 MPTT 字段（leftNode/rightNode）
 * Detects whether the JSON array contains MPTT fields (leftNode/rightNode)
 * Определяет, содержит ли массив JSON поля MPTT (leftNode/rightNode)
 *
 * @param jsonTree - JSON 数组 / JSON array / Массив JSON
 * @param fieldKeys - 字段键名配置 / Field key configuration / Конфигурация имён полей
 * @returns 存在 leftNode 和 rightNode 字段返回 true / true if both leftNode and rightNode exist / true, если оба поля leftNode и rightNode существуют
 */
export function hasMpttFields(
  jsonTree: JsonArr,
  fieldKeys: TreeFieldKeys
): bool {
  if (jsonTree.length === 0) return false
  const sample = jsonTree.getItem(0) as JsonObj
  return (
    sample.has(fieldKeys.leftNodeField) && sample.has(fieldKeys.rightNodeField)
  )
}

/**
 * 使用可配置字段键名从 JSON 数组解析邻接表节点列表
 * Parses adjacency list nodes from a JSON array using configurable field keys
 * Разбирает узлы списка смежности из массива JSON с использованием настраиваемых ключей полей
 *
 * @param jsonTree - JSON 数组 / JSON array / Массив JSON
 * @param fieldKeys - 字段键名配置 / Field key configuration / Конфигурация имён полей
 * @returns 邻接表节点数组 / Array of adjacency list nodes / Массив узлов списка смежности
 */
export function parseTreeFromJson(
  jsonTree: JsonArr,
  fieldKeys: TreeFieldKeys
): NeighborTree[] {
  const result: NeighborTree[] = []
  for (let i = 0; i < jsonTree.length; i++) {
    const node = jsonTree.getItem(i) as JsonObj
    const neighborTree: NeighborTree = new NeighborTree()

    // 将原始行 JSON 存入 extendData，保留所有自定义字段
    // Store the original row JSON in extendData, preserving all custom fields
    // Сохраняем исходный JSON строки в extendData, сохраняя все пользовательские поля
    neighborTree.extendData = node.stringify()

    // 从原始数据中提取 id/name/parentId 作为缓存字段（MPTT 内部运算需要 O(1) 访问）
    // Extract id/name/parentId from original data as cached fields (MPTT needs O(1) access)
    // Извлекаем id/name/parentId из исходных данных как кэшированные поля (MPTT требует O(1) доступа)
    const id = node.getStringValue(fieldKeys.idField)
    if (id !== null) neighborTree.id = id
    const name = node.getStringValue(fieldKeys.nameField)
    if (name !== null) neighborTree.name = name
    const parentId = node.getStringValue(fieldKeys.parentIdField)
    if (parentId !== null) neighborTree.parentId = parentId
    const disabled = node.getBool('disabled')
    if (disabled !== null) neighborTree.disabled = disabled.valueOf()
    result.push(neighborTree)
  }
  return result
}

/**
 * 从 JSON 数组解析邻接表节点列表（默认键名，向后兼容）
 * Parses adjacency list nodes from a JSON array (default key names, backward compat)
 * Разбирает узлы списка смежности из массива JSON (имена полей по умолчанию, обратная совместимость)
 *
 * @param jsonTree - assemblyscript-json 解析后的 JSON 数组 / Parsed JSON array / Разобранный массив JSON
 * @returns 邻接表节点数组 / Array of adjacency list nodes / Массив узлов списка смежности
 */
export function parseNeighborTreeFromJson(jsonTree: JsonArr): NeighborTree[] {
  return parseTreeFromJson(jsonTree, new TreeFieldKeys())
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
  shownCountRef: i32[],
  parentDisabled: bool = false
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
      // 如果父节点 disabled，子节点强制 disabled（继承）
      // If parent is disabled, children are forcibly disabled (inherited)
      mptt.disabled = nt.disabled || parentDisabled
      mptt.extendData = nt.extendData
      mptt.leftNode = lNode
      mptt.deep = currentDeep

      // 前序 push：在递归子节点之前推入数组（使 push 顺序 = leftNode 升序，无需后续排序）
      // Preorder push: push before recursing children (push order = leftNode asc, no sort needed)
      // Пре-порядок push: помещаем в массив до рекурсии потомков (порядок push = порядок leftNode)
      fullTree.push(mptt)

      // 递归处理子节点，返回值为子树消耗后的下一个可用编号
      // Recurse into children; return value is the next number after subtree
      // Рекурсия в дочерние; возвращаемое значение — следующий номер после поддерева
      // 传递 disabled 状态：当前节点 disabled → 子节点全部继承
      // Pass disabled state: current node disabled → all children inherit
      const rightNode: i32 = _recursiveAssembly(
        treeMap,
        mptt.id,
        lNode + 1,
        currentDeep + 1,
        root,
        fullTree,
        shownCountRef,
        mptt.disabled
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
 * 从 JSON 字符串解析树数据，始终重新构建 MPTT（避免 stale leftNode/rightNode）
 * Parses tree data from a JSON string, always rebuilds MPTT (avoids stale leftNode/rightNode)
 * Разбирает данные дерева из строки JSON, всегда перестраивает MPTT (избегает устаревших leftNode/rightNode)
 *
 * 无论输入数据是否包含 leftNode/rightNode，都基于 parentId 关系重建 MPTT 编号。
 * Regardless of whether input data contains leftNode/rightNode, rebuilds MPTT based on parentId.
 * Независимо от наличия leftNode/rightNode во входных данных, перестраивает MPTT на основе parentId.
 *
 * @param tree - JSON 字符串 / JSON string / Строка JSON
 * @param root - 根节点标识 / Root identifier / Идентификатор корня
 * @param fullTree - 输出数组 / Output array / Массив для вывода
 * @returns 初始可见节点计数 / Initially visible node count / Количество изначально видимых узлов
 */
export function parseMpttTreeFromJson(
  tree: string,
  root: string,
  fullTree: MpttTree[],
  fieldKeys: TreeFieldKeys | null = null
): i32 {
  const jsonTree = jsonParse(tree) as JsonArr
  const fk = fieldKeys !== null ? fieldKeys : new TreeFieldKeys()
  const neighborTrees = parseTreeFromJson(jsonTree, fk)
  return convertNeighborToMptt(neighborTrees, root, fullTree)
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
