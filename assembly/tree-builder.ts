import { MpttTree, NeighborTree, TreeFieldKeys } from './models'

// ─── Inline helpers ───

// @ts-ignore: decorator
@inline
function skipWs(src: string, pos: i32, len: i32): i32 {
  while (pos < len) {
    const c = src.charCodeAt(pos)
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) pos++
    else break
  }
  return pos
}

/**
 * 读取 JSON 字符串内容（跳过转义），pos 必须在开引号 " 处
 * Read a JSON string value (skips escapes), pos must be at opening quote "
 * Чтение значения строки JSON (пропуск экранирования), pos должен быть на открывающей кавычке "
 */
// @ts-ignore: decorator
@inline
function readStringContent(src: string, pos: i32, len: i32): string {
  pos++ // skip opening "
  const start = pos
  while (pos < len) {
    const c = src.charCodeAt(pos)
    if (c === 0x22) {
      // quote
      return src.substring(start, pos)
    }
    if (c === 0x5c) pos++ // backslash: skip next char
    pos++
  }
  return ''
}

/**
 * 跳过 JSON 字符串值（含引号），pos 必须在开引号 " 处
 * Skip past a JSON string value (including quotes), pos must be at opening quote "
 * Пропуск значения строки JSON (включая кавычки), pos должен быть на открывающей кавычке "
 */
// @ts-ignore: decorator
@inline
function skipString(src: string, pos: i32, len: i32): i32 {
  pos++ // skip opening "
  while (pos < len) {
    const c = src.charCodeAt(pos)
    if (c === 0x22) return pos + 1
    if (c === 0x5c) pos++
    pos++
  }
  return pos
}

/**
 * 跳过任意 JSON 值（字符串/数字/布尔/null/对象/数组）
 * Skip past any JSON value (string/number/boolean/null/object/array)
 * Пропуск любого значения JSON (строка/число/булево/null/объект/массив)
 */
function skipValue(src: string, pos: i32, len: i32): i32 {
  pos = skipWs(src, pos, len)
  if (pos >= len) return pos
  const c = src.charCodeAt(pos)
  if (c === 0x22) return skipString(src, pos, len)
  if (c === 0x7b) return skipObject(src, pos, len) // '{'
  if (c === 0x5b) return skipArray(src, pos, len) // '['
  // number / true / false / null
  while (pos < len) {
    const ch = src.charCodeAt(pos)
    if (
      ch === 0x2c ||
      ch === 0x7d ||
      ch === 0x5d || // , } ]
      ch === 0x20 ||
      ch === 0x09 ||
      ch === 0x0a ||
      ch === 0x0d
    )
      break
    pos++
  }
  return pos
}

/**
 * 跳过整个 JSON 对象 { ... }
 * Skip past an entire JSON object { ... }
 * Пропуск целого JSON-объекта { ... }
 */
function skipObject(src: string, pos: i32, len: i32): i32 {
  pos++ // skip '{'
  while (pos < len) {
    pos = skipWs(src, pos, len)
    if (pos >= len) break
    if (src.charCodeAt(pos) === 0x7d) return pos + 1 // '}'
    pos = skipString(src, pos, len) // key
    pos = skipWs(src, pos, len)
    if (src.charCodeAt(pos) === 0x3a) pos++ // ':'
    pos = skipWs(src, pos, len)
    pos = skipValue(src, pos, len) // value
    pos = skipWs(src, pos, len)
    if (src.charCodeAt(pos) === 0x7d) return pos + 1 // '}'
    if (src.charCodeAt(pos) === 0x2c) pos++ // ','
  }
  return pos
}

/**
 * 跳过整个 JSON 数组 [ ... ]
 * Skip past an entire JSON array [ ... ]
 * Пропуск целого JSON-массива [ ... ]
 */
