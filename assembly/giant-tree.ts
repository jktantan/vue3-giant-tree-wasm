import {
  CheckType,
  CheckedOutputMode,
  DisplayType,
  MpttTree,
  NeighborTree,
  SelectType,
  TreeFieldKeys,
} from './models'
import {
  parseTreeFromJson,
  parseMpttTreeFromJson,
  convertNeighborToMptt,
  buildIdIndex,
  sortByLeftNode,
} from './tree-builder'
import {
  rebuildShownNodes,
  setCollapsedShown,
  incrementalUpdateShownNodes,
  getVisibleSlice,
  resetShownFlags,
} from './tree-visibility'
import {
  checkNodeInTree,
  setCheckedNodesInTree,
  setCheckedNodeInTree,
  getCheckedNodesFromTree,
  getCheckedIdsFromTree,
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
  constructor(
    root: string,
    lineHeight: f32,
    selectType: SelectType,
    idField: string = 'id',
    nameField: string = 'name',
    parentIdField: string = 'parentId',
    leftNodeField: string = 'leftNode',
    rightNodeField: string = 'rightNode'
  ) {
    this.root = root
    this.lineHeight = lineHeight
    this.selectType = selectType
    this.fieldKeys = new TreeFieldKeys(
      idField,
      nameField,
      parentIdField,
      leftNodeField,
      rightNodeField
    )
  }

  /** JSON 字段键名配置 / JSON field key configuration / Конфигурация имён полей JSON */
  fieldKeys: TreeFieldKeys
  /** CHECKBOX 输出 ID 模式（仅影响 getCheckedIds）/ CHECKBOX output ID mode (affects getCheckedIds only) / Режим вывода ID для CHECKBOX (влияет только на getCheckedIds) */
  checkedOutputMode: CheckedOutputMode = CheckedOutputMode.All
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

  /** RADIO 模式下当前选中节点的 fullTree 索引（-1=无），避免全树 O(N) 扫描 / RADIO mode: current checked node index in fullTree (-1=none), avoids O(N) full scan / RADIO: индекс текущего выбранного узла в fullTree (-1=нет), избегает полного O(N) сканирования */
  _radioCheckedIdx: i32 = -1
  /** SELECT 模式下当前选中节点的 fullTree 索引（-1=无），避免全树 O(N) 扫描 / SELECT mode: current selected node index in fullTree (-1=none), avoids O(N) full scan / SELECT: индекс текущего выбранного узла в fullTree (-1=нет), избегает полного O(N) сканирования */
  _selectSelectedIdx: i32 = -1

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
   * 统一设置树数据：使用可配置字段键名从 JSON 数组解析，
   * 自动检测邻接表/MPTT 输入，始终重新构建 MPTT（避免 stale leftNode/rightNode）
   *
   * Unified tree setter: parses JSON array with configurable field keys,
   * auto-detects adjacency list / MPTT input, always rebuilds MPTT (avoids stale leftNode/rightNode)
   *
   * Единый установщик дерева: разбирает массив JSON с настраиваемыми ключами полей,
   * автоопределяет список смежности / ввод MPTT, всегда перестраивает MPTT
   *
   * @param jsonTree - JSON 数组 / JSON array / Массив JSON
   */
  setTree(jsonTree: string): void {
    this.fullTree.splice(0)
    this.tmpTree.splice(0)
    this.tmpTree = parseTreeFromJson(jsonTree, this.fieldKeys)
    this._convertToMpttTree(this.tmpTree)
    this.tmpTree.splice(0)
  }

  /**
   * 从 JSON 数组设置邻接表树，自动转换为 MPTT 结构
   * Sets adjacency list tree from JSON array, auto-converts to MPTT structure
   * Устанавливает дерево списка смежности из массива JSON, автоматически преобразует в структуру MPTT
   *
   * 内部委托给 setTree，使用可配置字段键名
   * Delegates to setTree internally, using configurable field keys
   * Делегирует setTree внутри, используя настраиваемые ключи полей
   */
  setNeighborTree(jsonTree: string): void {
    this.setTree(jsonTree)
  }

  /**
   * 邻接表→MPTT 转换内部方法
   * Internal method for adjacency list → MPTT conversion
   * Внутренний метод преобразования списка смежности → MPTT
   */
  _convertToMpttTree(neighborTrees: NeighborTree[]): void {
    convertNeighborToMptt(neighborTrees, this.root, this.fullTree)
    this.idToIndex = buildIdIndex(this.fullTree)
    this._rebuildShownNodes()
  }

  /**
   * 从 JSON 字符串设置树数据（始终重建 MPTT，避免 stale leftNode/rightNode）
   * Sets tree data from JSON string (always rebuilds MPTT, avoids stale leftNode/rightNode)
   * Устанавливает данные дерева из строки JSON (всегда перестраивает MPTT)
   *
   * 无论输入是否包含 leftNode/rightNode，都基于 parentId 重建 MPTT。
   * Regardless of whether input contains leftNode/rightNode, rebuilds MPTT based on parentId.
   *
   * @param tree - JSON 字符串 / JSON string / Строка JSON
   */
  setMpttTree(tree: string): void {
    this.fullTree.splice(0)
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
    this.fullTree.splice(0)
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
    this.shownCount = this._shownNodes.length as i32
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
    this._shownNodes.splice(0)
    this.shownCount = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      node.collapsed = collapsed
      node.shown = !collapsed || node.parentId === this.root
      if (node.shown) {
        this._shownNodes.push(node)
        this.shownCount++
      }
    }
    this._invalidateCache()
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

    // RADIO/SELECT: 用缓存索引 O(1) 替代全树 O(N) 扫描
    // RADIO/SELECT: use cached index O(1) instead of full tree O(N) scan
    // RADIO/SELECT: используем кэшированный индекс O(1) вместо полного сканирования O(N)
    if (this.selectType === SelectType.RADIO) {
      if (
        this.idToIndex.has(id) &&
        this.fullTree[this.idToIndex.get(id)].disabled
      ) {
        return serializeMpttArray(this.getTmpShown())
      }
      const targetIdx: i32 = this.idToIndex.get(id)
      if (this._radioCheckedIdx >= 0 && this._radioCheckedIdx !== targetIdx) {
        this.fullTree[this._radioCheckedIdx].checked = CheckType.UNCHECKED
      }
      this.fullTree[targetIdx].checked = checked
      this._radioCheckedIdx = targetIdx
    } else if (this.selectType === SelectType.SELECT) {
      if (
        this.idToIndex.has(id) &&
        this.fullTree[this.idToIndex.get(id)].disabled
      ) {
        return serializeMpttArray(this.getTmpShown())
      }
      const targetIdx: i32 = this.idToIndex.get(id)
      if (
        this._selectSelectedIdx >= 0 &&
        this._selectSelectedIdx !== targetIdx
      ) {
        this.fullTree[this._selectSelectedIdx].selected = CheckType.UNCHECKED
      }
      this.fullTree[targetIdx].selected = checked
      this._selectSelectedIdx = targetIdx
    } else {
      // CHECKBOX: 使用原有函数
      // CHECKBOX: use existing function
      // CHECKBOX: используем существующую функцию
      checkNodeInTree(
        this.fullTree,
        this.idToIndex,
        id,
        checked,
        this.selectType
      )
    }

    const result: MpttTree[] = this.getTmpShown()
    return serializeMpttArray(result)
  }

  /**
   * 批量设置选中节点（CHECKBOX 模式）
   * Batch set checked nodes (CHECKBOX mode)
   * Пакетная установка выбранных узлов (режим CHECKBOX)
   */
  setCheckedNodes(ids: string[]): void {
    setCheckedNodesInTree(this.fullTree, ids, this.idToIndex)
    this._invalidateCache()
    // 批量设置后缓存索引失效
    // Cached indices invalidated after batch set
    // Кэшированные индексы недействительны после пакетной установки
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
  }

  /**
   * 设置单个节点选中（RADIO/SELECT 模式）
   * Set single node checked (RADIO/SELECT mode)
   * Установить один узел выбранным (режим RADIO/SELECT)
   */
  setCheckedNode(id: string): void {
    this._invalidateCache()
    // RADIO/SELECT: 缓存索引 O(1) 路径
    // RADIO/SELECT: cached index O(1) path
    // RADIO/SELECT: путь с кэшированным индексом O(1)
    if (this.selectType === SelectType.RADIO) {
      if (
        this.idToIndex.has(id) &&
        this.fullTree[this.idToIndex.get(id)].disabled
      )
        return
      const targetIdx: i32 = this.idToIndex.get(id)
      if (this._radioCheckedIdx >= 0 && this._radioCheckedIdx !== targetIdx) {
        this.fullTree[this._radioCheckedIdx].checked = CheckType.UNCHECKED
      }
      this.fullTree[targetIdx].checked = CheckType.CHECKED
      this._radioCheckedIdx = targetIdx
    } else if (this.selectType === SelectType.SELECT) {
      if (
        this.idToIndex.has(id) &&
        this.fullTree[this.idToIndex.get(id)].disabled
      )
        return
      const targetIdx: i32 = this.idToIndex.get(id)
      if (
        this._selectSelectedIdx >= 0 &&
        this._selectSelectedIdx !== targetIdx
      ) {
        this.fullTree[this._selectSelectedIdx].selected = CheckType.UNCHECKED
      }
      this.fullTree[targetIdx].selected = CheckType.CHECKED
      this._selectSelectedIdx = targetIdx
    } else {
      setCheckedNodeInTree(this.fullTree, id, this.selectType)
    }
  }

  /**
   * 获取所有已选中节点的 JSON（包含完整节点数据）
   * Gets JSON of all checked nodes (full node data)
   * Получает JSON всех выбранных узлов (полные данные)
   */
  getCheckedNodes(): string {
    return getCheckedNodesFromTree(
      this.fullTree,
      this.selectType,
      this.checkedOutputMode
    )
  }

  /**
   * 获取所有已选中节点的 ID（仅 ID，不包含完整节点数据）
   * Gets IDs of all checked/selected nodes (ID only)
   * Получает ID всех выбранных узлов (только ID, без полных данных)
   *
   * CHECKBOX: 返回 JSON 数组 ["id1","id2",...]
   * RADIO/SELECT: 返回单个 ID "id1"
   */
  getCheckedIds(): string {
    return getCheckedIdsFromTree(
      this.fullTree,
      this.selectType,
      this.checkedOutputMode
    )
  }

  /**
   * 清除所有选中状态
   * Clears all check states
   * Сбрасывает все состояния выбора
   */
  clearCheckedNodes(): void {
    clearAllChecked(this.fullTree)
    this._invalidateCache()
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
  }

  // ─── 搜索 / Search / Поиск ───

  /**
   * 模糊搜索：按关键词过滤树并返回可视区域 JSON
   * Fuzzy search: filters tree by keyword and returns viewport JSON
   * Нечёткий поиск: фильтрует дерево по ключевому слову и возвращает JSON viewport
   *
   * 空关键词时切回完整树，从 collapse 状态重建 shown 标志（修复搜索污染问题）；
   * 非空时构建搜索结果树并将 _shownNodes 直接设为搜索结果的引用副本。
   *
   * Empty keyword switches back to full tree, rebuilds shown flags from collapse state;
   * Non-empty builds search result tree and sets _shownNodes directly to search results.
   *
   * Пустое ключевое слово переключает на полное дерево, восстанавливая флаги shown из состояния свёртки;
   * Непустое строит дерево результатов и устанавливает _shownNodes напрямую.
   */
  fuzzySearch(keyword: string): string {
    if (keyword === null || keyword === '') {
      this.tree = this.fullTree
      // 重建 shown 标志：从 collapse 状态恢复，修复搜索时 shown 污染
      // Rebuild shown flags from collapse state, fixing search pollution
      // Восстановление флагов shown из состояния свёртки, исправление загрязнения поиском
      resetShownFlags(this.fullTree)
      // _rebuildShownNodes 会自动更新 shownCount
      // _rebuildShownNodes updates shownCount automatically
      // _rebuildShownNodes обновляет shownCount автоматически
      this._rebuildShownNodes()
      return serializeMpttArray(this.getTmpShown())
    } else {
      this.shownCount = fuzzySearchTree(this.fullTree, this.searchTree, keyword)
      this.tree = this.searchTree
      // 搜索结果所有节点都可见，直接赋给 _shownNodes（不修改 fullTree 的 shown 标志）
      // All search results are visible, assign directly to _shownNodes (no modification of fullTree's shown flag)
      // Все результаты поиска видимы, присваиваем напрямую _shownNodes (без модификации флагов fullTree)
      this._shownNodes.splice(0)
      for (let i: i32 = 0; i < this.searchTree.length; i++) {
        this._shownNodes.push(this.searchTree[i])
      }
      this._invalidateCache()
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
    } else if (type === DisplayType.SEARCH) {
      this.tree = this.searchTree
    }
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
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
    this._invalidateCache()
  }
}
