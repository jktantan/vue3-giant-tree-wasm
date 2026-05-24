import { MpttTree } from './models'

/**
 * 全量重建可见节点数组：遍历当前显示树，收集所有 shown===true 的节点
 * Full rebuild of visible nodes array: traverse current display tree, collect all shown===true nodes
 * Полная перестройка массива видимых узлов: обход текущего дерева отображения, сбор всех узлов с shown===true
 *
 * 复杂度 O(N)，用于初始化、collapseAll、搜索等全量操作
 * Complexity O(N), used for initialization, collapseAll, search and other full-scan operations
 * Сложность O(N), используется для инициализации, collapseAll, поиска и других полных операций
 *
 * @param tree - 当前显示树（fullTree 或 searchTree） / Current display tree (fullTree or searchTree) / Текущее дерево отображения (fullTree или searchTree)
 * @returns 新的可见节点数组 / New visible nodes array / Новый массив видимых узлов
 */
export function rebuildShownNodes(tree: MpttTree[]): MpttTree[] {
  const shownNodes: MpttTree[] = []
  for (let i: i32 = 0; i < tree.length; i++) {
    if (tree[i].shown) {
      shownNodes.push(tree[i])
    }
  }
  return shownNodes
}

/**
 * 重新计算可见节点总数
 * Recalculates total visible node count
 * Пересчитывает общее количество видимых узлов
 *
 * @param tree - 当前显示树 / Current display tree / Текущее дерево отображения
 * @returns 可见节点数 / Visible node count / Количество видимых узлов
 */
export function recalcShownCount(tree: MpttTree[]): i32 {
  let count: i32 = 0
  for (let i: i32 = 0; i < tree.length; i++) {
    if (tree[i].shown) count++
  }
  return count
}

/**
 * 从折叠状态重建整棵树的 shown 标志（不依赖已有 shown 值）。
 * 用于搜索结果清空后恢复正确可见性，修复搜索时 shown 标志被污染的问题。
 *
 * Rebuilds all node shown flags from collapse state (does not depend on existing shown values).
 * Used to restore correct visibility after clearing search results, fixing the shown-flag pollution issue.
 *
 * Перестраивает флаги shown всех узлов из состояния свёртки (не зависит от существующих значений shown).
 * Используется для восстановления корректной видимости после очистки поиска.
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @returns 可见节点总数 / Total visible node count / Общее количество видимых узлов
 */
export function resetShownFlags(fullTree: MpttTree[]): i32 {
  let count: i32 = 0

  // 先全部重置
  // Reset all to false first
  // Сброс всех в false
  for (let i: i32 = 0; i < fullTree.length; i++) {
    fullTree[i].shown = false
  }

  // 用栈跟踪折叠祖先的 rightNode，单次遍历重建 shown
  // Single-pass rebuild using stack to track collapsed ancestors' rightNode
  // Одноразовый проход со стеком для отслеживания rightNode свёрнутых предков
  const collapsedBoundaries: i32[] = []

  for (let i: i32 = 0; i < fullTree.length; i++) {
    const node: MpttTree = fullTree[i]

    // 弹出超出范围的折叠边界
    // Pop collapsed boundaries that are out of range
    // Извлечение границ свёртки, вышедших за пределы
    while (
      collapsedBoundaries.length > 0 &&
      node.leftNode >= collapsedBoundaries[collapsedBoundaries.length - 1]
    ) {
      collapsedBoundaries.pop()
    }

    if (collapsedBoundaries.length === 0) {
      // 没有折叠的祖先 → 节点可见
      // No collapsed ancestor → node is visible
      // Нет свёрнутых предков → узел видим
      node.shown = true
      count++

      // 如果该节点自身折叠且有子节点，压入折叠边界
      // If node itself is collapsed and has children, push collapse boundary
      // Если узел свёрнут и имеет потомков, поместить границу свёртки в стек
      if (node.collapsed && node.rightNode - node.leftNode > 1) {
        collapsedBoundaries.push(node.rightNode)
      }
    }
  }

  collapsedBoundaries.splice(0)
  return count
}

/**
 * 非递归设置子树的显示状态：单次遍历 + 栈跟踪折叠边界
 * Non-recursive subtree visibility setter: single pass + stack tracking collapsed boundaries
 * Нерекурсивная установка видимости поддерева: один проход + стек отслеживания свёрнутых границ
 *
 * 利用 MPTT 性质：子树在 fullTree 中按 leftNode 连续排列，
 * 遇到 leftNode >= parentRightNode 即可提前终止。
 * 通过 collapsedBoundaries 栈跟踪嵌套折叠节点，
 * 栈非空时子节点不可见（被祖先折叠覆盖）。
 *
 * Leverages MPTT property: subtree is contiguous in fullTree by leftNode.
 * Terminates early when leftNode >= parentRightNode.
 * Uses collapsedBoundaries stack to track nested collapsed nodes;
 * when stack is non-empty, children are hidden (overridden by ancestor collapse).
 *
 * Использует свойство MPTT: поддерево непрерывно в fullTree по leftNode.
 * Досрочное завершение при leftNode >= parentRightNode.
 * Стек collapsedBoundaries отслеживает вложенные свёрнутые узлы;
 * при непустом стеке дочерние скрыты (перекрыты свёрткой предка).
 *
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param startIndex - 起始索引（父节点的下一个位置） / Start index (next position after parent) / Начальный индекс (следующая позиция после родителя)
 * @param parentRightNode - 父节点的 rightNode，用于确定子树边界 / Parent's rightNode for subtree boundary / rightNode родителя для определения границы поддерева
 * @param shown - 目标显示状态 / Target visibility state / Целевое состояние видимости
 * @returns shownCount 的变化量（正数表示增加，负数表示减少） / Change in shownCount (positive=increase, negative=decrease) / Изменение shownCount (положительное=увеличение, отрицательное=уменьшение)
 */
