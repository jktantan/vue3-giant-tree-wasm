/**
 * 连接线（guide line）展示字段的纯 JS 预计算。
 *
 * Guide-line presentation fields, precomputed in plain JS.
 *
 * 这里的几何只由树的层级结构决定，与折叠状态无关：折叠只改变“哪些行可见”，
 * 不改变某一行该画什么线。因此每个节点只需算一次，滚动 / 展开 / 折叠都不会
 * 让它失效，也就没有随之而来的重算开销。
 *
 * The geometry depends only on the tree's hierarchy, never on the collapsed
 * state: collapsing changes which rows are visible, not what a row draws.
 * Each node is therefore computed once and stays valid across scrolling,
 * expanding and collapsing.
 */
import type { TreeFieldKeys, TreeInputItem } from './types'

/** 单行的连接线展示字段。 / Guide-line fields for a single row. */
export interface GuideLineInfo {
  /** 是否为父节点的最后一个子节点（末子）。 / Last child of its parent. */
  isLastChild: boolean
  /**
   * 缩进竖线位掩码。deep=d 的行左侧有 d 个缩进格（列 0..d-1），bit i = 该列需要画一条
   * 贯穿竖线，用于延续「深度 i 的祖先」所在列。bit i 置位当且仅当该祖先不是它父亲的
   * 末子——即该列在后续兄弟行里还要继续。绘制时用 (mask >> i) & 1。
   *
   * 32 位整数上限：超过 32 层的缩进会丢失高位，退化为该列不画竖线。
   */
  guideMask: number
  /**
   * 标记列（列 deep，箭头/图标所在那一格）的竖线段形态，由该节点在**同一父的兄弟**
   * 中的位置决定——顶部/底部不要多画半段：
   * - 'none'：独子（上下都无兄弟）→ 不画竖线；
   * - 'lower'：首子（只有下方兄弟）→ 只画下半段；
   * - 'upper'：末子（只有上方兄弟）→ 只画上半段（└ 的竖线）；
   * - 'full'：中间（上下都有兄弟）→ 全高。
   */
  markerLine: 'none' | 'upper' | 'lower' | 'full'
}

/**
 * 从邻接表输入预计算全部节点的连接线字段。
 *
 * 复刻 WASM 构建器的语义，使线列与缩进严格对齐：
 * - 按 parentId 分组，从 root 递归；兄弟顺序 = 输入顺序（与 `_iterativeAssembly` 一致）；
 * - 深度从 0 起（root 的子节点 deep=0），与 WASM 的 `deep` 一致。
 *
 * 使用迭代 DFS，避免深树下递归爆栈。
 *
 * 一次性遍历整棵输入树（不按折叠状态剪枝）：连接线几何与折叠无关，因此结果
 * 对所有渲染路径（主线程 / worker 可见切片 / 搜索视图）都稳定且完整，无需随
 * 可见集合变化重算。代价是 O(n) 时间与内存，仅在启用 `showLine` 时发生。
 *
 * @param items 原始树输入（邻接表）。 / Raw tree input (adjacency list).
 * @param root 根标识。 / Root identifier.
 * @param fieldKeys 字段键名映射。 / Field key mapping.
 */
export function computeGuideLines(
  items: TreeInputItem[],
  root: string,
  fieldKeys: TreeFieldKeys
): Map<string, GuideLineInfo> {
  const result = new Map<string, GuideLineInfo>()
  if (items.length === 0) return result

  const idField = fieldKeys.idField ?? 'id'
  const parentIdField = fieldKeys.parentIdField ?? 'parentId'

  // 按 parentId 分组，保持输入顺序（与 WASM 的 treeMap 语义一致）。
  const childrenByParent = new Map<string, TreeInputItem[]>()
  for (const item of items as Array<TreeInputItem & Record<string, unknown>>) {
    const parentId = String(item[parentIdField] ?? '')
    let bucket = childrenByParent.get(parentId)
    if (bucket === undefined) {
      bucket = []
      childrenByParent.set(parentId, bucket)
    }
    bucket.push(item)
  }

  // 迭代 DFS 栈帧：一层兄弟列表 + 该层深度 + 该层节点已累计的祖先延续掩码。
  type Frame = {
    siblings: TreeInputItem[]
    index: number
    deep: number
    accMask: number
  }

  const frames: Frame[] = []
  const rootChildren = childrenByParent.get(root)
  if (rootChildren !== undefined && rootChildren.length > 0) {
    // root 的子节点 deep=0，左侧无缩进格、无祖先列，掩码恒为 0。
    frames.push({ siblings: rootChildren, index: 0, deep: 0, accMask: 0 })
  }

  while (frames.length > 0) {
    const frame = frames[frames.length - 1]
    if (frame.index >= frame.siblings.length) {
      frames.pop()
      continue
    }

    const item = frame.siblings[frame.index] as TreeInputItem &
      Record<string, unknown>
    const siblingIndex = frame.index
    const isFirstChild = siblingIndex === 0
    const isLastChild = siblingIndex === frame.siblings.length - 1
    frame.index++

    const deep = frame.deep
    // accMask 的 bit i 表示「深度 i 的祖先不是末子」→ 本行第 i 个缩进格要画贯穿竖线。
    const guideMask = frame.accMask
    const id = String(item[idField] ?? '')
    // 标记列竖线段：按本节点在兄弟中的位置，以及它是否处于顶层决定。
    // - 顶层（deep=0）：左侧无缩进竖线，首位用 ┌(lower)、末位用 └(upper)、中间用 ├(full)、
    //   独子留空(none)；
    // - 内层（deep>=1）：左侧已有缩进竖线向上延伸，首/中都接顶用 ├(full)，只有末位收成
    //   └(upper)。独子既是首也是末，按末位处理。
    const markerLine: GuideLineInfo['markerLine'] =
      deep === 0
        ? isFirstChild
          ? isLastChild
            ? 'none'
            : 'lower'
          : isLastChild
            ? 'upper'
            : 'full'
        : isLastChild
          ? 'upper'
          : 'full'
    result.set(id, { isLastChild, guideMask, markerLine })

    // 始终下钻（不按折叠剪枝）：保证任意渲染路径都能拿到完整字段。
    const children = childrenByParent.get(id)
    if (children !== undefined && children.length > 0) {
      // 本节点若不是末子，则本行标记列（列 deep）上还会出现后续兄弟的箭头，需要在
      // 后代行的该列继续画贯穿竖线，因此给子节点置 bit(deep)。
      const childAccMask = isLastChild
        ? frame.accMask
        : frame.accMask | (1 << deep)
      frames.push({
        siblings: children,
        index: 0,
        deep: deep + 1,
        accMask: childAccMask,
      })
    }
  }

  return result
}
