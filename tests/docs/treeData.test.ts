import { describe, it, expect } from 'vitest'
import { buildTreeData } from '../../docs-site/.vitepress/theme/components/treeData'

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