export function setCollapsedShown(
  fullTree: MpttTree[],
  startIndex: i32,
  parentRightNode: i32,
  shown: boolean
): i32 {
  let shownDelta: i32 = 0

  // 折叠边界栈：存储已折叠祖先节点的 rightNode
  // Collapsed boundary stack: stores rightNode of collapsed ancestors
  // Стек границ свёртки: хранит rightNode свёрнутых предков
  const collapsedBoundaries: i32[] = []

  for (let i: i32 = startIndex; i < fullTree.length; i++) {
    const node: MpttTree = fullTree[i]

    // MPTT 边界检查：超出子树范围则终止
    // MPTT boundary check: beyond subtree range, terminate
    // Проверка границы MPTT: за пределами поддерева, завершение
    if (node.leftNode >= parentRightNode) break

    // 弹出已超出范围的折叠边界
    // Pop collapsed boundaries that are out of range
    // Извлечение границ свёртки, вышедших за пределы
    while (
      collapsedBoundaries.length > 0 &&
      node.leftNode >= collapsedBoundaries[collapsedBoundaries.length - 1]
    ) {
      collapsedBoundaries.pop()
    }

    if (collapsedBoundaries.length > 0) {
      // 当前节点在某个折叠祖先内部：折叠时隐藏，展开时不处理
      // Node inside a collapsed ancestor: hide when collapsing, skip when expanding
      // Узел внутри свёрнутого предка: скрыть при свёртке, пропустить при развёртке
      if (!shown) {
        if (node.shown) {
          node.shown = false
          shownDelta--
        }
      }
    } else {
      // 当前节点不在任何折叠祖先内部：直接设置目标状态
      // Node not inside any collapsed ancestor: set target state directly
      // Узел не внутри свёрнутого предка: установить целевое состояние напрямую
      const prevShown: boolean = node.shown
      node.shown = shown
      if (shown && !prevShown) shownDelta++
      if (!shown && prevShown) shownDelta--

      // 展开时，如果该节点自身是折叠的且有子节点，压入折叠边界
      // When expanding, if node is collapsed with children, push collapse boundary
      // При развёртке, если узел свёрнут и имеет потомков, поместить границу свёртки в стек
      if (shown && node.collapsed && node.rightNode - node.leftNode > 1) {
        collapsedBoundaries.push(node.rightNode)
      }
    }
  }
  return shownDelta
}

/**
 * 增量维护可见节点数组：展开时插入子节点，折叠时移除子节点
 * Incremental maintenance of visible nodes array: insert children on expand, remove on collapse
 * Инкрементное обновление массива видимых узлов: вставка потомков при развёртке, удаление при свёртке
 *
 * 相比全量重建 O(N)，增量维护为 O(子树大小 + log N)
 * Compared to full rebuild O(N), incremental is O(subtree + log N)
 * По сравнению с полной перестройкой O(N), инкрементное O(поддерево + log N)
 *
 * @param shownNodes - 当前可见节点数组（就地修改） / Current visible nodes array (modified in-place) / Текущий массив видимых узлов (модификация на месте)
 * @param fullTree - 完整树数组 / Full tree array / Полный массив дерева
 * @param parentFullTreeIndex - 父节点在 fullTree 中的索引 / Parent index in fullTree / Индекс родителя в fullTree
 * @param parentLeftNode - 父节点的 leftNode / Parent's leftNode / leftNode родителя
 * @param parentRightNode - 父节点的 rightNode / Parent's rightNode / rightNode родителя
 * @param expanded - true=展开(插入), false=折叠(移除) / true=expand(insert), false=collapse(remove) / true=развёртка(вставка), false=свёртка(удаление)
 */
