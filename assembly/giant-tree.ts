import {
  CheckType,
  DisplayType,
  MpttTree,
  NeighborTree,
  SelectType,
} from './models'
import { JSON } from 'assemblyscript-json/assembly/index'
import {
  parseNeighborTreeFromJson,
  convertNeighborToMptt,
  parseMpttTreeFromJson,
  buildIdIndex,
  sortByLeftNode,
} from './tree-builder'
import {
  rebuildShownNodes,
  recalcShownCount,
  setCollapsedShown,
  incrementalUpdateShownNodes,
  getVisibleSlice,
} from './tree-visibility'
import {
  checkNodeInTree,
  setCheckedNodesInTree,
  setCheckedNodeInTree,
  getCheckedNodesFromTree,
  clearAllChecked,
} from './tree-check'
import { fuzzySearchTree } from './tree-search'
import { serializeMpttArray } from './tree-serializer'

/**
 * 巨树主类：组合所有模块，持有全部状态，提供完整的树操作 API
 * Giant tree main class: composes all modules, holds all state, provides complete tree operation API
 * Главный класс гигантского дерева: объединяет все модули, хранит всё состояние, предоставляет полный API операций с деревом
 *
 * 状态管理策略：
 * - fullTree: 完整 MPTT 树（按 leftNode 排序）
 * - searchTree: 搜索结果子集
 * - tree: 当前显示树的引用（指向 fullTree 或 searchTree）
 * - _shownNodes: 可见节点有序数组（增量维护）
 * - shownCount: 可见节点计数器（O(1) 高度计算）
 * - idToIndex: id→fullTree 索引映射（O(1) 节点定位）
 * - JSON 缓存: 避免重复序列化相同的可视区域
 *
 * State management strategy:
 * - fullTree: complete MPTT tree (sorted by leftNode)
 * - searchTree: search result subset
 * - tree: reference to current display tree (points to fullTree or searchTree)
 * - _shownNodes: visible nodes ordered array (incrementally maintained)
 * - shownCount: visible node counter (O(1) height calculation)
 * - idToIndex: id→fullTree index map (O(1) node lookup)
 * - JSON cache: avoids re-serializing the same viewport
 *
 * Стратегия управления состоянием:
 * - fullTree: полное дерево MPTT (отсортировано по leftNode)
 * - searchTree: подмножество результатов поиска
 * - tree: ссылка на текущее дерево отображения (указывает на fullTree или searchTree)
 * - _shownNodes: упорядоченный массив видимых узлов (инкрементное обновление)
 * - shownCount: счётчик видимых узлов (вычисление высоты за O(1))
 * - idToIndex: маппинг id→индекс в fullTree (поиск узла за O(1))
 * - Кэш JSON: избегает повторной сериализации того же viewport
 */
export class GiantTree {
  constructor(root: string, lineHeight: f32, selectType: SelectType) {
    this.root = root
    this.lineHeight = lineHeight
    this.selectType = selectType
  }

  /** 临时邻接表缓冲区（逐条 push 场景） / Temporary adjacency list buffer (for incremental push) / Временный буфер списка смежности (для пошагового push) */
  tmpTree: NeighborTree[] = []
  /** 完整 MPTT 树数组，按 leftNode 升序 / Full MPTT tree array, sorted by leftNode ascending / Полный массив дерева MPTT, отсортирован по leftNode */
  fullTree: MpttTree[] = []
  /** 搜索结果树 / Search result tree / Дерево результатов поиска */
  searchTree: MpttTree[] = []
  /** 当前显示树引用 / Current display tree reference / Ссылка на текущее дерево отображения */
  tree: MpttTree[] = this.fullTree
  /** 虚拟滚动行高（像素） / Virtual scroll line height (pixels) / Высота строки виртуальной прокрутки (пиксели) */
  lineHeight: f32 = 20
  /** 根节点标识，顶层节点的 parentId 等于此值 / Root identifier, top-level nodes' parentId equals this / Идентификатор корня, parentId узлов верхнего уровня равен этому значению */
  root: string = ''
  /** 选择模式 / Selection mode / Режим выбора */
  selectType: SelectType
  /** 当前滚动位置（像素） / Current scroll position (pixels) / Текущая позиция прокрутки (пиксели) */
  scrollTop: f32 = 0
  /** 可视区域高度（像素） / Viewport height (pixels) / Высота области просмотра (пиксели) */
  scrollHeight: f32 = 0

  /** 可见节点计数器，用于 O(1) 计算总高度 / Visible node counter for O(1) total height calculation / Счётчик видимых узлов для вычисления общей высоты за O(1) */
  shownCount: i32 = 0