function skipArray(src: string, pos: i32, len: i32): i32 {
  pos++ // skip '['
  while (pos < len) {
    pos = skipWs(src, pos, len)
    if (pos >= len) break
    if (src.charCodeAt(pos) === 0x5d) return pos + 1 // ']'
    pos = skipValue(src, pos, len)
    pos = skipWs(src, pos, len)
    if (src.charCodeAt(pos) === 0x5d) return pos + 1 // ']'
    if (src.charCodeAt(pos) === 0x2c) pos++ // ','
  }
  return pos
}

// ─── Core parser: JSON string → NeighborTree[] with dynamic field keys ───
// ─── 核心解析器：JSON 字符串 → NeighborTree[]，支持动态字段键名 ───
// ─── Основной парсер: строка JSON → NeighborTree[] с динамическими ключами полей ───

/**
 * 解析单个 JSON 对象为 NeighborTree 节点
 * Parse a single JSON object into a NeighborTree node
 * Разбор одного JSON-объекта в узел NeighborTree
 *
 * 使用 fk (TreeFieldKeys) 动态匹配字段名，支持用户自定义字段映射。
 * 自动保存原始 JSON 子串到 extendData 字段。
 *
 * Uses fk (TreeFieldKeys) to dynamically match field names, supporting custom field mapping.
 * Automatically saves the raw JSON substring to the extendData field.
 *
 * Использует fk (TreeFieldKeys) для динамического сопоставления имён полей.
 * Автоматически сохраняет исходную подстроку JSON в поле extendData.
 */
function parseOneObject(
  src: string,
  pos: i32,
  len: i32,
  fk: TreeFieldKeys,
  result: NeighborTree[]
): i32 {
  const objStart: i32 = pos
  pos++ // skip '{'
  const nt: NeighborTree = new NeighborTree()

  while (pos < len) {
    pos = skipWs(src, pos, len)
    const c = src.charCodeAt(pos)
    if (c === 0x7d) {
      // '}'
      pos++
      break
    }
    if (c === 0x2c) {
      pos++
      continue
    } // ',' skip trailing commas

    // Read key
    const key: string = readStringContent(src, pos, len)
    pos = skipString(src, pos, len) // advance past key
    pos = skipWs(src, pos, len)
    if (src.charCodeAt(pos) === 0x3a) pos++ // ':'
    pos = skipWs(src, pos, len)

    // Match key and read value
    if (key === fk.idField) {
      nt.id = readStringContent(src, pos, len)
    } else if (key === fk.nameField) {
      nt.name = readStringContent(src, pos, len)
    } else if (key === fk.parentIdField) {
      nt.parentId = readStringContent(src, pos, len)
    } else if (key === 'disabled') {
      // check for "true" keyword
      pos = skipWs(src, pos, len)
      if (pos + 4 <= len) {
        nt.disabled = src.charCodeAt(pos) === 0x74 // 't'
      }
    }
    pos = skipValue(src, pos, len)
  }

  // extendData: raw JSON substring of the original object
  nt.extendData = src.substring(objStart, pos)
  result.push(nt)
  return pos
}

/**
 * 解析 JSON 数组为 NeighborTree 数组（邻接表）
 * Parse JSON array into NeighborTree array (adjacency list)
 * Разбор JSON-массива в массив NeighborTree (список смежности)
 *
 * @param src - JSON 字符串 / JSON string / Строка JSON
 * @param fk - 字段键名配置 / Field key configuration / Конфигурация имён полей
 * @returns 邻接表节点数组 / Adjacency list node array / Массив узлов списка смежности
 */
export function parseNeighborArray(
  src: string,
  fk: TreeFieldKeys
): NeighborTree[] {
  const result: NeighborTree[] = []
  const len: i32 = src.length
  let pos: i32 = 0

  pos = skipWs(src, pos, len)
  if (pos < len && src.charCodeAt(pos) === 0x5b) pos++ // '['

  while (pos < len) {
    pos = skipWs(src, pos, len)
    if (pos >= len) break
    const c = src.charCodeAt(pos)
    if (c === 0x5d) break // ']'
    if (c === 0x2c) {
      pos++
      continue
    } // ','
    if (c === 0x7b) {
      pos = parseOneObject(src, pos, len, fk, result)
    } else {
      pos++
    }
  }
  return result
}

