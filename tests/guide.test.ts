import { describe, it, expect } from 'vitest'
import { computeGuideLines } from '@lib/guide'
import type { TreeInputItem } from '@lib/types'

/**
 * 结构：
 *   a                    deep0, index0 (非末子)
 *   ├─ a1                deep1, index0 (非末子)
 *   │  ├─ a1x            deep2, index0 (非末子)
 *   │  │  └─ a1x1        deep3, index0 (独子)
 *   │  └─ a1y            deep2, index1 (末子)
 *   └─ a2                deep1, index1 (末子)
 *      ├─ a2x            deep2, index0 (非末子)
 *      └─ a2y            deep2, index1 (末子)
 *   b                    deep0, index1 (末子)
 */
const tree: TreeInputItem[] = [
  { id: 'a', name: 'a', parentId: '' },
  { id: 'a1', name: 'a1', parentId: 'a' },
  { id: 'a1x', name: 'a1x', parentId: 'a1' },
  { id: 'a1x1', name: 'a1x1', parentId: 'a1x' },
  { id: 'a1y', name: 'a1y', parentId: 'a1' },
  { id: 'a2', name: 'a2', parentId: 'a' },
  { id: 'a2x', name: 'a2x', parentId: 'a2' },
  { id: 'a2y', name: 'a2y', parentId: 'a2' },
  { id: 'b', name: 'b', parentId: '' },
]

/**
 * guideMask.bit i = 深度 i 的祖先不是它父亲的末子 → 第 i 个缩进格画贯穿竖线。
 * markerLine = 标记列（箭头/图标那一格）竖线段形态，由兄弟位置决定：
 *   'none' 独子 / 'lower' 首子 / 'upper' 末子 / 'full' 中间。
 */
describe('computeGuideLines: 连接线预计算', () => {
  it('顶层：首子 lower、末子 upper，无缩进掩码', () => {
    const map = computeGuideLines(tree, '', {})
    expect(map.get('a')).toEqual({
      isLastChild: false,
      guideMask: 0,
      markerLine: 'lower',
    })
    expect(map.get('b')).toEqual({
      isLastChild: true,
      guideMask: 0,
      markerLine: 'upper',
    })
  })

  it('deep=1：列 0 延续（a 非末子）→ bit0；首子 full、末子 upper', () => {
    const map = computeGuideLines(tree, '', {})
    // 内层首子（a1）左侧已有缩进竖线 → 用 full，而非 ┌。
    expect(map.get('a1')).toEqual({
      isLastChild: false,
      guideMask: 0b1,
      markerLine: 'full',
    })
    expect(map.get('a2')).toEqual({
      isLastChild: true,
      guideMask: 0b1,
      markerLine: 'upper',
    })
  })

  it('deep=2：非末子父节点 a1 的子树，列 1 也延续；内层首子=full', () => {
    const map = computeGuideLines(tree, '', {})
    expect(map.get('a1x')).toEqual({
      isLastChild: false,
      guideMask: 0b11,
      markerLine: 'full',
    })
    expect(map.get('a1y')).toEqual({
      isLastChild: true,
      guideMask: 0b11,
      markerLine: 'upper',
    })
  })

  it('deep=2：末子父节点 a2 的子树，列 1 不延续', () => {
    const map = computeGuideLines(tree, '', {})
    expect(map.get('a2x')).toEqual({
      isLastChild: false,
      guideMask: 0b1,
      markerLine: 'full',
    })
    expect(map.get('a2y')).toEqual({
      isLastChild: true,
      guideMask: 0b1,
      markerLine: 'upper',
    })
  })

  it('内层独子按末子处理：markerLine=upper', () => {
    const map = computeGuideLines(tree, '', {})
    // a1x1 是 a1x 的独子，处在内层（deep=3）→ 收成 └(upper)。
    // 三层祖先列全部延续 → 0b111。
    expect(map.get('a1x1')).toEqual({
      isLastChild: true,
      guideMask: 0b111,
      markerLine: 'upper',
    })
  })

  it('顶层三兄弟：首 lower(┌)、中 full(├)、末 upper(└)', () => {
    const mid: TreeInputItem[] = [
      { id: 'c1', name: 'c1', parentId: '' },
      { id: 'c2', name: 'c2', parentId: '' },
      { id: 'c3', name: 'c3', parentId: '' },
    ]
    const map = computeGuideLines(mid, '', {})
    expect(map.get('c1')!.markerLine).toBe('lower')
    expect(map.get('c2')!.markerLine).toBe('full')
    expect(map.get('c3')!.markerLine).toBe('upper')
  })

  it('顶层首子是 ┌(lower)，内层首子是 ├(full)——只有最外层首叶开顶', () => {
    const nested: TreeInputItem[] = [
      { id: 'p', name: 'p', parentId: '' },
      { id: 'q', name: 'q', parentId: '' },
      { id: 'p-a', name: 'p-a', parentId: 'p' },
      { id: 'p-b', name: 'p-b', parentId: 'p' },
    ]
    const map = computeGuideLines(nested, '', {})
    // 顶层：p 是首子（还有兄弟 q）→ lower（┌）。
    expect(map.get('p')!.markerLine).toBe('lower')
    // 内层：p-a 是首子，但左侧已有缩进竖线 → full（├），不是 ┌。
    expect(map.get('p-a')!.markerLine).toBe('full')
    expect(map.get('p-b')!.markerLine).toBe('upper')
  })

  it('顶层独子叶：markerLine=none（不画标记列线段）', () => {
    const solo: TreeInputItem[] = [{ id: 'solo', name: 'solo', parentId: '' }]
    const map = computeGuideLines(solo, '', {})
    expect(map.get('solo')).toEqual({
      isLastChild: true,
      guideMask: 0,
      markerLine: 'none',
    })
  })

  it('draw 判定：(guideMask >> i) & 1 与结构一致', () => {
    const map = computeGuideLines(tree, '', {})
    const draws = (id: string, level: number) =>
      ((map.get(id)!.guideMask >> level) & 1) === 1
    expect(draws('a1x1', 0)).toBe(true)
    expect(draws('a1x1', 1)).toBe(true)
    expect(draws('a1x1', 2)).toBe(true)
    expect(draws('a2y', 0)).toBe(true)
    expect(draws('a2y', 1)).toBe(false)
  })

  it('一次性全遍历：折叠子树同样产出条目', () => {
    const map = computeGuideLines(tree, '', {})
    expect(map.size).toBe(tree.length)
  })

  it('fieldKeys 映射生效', () => {
    const mapped: TreeInputItem[] = [
      {
        _id: 'r',
        _name: 'r',
        _parent: '',
      } as unknown as TreeInputItem,
      { _id: 'c', _name: 'c', _parent: 'r' } as unknown as TreeInputItem,
    ]
    const map = computeGuideLines(mapped, '', {
      idField: '_id',
      nameField: '_name',
      parentIdField: '_parent',
    })
    expect(map.get('r')).toEqual({
      isLastChild: true,
      guideMask: 0,
      markerLine: 'none',
    })
    expect(map.get('c')).toEqual({
      isLastChild: true,
      guideMask: 0,
      markerLine: 'upper',
    })
  })

  it('空输入返回空 Map', () => {
    expect(computeGuideLines([], '', {}).size).toBe(0)
  })
})