  /** 可见节点有序数组，按 leftNode 排序，增量维护 / Visible nodes ordered array, sorted by leftNode, incrementally maintained / Упорядоченный массив видимых узлов, отсортирован по leftNode, инкрементное обновление */
  _shownNodes: MpttTree[] = []

  /** id→fullTree 索引映射 / id→fullTree index map / Маппинг id→индекс в fullTree */
  idToIndex: Map<string, i32> = new Map()

  /** JSON 缓存：起始索引 / JSON cache: start index / Кэш JSON: начальный индекс */
  _cachedStartIdx: i32 = -1
  /** JSON 缓存：结束索引 / JSON cache: end index / Кэш JSON: конечный индекс */
  _cachedEndIdx: i32 = -1
  /** JSON 缓存：序列化结果 / JSON cache: serialized result / Кэш JSON: сериализованный результат */
  _cachedJson: string = ''
  /** JSON 缓存：是否有效 / JSON cache: whether valid / Кэш JSON: действителен ли */
  _cacheValid: boolean = false

  /**
   * 使 JSON 缓存失效，任何修改节点状态的操作后必须调用
   * Invalidates JSON cache, must be called after any operation that modifies node state
   * Инвалидирует кэш JSON, должен вызываться после любой операции, изменяющей состояние узлов
   */
  _invalidateCache(): void {
    this._cacheValid = false
  }

  // ─── 树构建 / Tree Building / Построение дерева ───

  /**
   * 从 JSON 数组设置邻接表树，自动转换为 MPTT 结构
   * Sets adjacency list tree from JSON array, auto-converts to MPTT structure
   * Устанавливает дерево списка смежности из массива JSON, автоматически преобразует в структуру MPTT
   */
  setNeighborTree(jsonTree: JSON.Arr): void {
    this.tmpTree.splice(0)
    this.tmpTree = parseNeighborTreeFromJson(jsonTree)
    this._convertToMpttTree(this.tmpTree)
    this.tmpTree.splice(0)
  }

  /**
   * 邻接表→MPTT 转换内部方法
   * Internal method for adjacency list → MPTT conversion
   * Внутренний метод преобразования списка смежности → MPTT
   */
  _convertToMpttTree(neighborTrees: NeighborTree[]): void {
    this.shownCount = convertNeighborToMptt(
      neighborTrees,
      this.root,
      this.fullTree
    )
    this.idToIndex = buildIdIndex(this.fullTree)
    this._rebuildShownNodes()
  }

  /**
   * 从 JSON 字符串设置已有的 MPTT 树数据
   * Sets existing MPTT tree data from JSON string
   * Устанавливает существующие данные дерева MPTT из строки JSON
   */
  setMpttTree(tree: string): void {
    this.shownCount = parseMpttTreeFromJson(tree, this.root, this.fullTree)
    this.idToIndex = buildIdIndex(this.fullTree)
    this._rebuildShownNodes()
  }

  /**
   * 逐条推入邻接表节点（适用于大数据量分批传入）
   * Pushes adjacency list nodes one by one (for batch input of large data)
   * Пошаговый ввод узлов списка смежности (для пакетного ввода больших данных)
   */
  pushNeighborNode(
    id: string,
    name: string,
    parentId: string,
    disabled: boolean = false
  ): void {
    const nt: NeighborTree = new NeighborTree()
    nt.id = id
    nt.name = name
    nt.parentId = parentId
    nt.disabled = disabled
    this.tmpTree.push(nt)
  }

  /**
   * 完成邻接表批量推入，触发 MPTT 转换
   * Finalizes adjacency list batch push, triggers MPTT conversion
   * Завершает пакетный ввод списка смежности, запускает преобразование в MPTT
   */
  popNeighbor(): void {
    this._convertToMpttTree(this.tmpTree)
    this.tmpTree.splice(0)
  }

  /**
   * 逐条推入 MPTT 节点（适用于已有 MPTT 数据的分批传入）
   * Pushes MPTT nodes one by one (for batch input of existing MPTT data)
   * Пошаговый ввод узлов MPTT (для пакетного ввода существующих данных MPTT)
   */
  pushMpttNode(
    id: string,
    name: string,
    parentId: string,
    leftNode: i32,
    rightNode: i32,
    deep: i32
  ): void {
    const mptt: MpttTree = new MpttTree()
    mptt.id = id
    mptt.name = name
    mptt.parentId = parentId
    mptt.leftNode = leftNode
    mptt.rightNode = rightNode
    mptt.deep = deep
    if (mptt.deep === 0) {
      mptt.shown = true
      this.shownCount++
    }
    this.fullTree.push(mptt)
  }