// ─── Public API ───

/**
 * 检测 JSON 是否包含 MPTT 字段（leftNode 和 rightNode）
 * Detect if JSON contains MPTT fields (leftNode and rightNode)
 * Проверка наличия полей MPTT в JSON (leftNode и rightNode)
 *
 * @param src - JSON 字符串 / JSON string / Строка JSON
 * @param fk - 字段键名配置 / Field key configuration / Конфигурация имён полей
 * @returns true 表示输入已包含 MPTT 字段 / true if input already contains MPTT fields / true, если ввод уже содержит поля MPTT
 */
export function hasMpttFields(src: string, fk: TreeFieldKeys): bool {
  return (
    src.indexOf(fk.leftNodeField) !== -1 &&
    src.indexOf(fk.rightNodeField) !== -1
  )
}

/**
 * 从 JSON 字符串解析为 NeighborTree 数组（使用自定义字段键名）
 * Parse JSON string to NeighborTree array (using custom field keys)
 * Разбор строки JSON в массив NeighborTree (с пользовательскими ключами полей)
 */
export function parseTreeFromJson(
  jsonStr: string,
  fieldKeys: TreeFieldKeys
): NeighborTree[] {
  return parseNeighborArray(jsonStr, fieldKeys)
}

/**
 * 从 JSON 字符串解析为 NeighborTree 数组（使用默认字段键名）
 * Parse JSON string to NeighborTree array (using default field keys)
 * Разбор строки JSON в массив NeighborTree (с ключами полей по умолчанию)
 */
export function parseNeighborTreeFromJson(jsonStr: string): NeighborTree[] {
  return parseNeighborArray(jsonStr, new TreeFieldKeys())
}

/**
 * 将邻接表树转换为 MPTT 结构（非递归深度优先遍历）
 * Convert adjacency list tree to MPTT structure (non-recursive depth-first traversal)
 * Преобразование дерева списка смежности в структуру MPTT (нерекурсивный обход в глубину)
 *
 * 使用 Map 按 parentId 分组，从 root 开始递归构建 MPTT 节点，
 * 为每个节点分配 leftNode/rightNode/deep 值。
 *
 * Uses a Map grouped by parentId, recursively builds MPTT nodes from root,
 * assigning leftNode/rightNode/deep values to each node.
 *
 * Использует Map, сгруппированную по parentId, рекурсивно строит узлы MPTT от корня,
 * назначая значения leftNode/rightNode/deep каждому узлу.
 *
 * @param neighborTrees - 邻接表节点数组 / Adjacency list node array / Массив узлов списка смежности
 * @param root - 根节点标识 / Root identifier / Идентификатор корня
 * @param fullTree - 输出的 MPTT 树数组（就地填充） / Output MPTT tree array (filled in-place) / Выходной массив дерева MPTT (заполняется на месте)
 * @returns 可见节点数 / Visible node count / Количество видимых узлов
 */
export function convertNeighborToMptt(
  neighborTrees: NeighborTree[],
  root: string,
  fullTree: MpttTree[]
): i32 {
  const treeMap: Map<string, NeighborTree[]> = new Map()
  for (let i = 0; i < neighborTrees.length; i++) {
    const nt: NeighborTree = neighborTrees[i]
    if (!treeMap.has(nt.parentId)) {
      treeMap.set(nt.parentId, [])
    }
    treeMap.get(nt.parentId).push(nt)
  }

  const shownCountRef: i32[] = [0]
  _recursiveAssembly(treeMap, root, 0, 0, root, fullTree, shownCountRef)
  treeMap.clear()
  return shownCountRef[0]
}

