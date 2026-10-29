import { describe, it, expect } from 'vitest'
import {
  buildPreorderedTreeData,
  buildTreeData,
} from '../../docs-site/.vitepress/theme/components/treeData'
import type { TreeInputItem } from '@lib/core/types'

/** 按 parentId 关系做一次深度优先遍历，返回前序 id 序列。 */
function dfsOrder(rows: TreeInputItem[]): string[] {
  const children = new Map<string, string[]>()
  for (const row of rows) {
    const bucket = children.get(row.parentId) ?? []
    bucket.push(row.id)
    children.set(row.parentId, bucket)
  }
  const out: string[] = []
  const walk = (parentId: string) => {
    for (const id of children.get(parentId) ?? []) {
      out.push(id)
      walk(id)
    }
  }
  walk('root')
  return out
}

describe('buildTreeData', () => {
  it('10k / 100k 预设生成精确的节点数', () => {
    expect(buildTreeData('10k')).toHaveLength(10000)
    expect(buildTreeData('100k')).toHaveLength(100000)
  })

  it('每个节点的 parentId 都能解析到已知父节点或 root', () => {
    const nodes = buildTreeData('small')
    const ids = new Set(nodes.map(node => node.id))
    for (const node of nodes) {
      expect(node.parentId === 'root' || ids.has(node.parentId)).toBe(true)
    }
  })

  it('同一 preset 连续两次调用结果一致（确定性）', () => {
    expect(buildTreeData('medium')).toEqual(buildTreeData('medium'))
  })

  it('disabledEvery 为 3 时每第 3 个节点被禁用', () => {
    const nodes = buildTreeData('small', { disabledEvery: 3 })
    nodes.forEach((node, index) => {
      expect(Boolean(node.disabled)).toBe((index + 1) % 3 === 0)
    })
  })
})

describe('buildPreorderedTreeData', () => {
  it('生成的数组本身就是深度优先前序', () => {
    const rows = buildPreorderedTreeData('medium')
    expect(rows.map(row => row.id)).toEqual(dfsOrder(rows))
  })

  it('10k 前序数据的总数精确', () => {
    expect(buildPreorderedTreeData('10k')).toHaveLength(10000)
  })

  it('同样应用 disabledEvery', () => {
    const rows = buildPreorderedTreeData('small', { disabledEvery: 3 })
    rows.forEach((node, index) => {
      expect(Boolean(node.disabled)).toBe((index + 1) % 3 === 0)
    })
  })
})
