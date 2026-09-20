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
  resetShownFlags,
} from './tree-visibility'
import {
  checkNodeInTree,
  setCheckedNodesInTree,
  setCheckedNodeInTree,
  getCheckedNodesFromTree,
  getCheckedIdListFromTree,
  getCheckedIdsFromTree,
  clearAllChecked,
} from './tree-check'
import { fuzzySearchTree } from './tree-search'
import { LazyCheckRangeStore } from './lazy-check-range-store'
import {
  serializeShownSlice,
  serializeShownSliceCompact,
  serializeShownIndicesCompact,
  serializeMpttArray,
  serializeMpttArrayCompact,
  serializeCheckedArrayCompact,
} from './tree-serializer'
import { CompactNodeStore } from './compact-store'

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
    rightNodeField: string = 'rightNode',
    preserveExtendData: bool = true
  ) {
    this.root = root
    this.lineHeight = lineHeight > 0 ? lineHeight : 20
    this.selectType = selectType
    this.fieldKeys = new TreeFieldKeys(
      idField,
      nameField,
      parentIdField,
      leftNodeField,
      rightNodeField
    )
    this.preserveExtendData = preserveExtendData
  }

  /** JSON 字段键名配置 / JSON field key configuration / Конфигурация имён полей JSON */
  fieldKeys: TreeFieldKeys
  preserveExtendData: bool = true
  compactStore: CompactNodeStore = new CompactNodeStore()
  lazyCheckRanges: LazyCheckRangeStore = new LazyCheckRangeStore()
  useCompactSelection: bool = true
  useLazyCheckboxRanges: bool = false
  private _hasLazyCheckboxRanges: bool = false
  /** Structural edits may be grouped so compact indexes rebuild only once. */
  private _structureBatchDepth: i32 = 0
  private _structureDirty: bool = false

  setUseCompactSelection(value: bool): void {
    this.useCompactSelection = value
  }

  setUseLazyCheckboxRanges(value: bool): void {
    if (!value) this._materializeLazyCheckboxRanges()
    this.useLazyCheckboxRanges = value
  }

  setCheckedOutputMode(mode: CheckedOutputMode): void {
    if (mode !== CheckedOutputMode.RootOnly)
      this._materializeLazyCheckboxRanges()
    this.checkedOutputMode = mode
  }

  setUseSearchCandidateIndex(value: bool): void {
    this.useSearchCandidateIndex = value
    if (!value) {
      this._searchCandidates.clear()
      this._searchCandidateIndexReady = false
    }
    this._hasSearchCache = false
  }
  /** CHECKBOX 输出 ID 模式（仅影响 getCheckedIds）/ CHECKBOX output ID mode (affects getCheckedIds only) / Режим вывода ID для CHECKBOX (влияет только на getCheckedIds) */
  checkedOutputMode: CheckedOutputMode = CheckedOutputMode.All
  /** 临时邻接表缓冲区（逐条 push 场景） / Temporary adjacency list buffer (for incremental push) / Временный буфер списка смежности (для пошагового push) */
  tmpTree: NeighborTree[] = []
  /** Short-lived mapping for the opt-in chunked input cache bridge. */
  inputOrderToFullIndex: i32[] = []
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

  /** 搜索复用：临时 ID 集合 / Reusable search temp: ID set / Переиспользуемый набор ID для поиска */
  _searchIdSet: Set<string> = new Set<string>()
  /** 搜索复用：临时祖先数组 / Reusable search temp: parent nodes / Переиспользуемый массив предков для поиска */
  _searchParents: MpttTree[] = []
  _searchCandidates: Map<string, i32[]> = new Map<string, i32[]>()
  _searchCandidateIndexReady: bool = false
  // Candidate buckets can halve median search time, but their per-character
  // allocation is too expensive to enable for every tree by default.
  useSearchCandidateIndex: bool = false
  _lastSearchKeyword: string = ''
  _hasSearchCache: bool = false
  /** Collapse state is local to the search view, which initially exposes every matching path. */
  _searchCollapsedIds: Set<string> = new Set<string>()

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

  /** Update display text without changing topology or MPTT boundaries. */
  updateNodeName(id: string, name: string): bool {
    if (!this.idToIndex.has(id)) return false
    const index = this.idToIndex.get(id)
    this.fullTree[index].name = name
    this._invalidateSearchCandidates()
    this._invalidateCache()
    return true
  }

  /** Begins a structural-edit transaction. Calls may be nested. */
  beginStructureBatch(): void {
    this._structureBatchDepth++
  }

  /** Completes a structural-edit transaction and synchronizes derived state once. */
  endStructureBatch(): void {
    if (this._structureBatchDepth <= 0) return
    this._structureBatchDepth--
    if (this._structureBatchDepth === 0 && this._structureDirty) {
      this._structureDirty = false
      this._syncAfterStructureMutation()
    }
  }

  private _finishStructureMutation(): void {
    if (this._structureBatchDepth > 0) {
      this._structureDirty = true
      return
    }
    this._syncAfterStructureMutation()
  }

  private _syncAfterStructureMutation(): void {
    const searchKeyword = this.tree === this.searchTree ? this._lastSearchKeyword : ''
    this.idToIndex = buildIdIndex(this.fullTree)
    this.tree = this.fullTree
    this.searchTree.splice(0)
    this._clearLazyCheckboxRanges()
    this._invalidateSearchCandidates()
    resetShownFlags(this.fullTree)
    this.compactStore.load(this.fullTree)
    this._hasSearchCache = false
    if (searchKeyword.length > 0) this.fuzzySearch(searchKeyword)
    else this._rebuildShownNodes()
  }

  appendChild(id: string, name: string, parentId: string, disabled: bool = false): bool {
    if (!id.length || this.idToIndex.has(id)) return false
    let insertIndex = this.fullTree.length
    let left = this.fullTree.length > 0 ? this.fullTree[this.fullTree.length - 1].rightNode : 1
    let depth: i32 = 0
    if (parentId !== this.root) {
      if (!this.idToIndex.has(parentId)) return false
      const parentIndex = this.idToIndex.get(parentId)
      const parent = this.fullTree[parentIndex]
      // compactStore is intentionally stale inside a structure batch. Find the
      // preorder end from MPTT boundaries so a child added earlier in this
      // transaction can itself receive children.
      insertIndex = parentIndex + 1
      while (
        insertIndex < this.fullTree.length &&
        this.fullTree[insertIndex].leftNode < parent.rightNode
      ) insertIndex++
      left = parent.rightNode - 1
      depth = parent.deep + 1
    }
    for (let i: i32 = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      if (node.leftNode >= left) node.leftNode += 2
      if (node.rightNode >= left) node.rightNode += 2
    }
    const node = new MpttTree()
    node.id = id
    node.name = name
    node.parentId = parentId
    node.disabled = disabled
    node.leftNode = left
    node.rightNode = left + 1
    node.deep = depth
    node.collapsed = true
    this.fullTree.push(node)
    for (let i: i32 = this.fullTree.length - 1; i > insertIndex; i--)
      this.fullTree[i] = this.fullTree[i - 1]
    this.fullTree[insertIndex] = node
    // Keep O(1) lookup valid for the rest of this batch; the compact arrays
    // and visible list are deferred until endStructureBatch().
    for (let i = insertIndex; i < this.fullTree.length; i++)
      this.idToIndex.set(this.fullTree[i].id, i)
    this._finishStructureMutation()
    return true
  }

  removeSubtree(id: string): bool {
    if (!this.idToIndex.has(id)) return false
    const index = this.idToIndex.get(id)
    const target = this.fullTree[index]
    const right = target.rightNode
    const width = target.rightNode - target.leftNode
    let end = index
    while (end < this.fullTree.length && this.fullTree[end].leftNode < right) end++
    for (let i = index; i < end; i++) this.idToIndex.delete(this.fullTree[i].id)
    this.fullTree.splice(index, end - index)
    for (let i: i32 = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      if (node.leftNode >= right) node.leftNode -= width
      if (node.rightNode > right) node.rightNode -= width
    }
    for (let i = index; i < this.fullTree.length; i++)
      this.idToIndex.set(this.fullTree[i].id, i)
    this._finishStructureMutation()
    return true
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
    this.tmpTree = parseTreeFromJson(
      jsonTree,
      this.fieldKeys,
      this.preserveExtendData
    )
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
    this._hasSearchCache = false
    this.setTree(jsonTree)
  }

  setPreserveExtendData(value: bool): void {
    this.preserveExtendData = value
  }

  /**
   * 邻接表→MPTT 转换内部方法
   * Internal method for adjacency list → MPTT conversion
   * Внутренний метод преобразования списка смежности → MPTT
   */
  _convertToMpttTree(neighborTrees: NeighborTree[]): void {
    this.inputOrderToFullIndex = new Array<i32>(neighborTrees.length)
    this.inputOrderToFullIndex.fill(-1)
    convertNeighborToMptt(
      neighborTrees,
      this.root,
      this.fullTree,
      this.inputOrderToFullIndex
    )
    this.idToIndex = buildIdIndex(this.fullTree)
    this.compactStore.load(this.fullTree)
    this._clearLazyCheckboxRanges()
    this._invalidateSearchCandidates()
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
    this._hasSearchCache = false
    this.fullTree.splice(0)
    this.shownCount = parseMpttTreeFromJson(
      tree,
      this.root,
      this.fullTree,
      this.fieldKeys,
      this.preserveExtendData
    )
    this.idToIndex = buildIdIndex(this.fullTree)
    this.compactStore.load(this.fullTree)
    this._clearLazyCheckboxRanges()
    this._invalidateSearchCandidates()
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
    nt.inputIndex = this.tmpTree.length
    this.tmpTree.push(nt)
  }

  /**
   * 批量推入邻接表节点，减少大树加载时的 JS/WASM 边界调用次数。
   * 调用方可以在批次之间让出主线程；仍须以 popNeighbor 完成构建。
   */
  pushNeighborNodes(
    ids: string[],
    names: string[],
    parentIds: string[],
    disabled: bool[]
  ): void {
    let length = ids.length
    if (names.length < length) length = names.length
    if (parentIds.length < length) length = parentIds.length
    for (let i: i32 = 0; i < length; i++) {
      this.pushNeighborNode(
        ids[i],
        names[i],
        parentIds[i],
        i < disabled.length ? disabled[i] : false
      )
    }
  }

  /**
   * Appends adjacency-list records from one UTF-8 payload. Every record starts
   * with four little-endian i32 values: id length, name length, parent ID
   * length, and disabled. This keeps the opt-in browser bridge to one typed
   * array instead of three string arrays plus a boolean array.
   */
  pushNeighborNodesUtf8(payload: Uint8Array): void {
    let cursor: i32 = 0
    while (cursor + 16 <= payload.length) {
      const idLength = this._readLittleEndianI32(payload, cursor)
      const nameLength = this._readLittleEndianI32(payload, cursor + 4)
      const parentIdLength = this._readLittleEndianI32(payload, cursor + 8)
      const disabled = this._readLittleEndianI32(payload, cursor + 12) != 0
      cursor += 16
      if (idLength < 0 || nameLength < 0 || parentIdLength < 0) {
        break
      }
      const idEnd = cursor + idLength
      const nameEnd = idEnd + nameLength
      const parentIdEnd = nameEnd + parentIdLength
      if (parentIdEnd > payload.length) break
      this.pushNeighborNode(
        String.UTF8.decode(payload.slice(cursor, idEnd).buffer),
        String.UTF8.decode(payload.slice(idEnd, nameEnd).buffer),
        String.UTF8.decode(payload.slice(nameEnd, parentIdEnd).buffer),
        disabled
      )
      cursor = parentIdEnd
    }
  }

  private _readLittleEndianI32(payload: Uint8Array, offset: i32): i32 {
    return <i32>(
      (payload[offset] |
        (payload[offset + 1] << 8) |
        (payload[offset + 2] << 16) |
        (payload[offset + 3] << 24))
    )
  }

  /**
   * 完成邻接表批量推入，触发 MPTT 转换
   * Finalizes adjacency list batch push, triggers MPTT conversion
   * Завершает пакетный ввод списка смежности, запускает преобразование в MPTT
   */
  popNeighbor(): void {
    this._hasSearchCache = false
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
    this.compactStore.load(this.fullTree)
    this._clearLazyCheckboxRanges()
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
    this._syncCompactShownIndices()
    this._syncLazyShownStates()
    this._invalidateCache()
  }

  private _buildSearchCandidates(): void {
    this._searchCandidates.clear()
    for (let i: i32 = 0; i < this.fullTree.length; i++) {
      const name = this.fullTree[i].name
      const seen: Set<string> = new Set<string>()
      for (let j: i32 = 0; j < name.length; j++) {
        const key = name.charAt(j)
        if (seen.has(key)) continue
        seen.add(key)
        if (!this._searchCandidates.has(key))
          this._searchCandidates.set(key, [])
        const bucket = this._searchCandidates.get(key)
        bucket.push(i)
      }
    }
    this._searchCandidateIndexReady = true
  }

  private _invalidateSearchCandidates(): void {
    this._searchCandidates.clear()
    this._searchCandidateIndexReady = false
  }

  private _ensureSearchCandidates(): void {
    if (!this._searchCandidateIndexReady) this._buildSearchCandidates()
  }

  _syncCompactShownIndices(): void {
    const indices: i32[] = []
    for (let i: i32 = 0; i < this._shownNodes.length; i++) {
      const node = this._shownNodes[i]
      if (this.idToIndex.has(node.id)) indices.push(this.idToIndex.get(node.id))
    }
    this.compactStore.setShownIndices(indices)
  }

  private _rebuildCompactShownIndicesFromState(): void {
    const indices: i32[] = []
    const boundaries: i32[] = []
    for (let i: i32 = 0; i < this.fullTree.length; i++) {
      const left = this.compactStore.left[i]
      while (boundaries.length > 0 && left >= boundaries[boundaries.length - 1])
        boundaries.pop()
      const visible = boundaries.length === 0
      this.compactStore.shown[i] = visible ? 1 : 0
      this.fullTree[i].shown = visible
      if (!visible) continue
      indices.push(i)
      if (
        this.compactStore.collapsed[i] !== 0 &&
        this.compactStore.right[i] - left > 1
      )
        boundaries.push(this.compactStore.right[i])
    }
    boundaries.splice(0)
    this.compactStore.setShownIndices(indices)
    this._shownNodes.splice(0)
    for (let i: i32 = 0; i < indices.length; i++)
      this._shownNodes.push(this.fullTree[indices[i]])
  }

  private _clearLazyCheckboxRanges(): void {
    this.lazyCheckRanges.clear()
    this._hasLazyCheckboxRanges = false
  }

  private _canApplyLazyCheckboxRange(index: i32, value: CheckType): bool {
    if (
      this.useLazyCheckboxRanges &&
      this.checkedOutputMode === CheckedOutputMode.RootOnly &&
      (value === CheckType.CHECKED || value === CheckType.UNCHECKED) &&
      index >= 0 &&
      !this.compactStore.hasDisabledInSubtree(index)
    ) {
      let ancestor = this.compactStore.parent[index]
      while (ancestor >= 0) {
        if (
          this.lazyCheckRanges.getPoint(this.compactStore.left[ancestor]) >= 0
        )
          return false
        ancestor = this.compactStore.parent[ancestor]
      }
      return true
    }
    return false
  }

  private _checkedStateAt(index: i32): u8 {
    const lazyValue = this.lazyCheckRanges.getPoint(
      this.compactStore.left[index]
    )
    return lazyValue >= 0 ? (lazyValue as u8) : this.compactStore.checked[index]
  }

  private _applyLazyCheckboxRange(index: i32, value: CheckType): void {
    const previousTarget = this._checkedStateAt(index)
    this.lazyCheckRanges.setRange(
      this.compactStore.left[index],
      this.compactStore.right[index],
      value as u8
    )
    this._hasLazyCheckboxRanges = true
    this.compactStore.checked[index] = value as u8
    this.fullTree[index].checked = value
    this.compactStore.childChecked[index] =
      value === CheckType.CHECKED ? this.compactStore.childTotal[index] : 0
    this.compactStore.childHalf[index] = 0

    let child = index
    let childPrevious = previousTarget
    let childNext = value as u8
    let ancestor = this.compactStore.parent[child]
    while (ancestor >= 0) {
      const ancestorPrevious = this._checkedStateAt(ancestor)
      this.compactStore.updateChildState(ancestor, childPrevious, childNext)
      const ancestorNext = this.compactStore.getAggregateState(ancestor)
      this.compactStore.checked[ancestor] = ancestorNext
      this.fullTree[ancestor].checked = ancestorNext as CheckType
      child = ancestor
      childPrevious = ancestorPrevious
      childNext = ancestorNext
      ancestor = this.compactStore.parent[child]
    }
    this._syncLazyShownStates()
  }

  private _syncLazyShownStates(): void {
    if (!this._hasLazyCheckboxRanges) return
    for (let i: i32 = 0; i < this.compactStore.shownLength; i++) {
      const index = this.compactStore.shownIndices[i]
      const value = this.lazyCheckRanges.getPoint(this.compactStore.left[index])
      if (value >= 0) {
        this.compactStore.checked[index] = value as u8
        this.fullTree[index].checked = value as CheckType
      }
    }
  }

  private _materializeLazyCheckboxRanges(): void {
    if (!this._hasLazyCheckboxRanges) return
    for (let i: i32 = 0; i < this.fullTree.length; i++) {
      const value = this.lazyCheckRanges.getPoint(this.compactStore.left[i])
      if (value >= 0) {
        this.compactStore.checked[i] = value as u8
        this.fullTree[i].checked = value as CheckType
      }
    }
    this.compactStore.syncSelection(this.fullTree)
    this._clearLazyCheckboxRanges()
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
  private _hasCompactDisabledNodes(): bool {
    // Object flags remain the compatibility authority for disabled nodes until
    // the direct-input compact loader is migrated; this guards mixed inputs.
    for (let i: i32 = 0; i < this.fullTree.length; i++) {
      if (this.fullTree[i].disabled) return true
    }
    return false
  }

  collapseTree(id: string, collapsed: boolean): void {
    if (!this.idToIndex.has(id)) return
    const i: i32 = this.idToIndex.get(id)
    const node: MpttTree = this.fullTree[i]

    if (this.tree === this.searchTree) {
      if (collapsed) this._searchCollapsedIds.add(id)
      else this._searchCollapsedIds.delete(id)
      // 搜索模式：从 searchTree 重建 _shownNodes，尊重折叠状态
      // 不修改 fullTree 的 shown 标志（搜索模式下 _shownNodes 与 shown 标志无关）
      // Search mode: rebuild _shownNodes from searchTree, respecting collapse state
      this._shownNodes.splice(0)
      this.shownCount = 0
      const boundaries: i32[] = []
      for (let j: i32 = 0; j < this.searchTree.length; j++) {
        const n: MpttTree = this.searchTree[j]
        while (
          boundaries.length > 0 &&
          n.leftNode >= boundaries[boundaries.length - 1]
        ) {
          boundaries.pop()
        }
        if (boundaries.length === 0) {
          this._shownNodes.push(n)
          this.shownCount++
          if (
            this._searchCollapsedIds.has(n.id) &&
            n.rightNode - n.leftNode > 1
          ) {
            boundaries.push(n.rightNode)
          }
        }
      }
      boundaries.splice(0)
      this._syncCompactShownIndices()
      this._syncLazyShownStates()
    } else {
      this._hasSearchCache = false
      node.collapsed = collapsed
      if (this.useCompactSelection && i < this.compactStore.collapsed.length) {
        this.compactStore.collapsed[i] = collapsed ? 1 : 0
      }
      // 正常模式：增量更新 fullTree 子树的 shown 标志和 _shownNodes
      // Normal mode: incrementally update fullTree subtree shown flags and _shownNodes
      if (this.useCompactSelection) {
        this._rebuildCompactShownIndicesFromState()
        this.shownCount = this.compactStore.shownLength
      } else {
        const delta: i32 = setCollapsedShown(
          this.fullTree,
          i + 1,
          node.rightNode,
          !collapsed
        )
        incrementalUpdateShownNodes(
          this._shownNodes,
          this.fullTree,
          i,
          node.leftNode,
          node.rightNode,
          !collapsed
        )
        this.shownCount += delta
        this._syncCompactShownIndices()
      }
      this._syncLazyShownStates()
    }
    this._invalidateCache()
  }

  /**
   * 全部展开/全部折叠
   * Expand all / Collapse all
   * Развернуть все / Свернуть все
   */
  collapseAll(collapsed: boolean): void {
    if (this.tree === this.searchTree) {
      this._searchCollapsedIds.clear()
      if (collapsed) {
        for (let i: i32 = 0; i < this.searchTree.length; i++) {
          const node = this.searchTree[i]
          if (node.rightNode - node.leftNode > 1)
            this._searchCollapsedIds.add(node.id)
        }
      }
      this._shownNodes.splice(0)
      this.shownCount = 0
      const boundaries: i32[] = []
      for (let i: i32 = 0; i < this.searchTree.length; i++) {
        const node = this.searchTree[i]
        while (
          boundaries.length > 0 &&
          node.leftNode >= boundaries[boundaries.length - 1]
        )
          boundaries.pop()
        if (boundaries.length === 0) {
          this._shownNodes.push(node)
          this.shownCount++
          if (this._searchCollapsedIds.has(node.id))
            boundaries.push(node.rightNode)
        }
      }
      this._syncCompactShownIndices()
      this._syncLazyShownStates()
      this._invalidateCache()
      return
    }

    this._shownNodes.splice(0)
    this.shownCount = 0
    for (let i = 0; i < this.fullTree.length; i++) {
      const node: MpttTree = this.fullTree[i]
      node.collapsed = collapsed
      node.shown = !collapsed || node.parentId === this.root
      if (this.useCompactSelection && i < this.compactStore.collapsed.length) {
        this.compactStore.collapsed[i] = collapsed ? 1 : 0
        this.compactStore.shown[i] = node.shown ? 1 : 0
      }
      if (node.shown) {
        this._shownNodes.push(node)
        this.shownCount++
      }
    }
    this._syncCompactShownIndices()
    this._syncLazyShownStates()
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
    this._syncLazyShownStates()
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

    const json: string = this.useCompactSelection
      ? serializeShownIndicesCompact(
          this.fullTree,
          this.compactStore.shownIndices,
          this.compactStore.shownLength,
          this.compactStore,
          this.scrollTop,
          this.scrollHeight,
          this.lineHeight
        )
      : serializeShownSlice(
          this._shownNodes,
          this.scrollTop,
          this.scrollHeight,
          this.lineHeight
        )

    this._cachedStartIdx = startIdx
    this._cachedEndIdx = endIdx
    this._cachedJson = json
    this._cacheValid = true

    return json
  }

  getAllNodes(): string {
    return this.useCompactSelection
      ? serializeMpttArrayCompact(this.fullTree, this.compactStore)
      : serializeMpttArray(this.fullTree)
  }

  getCompactMemoryBytes(): i32 {
    return this.compactStore.memoryBytes()
  }

  getCompactMirrorBytes(): i32 {
    return this.compactStore.mirrorBytes()
  }

  // UTF-16 payload only: excludes object headers, references, and allocator metadata.
  getObjectStringPayloadBytes(): i32 {
    let chars: i32 = 0
    for (let i: i32 = 0; i < this.fullTree.length; i++) {
      const node = this.fullTree[i]
      chars +=
        node.id.length +
        node.name.length +
        node.parentId.length +
        node.extendData.length
    }
    return chars << 1
  }

  canUseLazyCheckboxRange(id: string): bool {
    if (this.selectType !== SelectType.CHECKBOX || !this.idToIndex.has(id))
      return false
    return !this.compactStore.hasDisabledInSubtree(this.idToIndex.get(id))
  }

  getShownIndices(): i32[] {
    const startIdx: i32 = <i32>Math.floor(this.scrollTop / this.lineHeight)
    const endIdx: i32 =
      <i32>Math.ceil((this.scrollTop + this.scrollHeight) / this.lineHeight) + 1
    const clampedStart: i32 =
      startIdx < 0
        ? 0
        : startIdx >= this._shownNodes.length
          ? this._shownNodes.length
          : startIdx
    const clampedEnd: i32 =
      endIdx < 0
        ? 0
        : endIdx > this._shownNodes.length
          ? this._shownNodes.length
          : endIdx
    return this.compactStore.getShownIndices(clampedStart, clampedEnd)
  }

  /**
   * Returns packed checked/selected state for caller-supplied full-tree indices.
   * This lets the virtual list refresh a viewport without serializing every node.
   */
  getNodeSelectionStates(indices: i32[]): i32[] {
    this._syncLazyShownStates()
    const states: i32[] = []
    for (let i: i32 = 0; i < indices.length; i++) {
      const index = indices[i]
      if (index < 0 || index >= this.fullTree.length) {
        states.push(0)
        continue
      }
      const checked = this.useCompactSelection
        ? this.compactStore.checked[index]
        : (this.fullTree[index].checked as u8)
      const selected = this.useCompactSelection
        ? this.compactStore.selected[index]
        : (this.fullTree[index].selected as u8)
      states.push(((checked as i32) << 8) | (selected as i32))
    }
    return states
  }

  /** Returns the effective collapsed state for full-tree indices in the active view. */
  getNodeCollapsedStates(indices: i32[]): i32[] {
    const states: i32[] = []
    for (let i: i32 = 0; i < indices.length; i++) {
      const index = indices[i]
      if (index < 0 || index >= this.fullTree.length) {
        states.push(0)
        continue
      }
      const collapsed =
        this.tree === this.searchTree
          ? this._searchCollapsedIds.has(this.fullTree[index].id)
          : this.useCompactSelection
            ? this.compactStore.collapsed[index] !== 0
            : this.fullTree[index].collapsed
      states.push(collapsed ? 1 : 0)
    }
    return states
  }
  /**
   * Returns compact presentation metadata for input IDs in five-value records:
   * full-tree index, left, right, depth and effective disabled flag.
   */
  getNodeLayouts(ids: string[]): i32[] {
    const layouts: i32[] = []
    for (let i: i32 = 0; i < ids.length; i++) {
      const index = this.idToIndex.has(ids[i]) ? this.idToIndex.get(ids[i]) : -1
      layouts.push(index)
      if (index < 0 || index >= this.compactStore.left.length) {
        layouts.push(0)
        layouts.push(0)
        layouts.push(0)
        layouts.push(0)
        continue
      }
      layouts.push(this.compactStore.left[index])
      layouts.push(this.compactStore.right[index])
      layouts.push(this.compactStore.depth[index])
      layouts.push(this.compactStore.disabled[index])
    }
    return layouts
  }

  /** Returns all full-tree IDs in MPTT order without serializing node JSON. */
  getAllNodeIds(): string[] {
    const ids: string[] = []
    for (let i: i32 = 0; i < this.fullTree.length; i++)
      ids.push(this.fullTree[i].id)
    return ids
  }

  /** Returns left, right, depth and effective disabled flag in MPTT order. */
  getAllNodeLayouts(): i32[] {
    const layouts: i32[] = []
    for (let i: i32 = 0; i < this.compactStore.left.length; i++) {
      layouts.push(this.compactStore.left[i])
      layouts.push(this.compactStore.right[i])
      layouts.push(this.compactStore.depth[i])
      layouts.push(this.compactStore.disabled[i])
    }
    return layouts
  }

  /**
   * Returns full-tree index, left, right, depth and disabled flag in the
   * original batch-input order. The mapping can be released after one read.
   */
  getInputNodeLayouts(): i32[] {
    const layouts: i32[] = []
    for (let i: i32 = 0; i < this.inputOrderToFullIndex.length; i++) {
      const index = this.inputOrderToFullIndex[i]
      layouts.push(index)
      if (index < 0 || index >= this.compactStore.left.length) {
        layouts.push(0)
        layouts.push(0)
        layouts.push(0)
        layouts.push(0)
        continue
      }
      layouts.push(this.compactStore.left[index])
      layouts.push(this.compactStore.right[index])
      layouts.push(this.compactStore.depth[index])
      layouts.push(this.compactStore.disabled[index])
    }
    return layouts
  }

  clearInputNodeLayouts(): void {
    this.inputOrderToFullIndex.splice(0)
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
    this._hasSearchCache = false
    this._invalidateCache()

    // RADIO: 用缓存索引 O(1) 替代全树 O(N) 扫描
    // RADIO: use cached index O(1) instead of full tree O(N) scan
    if (this.selectType === SelectType.RADIO) {
      if (!this.idToIndex.has(id)) {
        return serializeShownSlice(
          this._shownNodes,
          this.scrollTop,
          this.scrollHeight,
          this.lineHeight
        )
      }
      const targetIdx: i32 = this.idToIndex.get(id)
      if (
        this.useCompactSelection
          ? this.compactStore.disabled[targetIdx] !== 0
          : this.fullTree[targetIdx].disabled
      ) {
        return serializeShownSlice(
          this._shownNodes,
          this.scrollTop,
          this.scrollHeight,
          this.lineHeight
        )
      }
      if (this._radioCheckedIdx >= 0 && this._radioCheckedIdx !== targetIdx) {
        this.fullTree[this._radioCheckedIdx].checked = CheckType.UNCHECKED
        if (this.useCompactSelection)
          this.compactStore.setChecked(
            this._radioCheckedIdx,
            CheckType.UNCHECKED as u8
          )
      }
      this.fullTree[targetIdx].checked = checked
      if (this.useCompactSelection)
        this.compactStore.setChecked(targetIdx, checked as u8)
      this._radioCheckedIdx = targetIdx
    } else if (this.selectType === SelectType.SELECT) {
      if (!this.idToIndex.has(id)) {
        return serializeShownSlice(
          this._shownNodes,
          this.scrollTop,
          this.scrollHeight,
          this.lineHeight
        )
      }
      const targetIdx: i32 = this.idToIndex.get(id)
      if (this.fullTree[targetIdx].disabled) {
        return serializeShownSlice(
          this._shownNodes,
          this.scrollTop,
          this.scrollHeight,
          this.lineHeight
        )
      }
      if (
        this._selectSelectedIdx >= 0 &&
        this._selectSelectedIdx !== targetIdx
      ) {
        this.fullTree[this._selectSelectedIdx].selected = CheckType.UNCHECKED
        if (this.useCompactSelection)
          this.compactStore.setSelected(
            this._selectSelectedIdx,
            CheckType.UNCHECKED as u8
          )
      }
      this.fullTree[targetIdx].selected = checked
      if (this.useCompactSelection)
        this.compactStore.setSelected(targetIdx, checked as u8)
      this._selectSelectedIdx = targetIdx
    } else {
      const targetIdx: i32 = this.idToIndex.has(id)
        ? this.idToIndex.get(id)
        : -1
      if (this._canApplyLazyCheckboxRange(targetIdx, checked)) {
        this._applyLazyCheckboxRange(targetIdx, checked)
      } else {
        this._materializeLazyCheckboxRanges()
        if (targetIdx >= 0 && this.useCompactSelection) {
          this.compactStore.checkCheckbox(
            this.fullTree,
            targetIdx,
            checked as u8
          )
        } else {
          checkNodeInTree(
            this.fullTree,
            this.idToIndex,
            id,
            checked,
            this.selectType
          )
        }
      }
    }

    return serializeShownSlice(
      this._shownNodes,
      this.scrollTop,
      this.scrollHeight,
      this.lineHeight
    )
  }

  /**
   * 批量设置选中节点（CHECKBOX 模式）
   * Batch set checked nodes (CHECKBOX mode)
   * Пакетная установка выбранных узлов (режим CHECKBOX)
   */
  setCheckedNodes(ids: string[]): void {
    this._materializeLazyCheckboxRanges()
    if (
      this.selectType === SelectType.CHECKBOX &&
      this.useCompactSelection &&
      !this._hasCompactDisabledNodes()
    ) {
      this.compactStore.resetCheckboxSelection(this.fullTree)
      for (let i: i32 = 0; i < ids.length; i++) {
        const id = ids[i]
        if (!this.idToIndex.has(id)) continue
        this.compactStore.checkCheckbox(
          this.fullTree,
          this.idToIndex.get(id),
          CheckType.CHECKED as u8
        )
      }
    } else {
      setCheckedNodesInTree(this.fullTree, ids, this.idToIndex)
      if (this.useCompactSelection)
        this.compactStore.syncSelection(this.fullTree)
    }
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
    if (this.selectType === SelectType.CHECKBOX) {
      this.checkNode(id, CheckType.CHECKED)
      return
    }
    this._invalidateCache()
    // RADIO/SELECT: 缓存索引 O(1) 路径
    // RADIO/SELECT: cached index O(1) path
    // RADIO/SELECT: путь с кэшированным индексом O(1)
    if (this.selectType === SelectType.RADIO) {
      if (!this.idToIndex.has(id)) return
      const targetIdx: i32 = this.idToIndex.get(id)
      if (
        this.useCompactSelection
          ? this.compactStore.disabled[targetIdx] !== 0
          : this.fullTree[targetIdx].disabled
      )
        return
      if (this._radioCheckedIdx >= 0 && this._radioCheckedIdx !== targetIdx) {
        this.fullTree[this._radioCheckedIdx].checked = CheckType.UNCHECKED
        if (this.useCompactSelection)
          this.compactStore.setChecked(
            this._radioCheckedIdx,
            CheckType.UNCHECKED as u8
          )
      }
      this.fullTree[targetIdx].checked = CheckType.CHECKED
      if (this.useCompactSelection)
        this.compactStore.setChecked(targetIdx, CheckType.CHECKED as u8)
      this._radioCheckedIdx = targetIdx
    } else if (this.selectType === SelectType.SELECT) {
      if (!this.idToIndex.has(id)) return
      const targetIdx: i32 = this.idToIndex.get(id)
      if (
        this.useCompactSelection
          ? this.compactStore.disabled[targetIdx] !== 0
          : this.fullTree[targetIdx].disabled
      )
        return
      if (
        this._selectSelectedIdx >= 0 &&
        this._selectSelectedIdx !== targetIdx
      ) {
        this.fullTree[this._selectSelectedIdx].selected = CheckType.UNCHECKED
        if (this.useCompactSelection)
          this.compactStore.setSelected(
            this._selectSelectedIdx,
            CheckType.UNCHECKED as u8
          )
      }
      this.fullTree[targetIdx].selected = CheckType.CHECKED
      if (this.useCompactSelection)
        this.compactStore.setSelected(targetIdx, CheckType.CHECKED as u8)
      this._selectSelectedIdx = targetIdx
    } else {
      const resultIdx = setCheckedNodeInTree(
        this.fullTree,
        id,
        this.selectType,
        this.idToIndex,
        this._radioCheckedIdx,
        this._selectSelectedIdx
      )
      if (this.selectType === SelectType.RADIO) {
        this._radioCheckedIdx = resultIdx
      } else if (this.selectType === SelectType.SELECT) {
        this._selectSelectedIdx = resultIdx
      }
    }
  }

  /**
   * 获取所有已选中节点的 JSON（包含完整节点数据）
   * Gets JSON of all checked nodes (full node data)
   * Получает JSON всех выбранных узлов (полные данные)
   */
  getCheckedNodes(): string {
    this._materializeLazyCheckboxRanges()
    if (
      this.useCompactSelection &&
      this.selectType === SelectType.CHECKBOX &&
      !this._hasCompactDisabledNodes()
    ) {
      const indices: i32[] = []
      const covered: i32[] = []
      for (let i: i32 = 0; i < this.fullTree.length; i++) {
        while (
          covered.length > 0 &&
          this.compactStore.left[i] >= covered[covered.length - 1]
        )
          covered.pop()
        if (this.compactStore.checked[i] !== CheckType.CHECKED) continue
        if (
          this.checkedOutputMode === CheckedOutputMode.RootOnly &&
          covered.length > 0
        )
          continue
        if (
          this.checkedOutputMode !== CheckedOutputMode.LeafOnly ||
          this.compactStore.right[i] - this.compactStore.left[i] === 1
        )
          indices.push(i)
        if (this.checkedOutputMode === CheckedOutputMode.RootOnly)
          covered.push(this.compactStore.right[i])
      }
      return serializeCheckedArrayCompact(
        this.fullTree,
        indices,
        this.compactStore
      )
    }
    return getCheckedNodesFromTree(
      this.fullTree,
      this.selectType,
      this.checkedOutputMode,
      this._radioCheckedIdx,
      this._selectSelectedIdx
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
    if (this.checkedOutputMode !== CheckedOutputMode.RootOnly)
      this._materializeLazyCheckboxRanges()
    return getCheckedIdsFromTree(
      this.fullTree,
      this.selectType,
      this.checkedOutputMode,
      this._radioCheckedIdx,
      this._selectSelectedIdx
    )
  }

  getCheckedIdList(): string[] {
    if (this.checkedOutputMode !== CheckedOutputMode.RootOnly)
      this._materializeLazyCheckboxRanges()
    if (this.useCompactSelection && !this._hasCompactDisabledNodes()) {
      if (this.selectType === SelectType.RADIO) {
        const index = this._radioCheckedIdx
        if (
          index >= 0 &&
          index < this.compactStore.checked.length &&
          this.compactStore.checked[index] === CheckType.CHECKED
        )
          return [this.fullTree[index].id]
        return []
      }
      if (this.selectType === SelectType.SELECT) {
        const index = this._selectSelectedIdx
        if (
          index >= 0 &&
          index < this.compactStore.selected.length &&
          this.compactStore.selected[index] === CheckType.CHECKED
        )
          return [this.fullTree[index].id]
        return []
      }
      const ids: string[] = []
      const covered: i32[] = []
      for (let i: i32 = 0; i < this.fullTree.length; i++) {
        while (
          covered.length > 0 &&
          this.compactStore.left[i] >= covered[covered.length - 1]
        )
          covered.pop()
        if (this.compactStore.checked[i] !== CheckType.CHECKED) continue
        if (
          this.checkedOutputMode === CheckedOutputMode.RootOnly &&
          covered.length > 0
        )
          continue
        if (
          this.checkedOutputMode !== CheckedOutputMode.LeafOnly ||
          this.compactStore.right[i] - this.compactStore.left[i] === 1
        )
          ids.push(this.fullTree[i].id)
        if (this.checkedOutputMode === CheckedOutputMode.RootOnly)
          covered.push(this.compactStore.right[i])
      }
      return ids
    }
    return getCheckedIdListFromTree(
      this.fullTree,
      this.selectType,
      this.checkedOutputMode,
      this._radioCheckedIdx,
      this._selectSelectedIdx
    )
  }

  /**
   * 清除所有选中状态
   * Clears all check states
   * Сбрасывает все состояния выбора
   */
  clearCheckedNodes(): void {
    this._hasSearchCache = false
    clearAllChecked(this.fullTree)
    this._clearLazyCheckboxRanges()
    if (this.useCompactSelection) this.compactStore.syncSelection(this.fullTree)
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
      this._searchCollapsedIds.clear()
      this.tree = this.fullTree
      // 重建 shown 标志：从 collapse 状态恢复，修复搜索时 shown 污染
      // Rebuild shown flags from collapse state, fixing search pollution
      // Восстановление флагов shown из состояния свёртки, исправление загрязнения поиском
      resetShownFlags(this.fullTree)
      this._rebuildShownNodes()
      return serializeShownSlice(
        this._shownNodes,
        this.scrollTop,
        this.scrollHeight,
        this.lineHeight
      )
    } else {
      if (!this._hasSearchCache || this._lastSearchKeyword !== keyword) {
        this._searchCollapsedIds.clear()
        if (this.useSearchCandidateIndex) this._ensureSearchCandidates()
        this.shownCount = fuzzySearchTree(
          this.fullTree,
          this.searchTree,
          keyword,
          this._searchIdSet,
          this._searchParents,
          this.useSearchCandidateIndex ? this._searchCandidates : null,
          this.compactStore.parent
        )
        this._lastSearchKeyword = keyword
        this._hasSearchCache = true
      } else {
        this.shownCount = this.searchTree.length as i32
      }
      this.tree = this.searchTree
      this._shownNodes.splice(0)
      for (let i: i32 = 0; i < this.searchTree.length; i++) {
        this._shownNodes.push(this.searchTree[i])
      }
      this._syncCompactShownIndices()
      this._syncLazyShownStates()
      this._invalidateCache()
      return serializeShownSlice(
        this._shownNodes,
        this.scrollTop,
        this.scrollHeight,
        this.lineHeight
      )
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
    this._hasSearchCache = false
    this.fullTree.splice(0)
    this.searchTree.splice(0)
    this.tree = this.fullTree
    this.tmpTree.splice(0)
    this.inputOrderToFullIndex.splice(0)
    this.shownCount = 0
    this.idToIndex.clear()
    this._invalidateSearchCandidates()
    this._clearLazyCheckboxRanges()
    this._shownNodes.splice(0)
    this.compactStore.setShownIndices([])
    this._radioCheckedIdx = -1
    this._selectSelectedIdx = -1
    this._invalidateCache()
  }
}