export function incrementalUpdateShownNodes(
  shownNodes: MpttTree[],
  fullTree: MpttTree[],
  parentFullTreeIndex: i32,
  parentLeftNode: i32,
  parentRightNode: i32,
  expanded: boolean
): void {
  const parentNode: MpttTree = fullTree[parentFullTreeIndex]

  if (expanded) {
    // 展开：收集子树中新变为 shown 的节点
    // Expand: collect newly shown nodes in subtree
    // Развёртка: собрать новые видимые узлы в поддереве
    const toInsert: MpttTree[] = []
    for (let i: i32 = parentFullTreeIndex + 1; i < fullTree.length; i++) {
      const node: MpttTree = fullTree[i]
      if (node.leftNode >= parentRightNode) break
      if (node.shown) {
        toInsert.push(node)
      }
    }
    if (toInsert.length === 0) return

    // 二分查找父节点位置，插入点为其后一位
    // Binary search parent position, insert after it
    // Бинарный поиск позиции родителя, вставка после него
    const insertPos: i32 =
      binarySearchShownNodes(shownNodes, parentNode.leftNode) + 1

    // 批量插入：扩展 → 后移 → 填充
    // Batch insert: extend → shift back → fill
    // Пакетная вставка: расширить → сдвинуть → заполнить
    const oldLen: i32 = shownNodes.length
    const addCount: i32 = toInsert.length
    for (let k: i32 = 0; k < addCount; k++) {
      shownNodes.push(toInsert[0])
    }
    for (let k: i32 = oldLen - 1; k >= insertPos; k--) {
      shownNodes[k + addCount] = shownNodes[k]
    }
    for (let k: i32 = 0; k < addCount; k++) {
      shownNodes[insertPos + k] = toInsert[k]
    }
  } else {
    // 折叠：找到子节点范围并批量移除
    // Collapse: find child range and batch remove
    // Свёртка: найти диапазон потомков и пакетно удалить
    const parentShownIdx: i32 = binarySearchShownNodes(
      shownNodes,
      parentNode.leftNode
    )
    if (parentShownIdx < 0) return

    const removeStart: i32 = parentShownIdx + 1
    let removeEnd: i32 = removeStart
    while (removeEnd < shownNodes.length) {
      const node: MpttTree = shownNodes[removeEnd]
      if (node.leftNode < parentLeftNode || node.leftNode >= parentRightNode)
        break
      removeEnd++
    }

    const removeCount: i32 = removeEnd - removeStart
    if (removeCount > 0) {
      for (let k: i32 = removeEnd; k < shownNodes.length; k++) {
        shownNodes[k - removeCount] = shownNodes[k]
      }
      shownNodes.splice(shownNodes.length - removeCount)
    }
  }
}

/**
 * 二分查找：在可见节点数组中查找 leftNode 等于目标值的索引
 * Binary search: find index in visible nodes array where leftNode equals target
 * Бинарный поиск: найти индекс в массиве видимых узлов где leftNode равен цели
 *
 * @param shownNodes - 可见节点数组（按 leftNode 有序） / Visible nodes array (ordered by leftNode) / Массив видимых узлов (упорядочен по leftNode)
 * @param targetLeftNode - 目标 leftNode 值 / Target leftNode value / Целевое значение leftNode
 * @returns 找到的索引，未找到返回 -1 / Found index, -1 if not found / Найденный индекс, -1 если не найден
 */
export function binarySearchShownNodes(
  shownNodes: MpttTree[],
  targetLeftNode: i32
): i32 {
  let lo: i32 = 0
  let hi: i32 = shownNodes.length - 1
  while (lo <= hi) {
    const mid: i32 = (lo + hi) >>> 1
    const midLeft: i32 = shownNodes[mid].leftNode
    if (midLeft === targetLeftNode) return mid
    if (midLeft < targetLeftNode) {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return -1
}

/**
 * 获取虚拟滚动可视区域内的节点切片
 * Gets the visible slice of nodes within the virtual scroll viewport
 * Получает срез видимых узлов в области виртуальной прокрутки
 *
 * 通过 scrollTop / lineHeight 直接计算索引，复杂度 O(k)
 * Calculates index directly via scrollTop / lineHeight, complexity O(k)
 * Вычисляет индекс напрямую через scrollTop / lineHeight, сложность O(k)
 *
 * @param shownNodes - 可见节点数组 / Visible nodes array / Массив видимых узлов
 * @param scrollTop - 当前滚动位置（像素） / Current scroll position (pixels) / Текущая позиция прокрутки (пиксели)
 * @param scrollHeight - 可视区域高度（像素） / Viewport height (pixels) / Высота области просмотра (пиксели)
 * @param lineHeight - 每行高度（像素） / Line height (pixels) / Высота строки (пиксели)
 * @returns 可视区域内的节点数组 / Array of nodes within viewport / Массив узлов в области просмотра
 */
export function getVisibleSlice(
  shownNodes: MpttTree[],
  scrollTop: f32,
  scrollHeight: f32,
  lineHeight: f32
): MpttTree[] {
  const startIdx: i32 = <i32>Math.floor(scrollTop / lineHeight)
  const endIdx: i32 =
    <i32>Math.ceil((scrollTop + scrollHeight) / lineHeight) + 1

  const clampedStart: i32 =
    startIdx < 0
      ? 0
      : startIdx >= shownNodes.length
        ? shownNodes.length
        : startIdx
  const clampedEnd: i32 =
    endIdx < 0 ? 0 : endIdx > shownNodes.length ? shownNodes.length : endIdx

  const result: MpttTree[] = []
  for (let i: i32 = clampedStart; i < clampedEnd; i++) {
    result.push(shownNodes[i])
  }
  return result
}
