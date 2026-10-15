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

const SHAPES: Record<TreePreset, TreeShape> = {
  small: { kind: 'levels', levels: [3, 3, 3] },
  medium: { kind: 'levels', levels: [6, 6, 6] },
  '10k': { kind: 'count', count: 10_000, branching: 10 },
  '100k': { kind: 'count', count: 100_000, branching: 10 },
}

/**
 * 生成确定性的演示数据：无随机、无时间依赖，同一 preset 任意次调用结果完全一致。
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
  const nodes: Array<TreeInputItem & Record<string, unknown>> = []

  const push = (parentId: string): string => {
    const id = `n${nodes.length + 1}`
    nodes.push({
      id,
      name: `节点 ${id}`,
      parentId,
      category: 'A',
    })
    return id
  }

  if (shape.kind === 'levels') {
    let parents = ['root']
    for (const width of shape.levels) {
      const next: string[] = []
      for (const parentId of parents) {
        for (let i = 0; i < width; i++) next.push(push(parentId))
      }
      parents = next
    }
  } else {
    for (let i = 0; i < shape.count; i++) {
      const parentId =
        i === 0 ? 'root' : nodes[Math.floor((i - 1) / shape.branching)].id
      push(parentId)
    }
  }

  nodes.forEach((node, index) => {
    const ordinal = index + 1
    if (options.disabledEvery && ordinal % options.disabledEvery === 0) {
      node.disabled = true
    }
    if (options.categoryEvery && ordinal % options.categoryEvery === 0) {
      node.category = 'B'
    }
  })

  return nodes
}