/**
 * 递归构建 MPTT 节点的内部函数
 * Internal recursive MPTT node builder
 * Внутренняя функция рекурсивного построения узлов MPTT
 *
 * @param treeMap - 按 parentId 分组的子节点映射 / Children grouped by parentId / Дети, сгруппированные по parentId
 * @param parentId - 当前父节点 ID / Current parent node ID / ID текущего родительского узла
 * @param lNode - 当前 leftNode 值（返回时更新为子树最后的 rightNode+1） / Current leftNode value (returned as last subtree rightNode+1) / Текущее значение leftNode (возвращается как последний rightNode+1 поддерева)
 * @param deep - 当前深度 / Current depth / Текущая глубина
 * @param root - 树根标识 / Root identifier / Идентификатор корня
 * @param fullTree - 输出的 MPTT 节点数组 / Output MPTT node array / Выходной массив узлов MPTT
 * @param shownCountRef - 可见节点计数器引用 / Visible node counter reference / Ссылка на счётчик видимых узлов
 * @param parentDisabled - 父节点是否禁用 / Whether parent is disabled / Отключён ли родительский узел
 * @returns 最后一个子节点的 rightNode 值 / rightNode value of last child / Значение rightNode последнего дочернего узла
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
      mptt.disabled = nt.disabled || parentDisabled
      mptt.extendData = nt.extendData
      mptt.leftNode = lNode
      mptt.deep = currentDeep

      fullTree.push(mptt)

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
 * 从 JSON 字符串解析并构建 MPTT 树（始终基于 parentId 重建）
 * Parse JSON string and build MPTT tree (always rebuilds based on parentId)
 * Разбор строки JSON и построение дерева MPTT (всегда перестраивается на основе parentId)
 *
 * 先解析为邻接表，再转换为 MPTT 结构。
 * Parses to adjacency list first, then converts to MPTT structure.
 * Сначала разбирается в список смежности, затем преобразуется в структуру MPTT.
 *
 * @param tree - JSON 字符串 / JSON string / Строка JSON
 * @param root - 根标识 / Root identifier / Идентификатор корня
 * @param fullTree - 输出的 MPTT 树数组 / Output MPTT tree array / Выходной массив дерева MPTT
 * @param fieldKeys - 字段键名配置（可选，默认使用 TreeFieldKeys 默认值） / Field key configuration (optional, defaults to TreeFieldKeys defaults) / Конфигурация имён полей (опционально, по умолчанию значения TreeFieldKeys)
 * @returns 可见节点数 / Visible node count / Количество видимых узлов
 */
export function parseMpttTreeFromJson(
  tree: string,
  root: string,
  fullTree: MpttTree[],
  fieldKeys: TreeFieldKeys | null = null
): i32 {
  const fk = fieldKeys !== null ? fieldKeys : new TreeFieldKeys()
  const neighborTrees = parseNeighborArray(tree, fk)
  return convertNeighborToMptt(neighborTrees, root, fullTree)
}

/**
 * 构建 id → fullTree 索引的 HashMap，实现 O(1) 节点查找
 * Build id → fullTree index HashMap for O(1) node lookup
 * Построение HashMap id → индекс в fullTree для поиска узлов за O(1)
 *
 * @param fullTree - MPTT 树数组 / MPTT tree array / Массив дерева MPTT
 * @returns id 到索引的映射 / id to index map / Отображение id в индекс
 */
export function buildIdIndex(fullTree: MpttTree[]): Map<string, i32> {
  const idToIndex: Map<string, i32> = new Map()
  for (let i: i32 = 0; i < fullTree.length; i++) {
    idToIndex.set(fullTree[i].id, i)
  }
  return idToIndex
}

/**
 * 按 leftNode 升序排序 MPTT 树（原地排序）
 * Sort MPTT tree by leftNode ascending (in-place)
 * Сортировка дерева MPTT по возрастанию leftNode (на месте)
 *
 * @param tree - MPTT 树数组（将被原地排序） / MPTT tree array (will be sorted in-place) / Массив дерева MPTT (будет отсортирован на месте)
 */
export function sortByLeftNode(tree: MpttTree[]): void {
  tree.sort((a: MpttTree, b: MpttTree): i32 => {
    return a.leftNode - b.leftNode
  })
}