  /**
   * 完成 MPTT 批量推入，排序并构建索引
   * Finalizes MPTT batch push, sorts and builds index
   * Завершает пакетный ввод MPTT, сортирует и строит индекс
   */
  popMptt(): void {
    sortByLeftNode(this.fullTree)
    this.idToIndex = buildIdIndex(this.fullTree)
    this._rebuildShownNodes()
  }

  // ─── 可见性管理 / Visibility Management / Управление видимостью ───

  /**
   * 全量重建可见节点数组
   * Full rebuild of visible nodes array
   * Полная перестройка массива видимых узлов
   */
  _rebuildShownNodes(): void {
    this._shownNodes = rebuildShownNodes(this.tree)
    this._invalidateCache()
  }

  /**
   * 展开/折叠节点：更新子树可见性 + 增量维护 shownNodes
   * Expand/collapse node: update subtree visibility + incrementally maintain shownNodes
   * Развернуть/свернуть узел: обновить видимость поддерева + инкрементное обновление shownNodes
   *
   * 复杂度 O(子树大小 + log N)，相比全量重建 O(N) 大幅提升
   * Complexity O(subtree + log N), significantly better than full rebuild O(N)
   * Сложность O(поддерево + log N), значительно лучше полной перестройки O(N)
   */
  collapseTree(id: string, collapsed: boolean): void {
    if (!this.idToIndex.has(id)) return
    const i: i32 = this.idToIndex.get(id)
    const node: MpttTree = this.fullTree[i]
    node.collapsed = collapsed
    const delta: i32 = setCollapsedShown(
      this.fullTree,
      i + 1,
      node.rightNode,
      !collapsed
    )
    this.shownCount += delta
    incrementalUpdateShownNodes(
      this._shownNodes,
      this.fullTree,
      i,
      node.leftNode,
      node.rightNode,
      !collapsed
    )
    this._invalidateCache()
  }

