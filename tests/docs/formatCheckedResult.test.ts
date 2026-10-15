import { describe, it, expect } from 'vitest'
import { formatCheckedResult } from '../../docs-site/.vitepress/theme/components/playground/format'

describe('formatCheckedResult', () => {
  it('outputIdOnly 时列出 ID，而不是只给数量', () => {
    expect(formatCheckedResult(['n1', 'n2'], true)).toBe('n1、n2')
  })

  it('outputIdOnly 关闭时给出完整节点的 JSON', () => {
    const text = formatCheckedResult(
      [{ id: 'n1', name: '节点 n1', parentId: 'root' }],
      false
    )
    expect(text).toContain('"id": "n1"')
    expect(text).toContain('"name": "节点 n1"')
  })

  it('未选中时给出可读占位', () => {
    expect(formatCheckedResult([], true)).toBe('（未选中）')
    expect(formatCheckedResult(null, true)).toBe('（未选中）')
    expect(formatCheckedResult(undefined, false)).toBe('（未选中）')
  })

  it('超长结果被截断并注明总数', () => {
    const many = Array.from({ length: 30 }, (_, i) => `n${i + 1}`)
    const text = formatCheckedResult(many, true)
    expect(text).toContain('共 30 项')
    expect(text.length).toBeLessThan(120)
  })
})
