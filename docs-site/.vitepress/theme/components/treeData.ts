import type { TreeInputItem } from '@lib/types'

/** 演示数据的规模档位。 */
export type TreePreset = 'small' | 'medium' | '10k' | '100k'

/** 生成选项：用于演示 `disabled` 与 `filterFn`。 */
export interface TreeDataOptions {
  /** 每隔 N 个节点（从 1 起算）标记为 `disabled`。 */
  disabledEvery?: number
  /** 每隔 N 个节点（从 1 起算）把 `category` 置为 `'B'`，其余为 `'A'`。 */
  categoryEvery?: number
}

type TreeShape =
  | { kind: 'levels'; levels: number[] }
  | { kind: 'count'; count: number; branching: number }

/** 生成过程中使用的可变行。 */
type DraftRow = TreeInputItem & Record<string, unknown>

const SHAPES: Record<TreePreset, TreeShape> = {
  small: { kind: 'levels', levels: [3, 3, 3] },
  medium: { kind: 'levels', levels: [6, 6, 6] },
  '10k': { kind: 'count', count: 10_000, branching: 10 },
  '100k': { kind: 'count', count: 100_000, branching: 10 },
}

/** 追加一行，返回它的 id（id 为自增的 `n1`、`n2`…）。 */
const pushRow = (rows: DraftRow[], parentId: string): string => {
  const id = `n${rows.length + 1}`
  rows.push({ id, name: `节点 ${id}`, parentId, category: 'A' })
  return id
}

/** 按选项标记 `disabled` / `category`。 */
const applyOptions = (rows: DraftRow[], options: TreeDataOptions): void => {
  rows.forEach((row, index) => {
    const ordinal = index + 1
    if (options.disabledEvery && ordinal % options.disabledEvery === 0) {
      row.disabled = true
    }
    if (options.categoryEvery && ordinal % options.categoryEvery === 0) {
      row.category = 'B'
    }
  })
}

/**
 * 生成确定性的**层序**演示数据：无随机、无时间依赖，同一 preset 任意次调用结果完全一致。
 *
 * - ID 为自增的 `n1`、`n2`…；顶层节点的 `parentId` 为 `'root'`。
 * - `levels` 档位逐层展开（小数据，便于肉眼观察结构）；
 *   `count` 档位按 `branching` 做层序生成，保证节点总数精确等于 `count`，且深度很浅。
 * - `category` 字段会随行数据一起进入 `extendData`，供 `filterFn` 演示使用。
 */
export function buildTreeData(
  preset: TreePreset,
  options: TreeDataOptions = {}
): TreeInputItem[] {
  const shape = SHAPES[preset]
  const rows: DraftRow[] = []

  if (shape.kind === 'levels') {
    let parents = ['root']
    for (const width of shape.levels) {
      const next: string[] = []
      for (const parentId of parents) {
        for (let i = 0; i < width; i++) next.push(pushRow(rows, parentId))
      }
      parents = next
    }
  } else {
    for (let i = 0; i < shape.count; i++) {
      const parentId =
        i === 0 ? 'root' : rows[Math.floor((i - 1) / shape.branching)].id
      pushRow(rows, parentId)
    }
  }

  applyOptions(rows, options)
  return rows
}

/**
 * 生成**严格深度优先前序**的演示数据：父节点一定排在它的整棵子树之前，且每棵子树在数组里连续。
 *
 * 层序数据配 `preorderedInput` 会被组件静默回退到通用构建（`tree-builder.ts`），用户看不出任何差别 ——
 * 所以演示这个开关必须用真正的前序数据。
 */
export function buildPreorderedTreeData(
  preset: TreePreset,
  options: TreeDataOptions = {}
): TreeInputItem[] {
  const shape = SHAPES[preset]
  const rows: DraftRow[] = []

  if (shape.kind === 'levels') {
    // 先压入自己，再立刻下钻整棵子树 —— 这正是前序的定义。
    const walk = (parentId: string, level: number): void => {
      const width = shape.levels[level]
      if (width === undefined) return
      for (let i = 0; i < width; i++) {
        walk(pushRow(rows, parentId), level + 1)
      }
    }
    walk('root', 0)
  } else {
    // count 档位：限制深度后做前序填充，节点总数精确等于 count。
    const maxDepth = Math.ceil(
      Math.log(shape.count) / Math.log(shape.branching)
    )
    let remaining = shape.count
    const walk = (parentId: string, depth: number): void => {
      if (depth >= maxDepth) return
      for (let i = 0; i < shape.branching && remaining > 0; i++) {
        remaining--
        walk(pushRow(rows, parentId), depth + 1)
      }
    }
    walk('root', 0)
  }

  applyOptions(rows, options)
  return rows
}