  /**
   * 全部展开/全部折叠
   * Expand all / Collapse all
   * Развернуть все / Свернуть все
   */
  collapseAll(collapsed: boolean): void {
    this.shownCount = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      node.collapsed = collapsed
      if (node.deep > 0) {
        node.shown = !collapsed
      }
      if (node.shown) this.shownCount++
    }
    this._rebuildShownNodes()
  }

  // ─── 虚拟滚动 / Virtual Scrolling / Виртуальная прокрутка ───

  /**
   * 设置滚动位置和可视区域高度
   * Sets scroll position and viewport height
   * Устанавливает позицию прокрутки и высоту области просмотра
   */
  setBoundary(scrollTop: f32, scrollHeight: f32): void {
    this.scrollTop = scrollTop
    this.scrollHeight = scrollHeight
  }

  /**
   * 获取当前可视区域内的节点切片，复杂度 O(k)
   * Gets visible slice of nodes in current viewport, complexity O(k)
   * Получает срез видимых узлов в текущем viewport, сложность O(k)
   */
  getTmpShown(): MpttTree[] {
    return getVisibleSlice(
      this._shownNodes,
      this.scrollTop,
      this.scrollHeight,
      this.lineHeight
    )
  }

  /**
   * 获取可见区域总像素高度，O(1)
   * Gets total pixel height of visible area, O(1)
   * Получает общую высоту видимой области в пикселях, O(1)
   */
  getShownHeight(): f32 {
    return (this.shownCount as f32) * this.lineHeight
  }

  /**
   * 获取可见节点的 JSON 字符串（带缓存）
   * Gets JSON string of visible nodes (with cache)
   * Получает строку JSON видимых узлов (с кэшем)
   *
   * 缓存策略：当 scrollTop/scrollHeight 未变化时直接返回缓存
   * Cache strategy: returns cache directly when scrollTop/scrollHeight unchanged
   * Стратегия кэширования: возвращает кэш при неизменных scrollTop/scrollHeight
   */
  getShownNodes(): string {
    const startIdx: i32 = <i32>Math.floor(this.scrollTop / this.lineHeight)
    const endIdx: i32 =
      <i32>Math.ceil((this.scrollTop + this.scrollHeight) / this.lineHeight) + 1

    if (
      this._cacheValid &&
      startIdx === this._cachedStartIdx &&
      endIdx === this._cachedEndIdx
    ) {
      return this._cachedJson
    }

    const result: MpttTree[] = this.getTmpShown()
    const json: string = serializeMpttArray(result)

    this._cachedStartIdx = startIdx
    this._cachedEndIdx = endIdx
    this._cachedJson = json
    this._cacheValid = true

    return json
  }

  // ─── 选中逻辑 / Check Logic / Логика выбора ───

  /**
   * 选中/取消选中节点，返回当前可视区域的 JSON
   * Check/uncheck a node, returns JSON of current viewport
   * Выбрать/отменить выбор узла, возвращает JSON текущего viewport
   *
   * 关键：操作前先使缓存失效，确保返回最新状态
   * Key: invalidate cache before operation to ensure fresh state is returned
   * Ключевое: инвалидировать кэш перед операцией для возврата актуального состояния
   */
  checkNode(id: string, checked: CheckType): string {
    this._invalidateCache()
    const result: MpttTree[] = this.getTmpShown()
    checkNodeInTree(this.fullTree, this.idToIndex, id, checked, this.selectType)
    return serializeMpttArray(result)
  }

  /**
   * 批量设置选中节点（CHECKBOX 模式）
   * Batch set checked nodes (CHECKBOX mode)
   * Пакетная установка выбранных узлов (режим CHECKBOX)
   */
  setCheckedNodes(ids: string[]): void {
    setCheckedNodesInTree(this.fullTree, ids)
  }

  /**
   * 设置单个节点选中（RADIO/SELECT 模式）
   * Set single node checked (RADIO/SELECT mode)
   * Установить один узел выбранным (режим RADIO/SELECT)
   */
  setCheckedNode(id: string): void {
    setCheckedNodeInTree(this.fullTree, id, this.selectType)
  }

  /**
   * 获取所有已选中节点的 JSON
   * Gets JSON of all checked nodes
   * Получает JSON всех выбранных узлов
   */
  getCheckedNodes(): string {
    return getCheckedNodesFromTree(this.fullTree, this.selectType)
  }

  /**
   * 清除所有选中状态
   * Clears all check states
   * Сбрасывает все состояния выбора
   */
  clearCheckedNodes(): void {
    clearAllChecked(this.fullTree)
  }

  // ─── 搜索 / Search / Поиск ───

  /**
   * 模糊搜索：按关键词过滤树并返回可视区域 JSON
   * Fuzzy search: filters tree by keyword and returns viewport JSON
   * Нечёткий поиск: фильтрует дерево по ключевому слову и возвращает JSON viewport
   *
   * 空关键词时切回完整树；非空时构建搜索结果树并自动补全祖先链
   * Empty keyword switches back to full tree; non-empty builds search result tree with auto-completed ancestor chains
   * Пустое ключевое слово переключает на полное дерево; непустое строит дерево результатов с автодополнением цепочек предков
   */
  fuzzySearch(keyword: string): string {
    if (keyword === null || keyword === '') {
      this.tree = this.fullTree
      this.shownCount = recalcShownCount(this.tree)
      this._rebuildShownNodes()
      return serializeMpttArray(this.getTmpShown())
    } else {
      this.shownCount = fuzzySearchTree(this.fullTree, this.searchTree, keyword)
      this.tree = this.searchTree
      this._rebuildShownNodes()
      return serializeMpttArray(this.getTmpShown())
    }
  }

  // ─── 显示模式切换 / Display Mode Switch / Переключение режима отображения ───

  /**
   * 切换显示模式：完整树 ↔ 搜索结果树
   * Switches display mode: full tree ↔ search result tree
   * Переключает режим отображения: полное дерево ↔ дерево результатов поиска
   */
  switchDisplayTree(type: DisplayType): void {
    if (type === DisplayType.TREE) {
      this.tree = this.fullTree
      this.searchTree.splice(0)
    } else if (type === DisplayType.SEARCH) {
      this.tree = this.searchTree
    }
    this.shownCount = recalcShownCount(this.tree)
    this._rebuildShownNodes()
  }

  // ─── 其他 / Misc / Прочее ───

  /**
   * 获取树的总节点数
   * Gets total node count of the tree
   * Получает общее количество узлов дерева
   */
  getSize(): i32 {
    return this.fullTree.length
  }

  /**
   * 清空所有数据，重置为初始状态
   * Clears all data, resets to initial state
   * Очищает все данные, сбрасывает в начальное состояние
   */
  clear(): void {
    this.fullTree.splice(0)
    this.searchTree.splice(0)
    this.tree = this.fullTree
    this.tmpTree.splice(0)
    this.shownCount = 0
    this.idToIndex.clear()
    this._shownNodes.splice(0)
    this._invalidateCache()
  }
}
