import { describe, it, expect } from 'vitest'
import {
  newTree,
  pushNeighborNode,
  pushNeighborNodes,
  popNeighbor,
  getSize,
  getShownNodes,
  getAllNodes,
  getShownIndices,
  getNodeLayouts,
  getAllNodeIds,
  getAllNodeLayouts,
  getInputNodeLayouts,
  clearInputNodeLayouts,
  getCompactMemoryBytes,
  getCompactMirrorBytes,
  getObjectStringPayloadBytes,
  canUseLazyCheckboxRange,
  setUseCompactSelection,
  setUseLazyCheckboxRanges,
  setUseSearchCandidateIndex,
  getShownHeight,
  getCheckedNodes,
  getCheckedIds,
  setCheckedOutputMode,
  setBoundary,
  clear,
  checkNode,
  setCheckedNodes,
  clearCheckedNodes,
  collapseTree,
  fuzzyTree,
  SelectType,
  CheckType,
  DisplayType,
  CheckedOutputMode,
} from '../wasm-bridge'

describe('giant-tree: 集成测试', () => {
  it('批量邻接表输入与逐条输入保持树、禁用和搜索语义一致', () => {
    const batched = newTree('root', 26, SelectType.CHECKBOX)
    const single = newTree('root', 26, SelectType.CHECKBOX)
    const ids = ['A', 'A1', 'B']
    const names = ['Alpha', 'Alpha child', 'Beta']
    const parents = ['root', 'A', 'root']
    const disabled = [false, true, false]

    pushNeighborNodes(batched, ids, names, parents, disabled)
    popNeighbor(batched)
    for (let i = 0; i < ids.length; i++)
      pushNeighborNode(single, ids[i], names[i], parents[i], disabled[i])
    popNeighbor(single)

    expect(getAllNodes(batched)).toBe(getAllNodes(single))
    expect(fuzzyTree(batched, 'child')).toBe(fuzzyTree(single, 'child'))
  })

  it('紧凑布局桥接返回 MPTT 顺序与继承后的禁用状态', () => {
    const tree = newTree('root', 26, SelectType.CHECKBOX)
    pushNeighborNode(tree, 'A', 'A', 'root', true)
    pushNeighborNode(tree, 'A1', 'A1', 'A')
    pushNeighborNode(tree, 'B', 'B', 'root')
    popNeighbor(tree)

    expect(getNodeLayouts(tree, ['B', 'A1', 'missing'])).toEqual([
      2,
      4,
      5,
      0,
      0,
      1,
      1,
      2,
      1,
      1,
      -1,
      0,
      0,
      0,
      0,
    ])
    expect(getAllNodeIds(tree)).toEqual(['A', 'A1', 'B'])
    expect(getAllNodeLayouts(tree)).toEqual([
      0,
      3,
      0,
      1,
      1,
      2,
      1,
      1,
      4,
      5,
      0,
      0,
    ])
    expect(getInputNodeLayouts(tree)).toEqual([
      0,
      0,
      3,
      0,
      1,
      1,
      1,
      2,
      1,
      1,
      2,
      4,
      5,
      0,
      0,
    ])
    clearInputNodeLayouts(tree)
    expect(getInputNodeLayouts(tree)).toEqual([])
  })

  it('完整生命周期：创建→加载→展开→选中→搜索→清空', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)

    pushNeighborNode(tree, 'A', 'NodeA', '')
    pushNeighborNode(tree, 'A1', 'NodeA1', 'A')
    pushNeighborNode(tree, 'B', 'NodeB', '')
    popNeighbor(tree)
    expect(getSize(tree)).toBe(3)

    setBoundary(tree, 0, 5000)
    collapseTree(tree, 'A', false)
    const expanded = JSON.parse(getShownNodes(tree)) as any[]
    expect(expanded.length).toBe(3)

    checkNode(tree, 'A1', CheckType.CHECKED)
    const checked = JSON.parse(getCheckedNodes(tree)) as any[]
    expect(checked.some((n: any) => n.id === 'A1')).toBe(true)

    const searchResult = JSON.parse(fuzzyTree(tree, 'NodeB')) as any[]
    expect(searchResult.some((n: any) => n.id === 'B')).toBe(true)

    clear(tree)
    expect(getSize(tree)).toBe(0)
  })

  it('大数据量构建 10000 节点', () => {
    const tree = newTree('root', 26, SelectType.CHECKBOX)
    clear(tree)
    for (let i = 0; i < 100; i++) {
      const pid = `p${i}`
      pushNeighborNode(tree, pid, `Parent${i}`, 'root')
      for (let j = 0; j < 10; j++) {
        const cid = `p${i}c${j}`
        pushNeighborNode(tree, cid, `Child${i}-${j}`, pid)
        for (let k = 0; k < 9; k++) {
          pushNeighborNode(tree, `${cid}g${k}`, `Grand${i}-${j}-${k}`, cid)
        }
      }
    }
    popNeighbor(tree)
    expect(getSize(tree)).toBe(100 + 1000 + 9000)
    setBoundary(tree, 0, 500)
    expect(() => getShownNodes(tree)).not.toThrow()
  })

  it('选中→搜索→取消搜索后选中状态保持', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    pushNeighborNode(tree, 'X', 'NodeX', '')
    pushNeighborNode(tree, 'X1', 'NodeX1', 'X')
    pushNeighborNode(tree, 'Y', 'NodeY', '')
    popNeighbor(tree)
    setBoundary(tree, 0, 5000)

    checkNode(tree, 'X1', CheckType.CHECKED)
    fuzzyTree(tree, 'NodeX')
    fuzzyTree(tree, '')

    const checked = JSON.parse(getCheckedNodes(tree)) as any[]
    expect(checked.some((n: any) => n.id === 'X1')).toBe(true)
  })

  it('重复搜索关键词复用结果且保持输出一致', () => {
    const tree = newTree('root', 26, SelectType.CHECKBOX)
    for (let i = 0; i < 100; i++)
      pushNeighborNode(tree, `n${i}`, `Node ${i}`, 'root')
    popNeighbor(tree)
    const first = fuzzyTree(tree, 'Node 50')
    const second = fuzzyTree(tree, 'Node 50')
    expect(second).toBe(first)
    expect(getShownIndices(tree).length).toBeGreaterThan(0)
  })

  it('多次 clear 重建', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    for (let round = 0; round < 3; round++) {
      clear(tree)
      pushNeighborNode(tree, `r${round}`, `Round${round}`, '')
      popNeighbor(tree)
      expect(getSize(tree)).toBe(1)
    }
  })

  it('展开全部再折叠恢复初始高度', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    pushNeighborNode(tree, 'P', 'Parent', '')
    pushNeighborNode(tree, 'C1', 'Child1', 'P')
    pushNeighborNode(tree, 'C2', 'Child2', 'P')
    popNeighbor(tree)
    setBoundary(tree, 0, 5000)

    const initHeight = getShownHeight(tree)
    collapseTree(tree, 'P', false)
    expect(getShownHeight(tree)).toBeGreaterThan(initHeight)
    collapseTree(tree, 'P', true)
    expect(getShownHeight(tree)).toBe(initHeight)
  })

  it('虚拟滚动：不同位置返回不同节点', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    for (let i = 0; i < 50; i++) {
      pushNeighborNode(tree, `n${i}`, `Node${i}`, '')
    }
    popNeighbor(tree)

    setBoundary(tree, 0, 130)
    const topNodes = JSON.parse(getShownNodes(tree)) as any[]

    setBoundary(tree, 1040, 130)
    const bottomNodes = JSON.parse(getShownNodes(tree)) as any[]

    expect(topNodes[0].id).not.toBe(bottomNodes[0].id)
  })

  it('索引桥接：返回与可见节点 JSON 相同的顺序', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    pushNeighborNode(tree, 'A', 'A', '')
    pushNeighborNode(tree, 'A1', 'A1', 'A')
    pushNeighborNode(tree, 'B', 'B', '')
    popNeighbor(tree)
    setBoundary(tree, 0, 5000)

    const all = JSON.parse(getAllNodes(tree)) as any[]
    const indices = getShownIndices(tree) as number[]
    const shown = JSON.parse(getShownNodes(tree)) as any[]
    expect(indices.map(index => all[index].id)).toEqual(
      shown.map(node => node.id)
    )

    collapseTree(tree, 'A', false)
    const expandedIndices = getShownIndices(tree) as number[]
    const expanded = JSON.parse(getShownNodes(tree)) as any[]
    expect(expandedIndices.map(index => all[index].id)).toEqual(
      expanded.map(node => node.id)
    )
  })

  it('紧凑布局镜像：按节点数量分配固定数值字段空间', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    pushNeighborNode(tree, 'A', 'A', '')
    pushNeighborNode(tree, 'B', 'B', '')
    popNeighbor(tree)
    expect(getCompactMemoryBytes(tree)).toBe(94)
    expect(getCompactMirrorBytes(tree)).toBe(34)
    expect(getObjectStringPayloadBytes(tree)).toBe(8)
  })

  it('紧凑布局可 O(1) 识别包含禁用节点的子树', () => {
    const tree = newTree('root', 26, SelectType.CHECKBOX)
    pushNeighborNode(tree, 'A', 'A', 'root')
    pushNeighborNode(tree, 'A1', 'A1', 'A', true)
    pushNeighborNode(tree, 'B', 'B', 'root')
    pushNeighborNode(tree, 'B1', 'B1', 'B')
    popNeighbor(tree)

    expect(canUseLazyCheckboxRange(tree, 'A')).toBe(false)
    expect(canUseLazyCheckboxRange(tree, 'B')).toBe(true)
    expect(canUseLazyCheckboxRange(tree, 'missing')).toBe(false)
  })

  it('完整序列化从 compact 状态读取并与 legacy 对拍', () => {
    const compact = newTree('root', 26, SelectType.CHECKBOX)
    const legacy = newTree('root', 26, SelectType.CHECKBOX)
    setUseCompactSelection(compact, true)
    setUseCompactSelection(legacy, false)
    for (const target of [compact, legacy]) {
      pushNeighborNode(target, 'A', 'A', 'root')
      pushNeighborNode(target, 'A1', 'A1', 'A')
      pushNeighborNode(target, 'B', 'B', 'root', true)
      popNeighbor(target)
      setBoundary(target, 0, 5000)
    }
    checkNode(compact, 'A', CheckType.CHECKED)
    checkNode(legacy, 'A', CheckType.CHECKED)
    collapseTree(compact, 'A', false)
    collapseTree(legacy, 'A', false)
    expect(JSON.parse(getAllNodes(compact))).toEqual(
      JSON.parse(getAllNodes(legacy))
    )
  })

  it('lazy RootOnly 顶层子树在输出、展开和后续编辑时与旧路径一致', () => {
    const lazy = newTree('root', 26, SelectType.CHECKBOX)
    const legacy = newTree('root', 26, SelectType.CHECKBOX)
    setUseLazyCheckboxRanges(lazy, true)
    for (const target of [lazy, legacy]) {
      pushNeighborNode(target, 'A', 'A', 'root')
      pushNeighborNode(target, 'A1', 'A1', 'A')
      pushNeighborNode(target, 'A2', 'A2', 'A')
      pushNeighborNode(target, 'B', 'B', 'root')
      pushNeighborNode(target, 'B1', 'B1', 'B')
      popNeighbor(target)
      setBoundary(target, 0, 500)
      setCheckedOutputMode(target, CheckedOutputMode.RootOnly)
    }

    checkNode(lazy, 'A', CheckType.CHECKED)
    checkNode(legacy, 'A', CheckType.CHECKED)
    expect(getCheckedIds(lazy)).toBe(getCheckedIds(legacy))
    expect(getCheckedNodes(lazy)).toBe(getCheckedNodes(legacy))
    collapseTree(lazy, 'A', false)
    collapseTree(legacy, 'A', false)
    expect(JSON.parse(getShownNodes(lazy))).toEqual(
      JSON.parse(getShownNodes(legacy))
    )

    checkNode(lazy, 'A1', CheckType.UNCHECKED)
    checkNode(legacy, 'A1', CheckType.UNCHECKED)
    setCheckedOutputMode(lazy, CheckedOutputMode.All)
    setCheckedOutputMode(legacy, CheckedOutputMode.All)
    expect(getCheckedIds(lazy)).toBe(getCheckedIds(legacy))
    expect(getCheckedNodes(lazy)).toBe(getCheckedNodes(legacy))
  })

  it('lazy RootOnly 遇到禁用子节点时回退到普通 checkbox 语义', () => {
    const lazy = newTree('root', 26, SelectType.CHECKBOX)
    const legacy = newTree('root', 26, SelectType.CHECKBOX)
    setUseLazyCheckboxRanges(lazy, true)
    for (const target of [lazy, legacy]) {
      pushNeighborNode(target, 'A', 'A', 'root')
      pushNeighborNode(target, 'A1', 'A1', 'A', true)
      pushNeighborNode(target, 'A2', 'A2', 'A')
      popNeighbor(target)
      setBoundary(target, 0, 500)
      setCheckedOutputMode(target, CheckedOutputMode.RootOnly)
    }

    checkNode(lazy, 'A', CheckType.CHECKED)
    checkNode(legacy, 'A', CheckType.CHECKED)
    collapseTree(lazy, 'A', false)
    collapseTree(legacy, 'A', false)
    expect(getCheckedIds(lazy)).toBe(getCheckedIds(legacy))
    expect(JSON.parse(getShownNodes(lazy))).toEqual(
      JSON.parse(getShownNodes(legacy))
    )
  })

  it('lazy RootOnly 在独立非顶层子树间保持祖先聚合一致', () => {
    const lazy = newTree('root', 26, SelectType.CHECKBOX)
    const legacy = newTree('root', 26, SelectType.CHECKBOX)
    setUseLazyCheckboxRanges(lazy, true)
    for (const target of [lazy, legacy]) {
      pushNeighborNode(target, 'A', 'A', 'root')
      pushNeighborNode(target, 'A1', 'A1', 'A')
      pushNeighborNode(target, 'A2', 'A2', 'A')
      pushNeighborNode(target, 'B', 'B', 'root')
      pushNeighborNode(target, 'B1', 'B1', 'B')
      pushNeighborNode(target, 'B2', 'B2', 'B')
      popNeighbor(target)
      setBoundary(target, 0, 500)
      setCheckedOutputMode(target, CheckedOutputMode.RootOnly)
    }

    for (const [id, value] of [
      ['A1', CheckType.CHECKED],
      ['B1', CheckType.CHECKED],
      ['A2', CheckType.CHECKED],
      ['B2', CheckType.CHECKED],
      ['A1', CheckType.UNCHECKED],
    ] as const) {
      checkNode(lazy, id, value)
      checkNode(legacy, id, value)
      expect(getCheckedIds(lazy)).toBe(getCheckedIds(legacy))
      expect(getCheckedNodes(lazy)).toBe(getCheckedNodes(legacy))
    }
    collapseTree(lazy, 'A', false)
    collapseTree(legacy, 'A', false)
    expect(JSON.parse(getShownNodes(lazy))).toEqual(
      JSON.parse(getShownNodes(legacy))
    )
  })

  it('lazy checkbox 固定种子随机操作与 legacy 路径完全一致', () => {
    const lazy = newTree('root', 26, SelectType.CHECKBOX)
    const legacy = newTree('root', 26, SelectType.CHECKBOX)
    setUseLazyCheckboxRanges(lazy, true)
    const nodes = [
      ['A', 'Alpha', 'root', false],
      ['A1', 'Alpha one', 'A', false],
      ['A1a', 'Alpha one child', 'A1', false],
      ['A2', 'Alpha two', 'A', true],
      ['B', 'Beta', 'root', false],
      ['B1', 'Beta one', 'B', false],
      ['B2', 'Beta two', 'B', false],
      ['C', 'Gamma', 'root', false],
      ['C1', 'Gamma one', 'C', false],
    ] as const
    for (const target of [lazy, legacy]) {
      for (const [id, name, parentId, disabled] of nodes) {
        pushNeighborNode(target, id, name, parentId, disabled)
      }
      popNeighbor(target)
      setBoundary(target, 0, 500)
    }

    const ids = nodes.map(([id]) => id)
    const collapsible = ['A', 'A1', 'B', 'C']
    const keywords = ['', 'Alpha', 'Beta', 'missing']
    const modes = [
      CheckedOutputMode.RootOnly,
      CheckedOutputMode.All,
      CheckedOutputMode.LeafOnly,
    ]
    let seed = 0x5eed1234
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed
    }
    const compare = () => {
      expect(getCheckedIds(lazy)).toBe(getCheckedIds(legacy))
      expect(getCheckedNodes(lazy)).toBe(getCheckedNodes(legacy))
      expect(JSON.parse(getShownNodes(lazy))).toEqual(
        JSON.parse(getShownNodes(legacy))
      )
      expect(getShownIndices(lazy)).toEqual(getShownIndices(legacy))
    }

    for (let step = 0; step < 120; step++) {
      const operation = next() % 6
      if (operation === 0) {
        const id = ids[next() % ids.length]
        const value = next() % 2 === 0 ? CheckType.CHECKED : CheckType.UNCHECKED
        checkNode(lazy, id, value)
        checkNode(legacy, id, value)
      } else if (operation === 1) {
        const id = collapsible[next() % collapsible.length]
        const collapsed = next() % 2 === 0
        collapseTree(lazy, id, collapsed)
        collapseTree(legacy, id, collapsed)
      } else if (operation === 2) {
        const keyword = keywords[next() % keywords.length]
        fuzzyTree(lazy, keyword)
        fuzzyTree(legacy, keyword)
      } else if (operation === 3) {
        const mode = modes[next() % modes.length]
        setCheckedOutputMode(lazy, mode)
        setCheckedOutputMode(legacy, mode)
      } else if (operation === 4) {
        const selected = [ids[next() % ids.length], ids[next() % ids.length]]
        setCheckedNodes(lazy, selected)
        setCheckedNodes(legacy, selected)
      } else {
        clearCheckedNodes(lazy)
        clearCheckedNodes(legacy)
      }
      compare()
    }
  })

  it('lazy checkbox 在千节点固定种子随机操作下与 legacy 一致', () => {
    const lazy = newTree('root', 26, SelectType.CHECKBOX)
    const legacy = newTree('root', 26, SelectType.CHECKBOX)
    setUseLazyCheckboxRanges(lazy, true)
    const size = 1000
    for (const target of [lazy, legacy]) {
      for (let i = 0; i < size; i++) {
        pushNeighborNode(
          target,
          `n${i}`,
          `Searchable node ${i}`,
          i === 0 ? 'root' : `n${Math.floor((i - 1) / 10)}`,
          i % 97 === 0
        )
      }
      popNeighbor(target)
      setBoundary(target, 0, 520)
    }

    let seed = 0x12345678
    const next = () => {
      seed = (seed * 1103515245 + 12345) >>> 0
      return seed
    }
    const modes = [
      CheckedOutputMode.RootOnly,
      CheckedOutputMode.All,
      CheckedOutputMode.LeafOnly,
    ]
    const compare = () => {
      expect(getCheckedIds(lazy)).toBe(getCheckedIds(legacy))
      expect(getCheckedNodes(lazy)).toBe(getCheckedNodes(legacy))
      expect(JSON.parse(getShownNodes(lazy))).toEqual(
        JSON.parse(getShownNodes(legacy))
      )
      expect(getShownIndices(lazy)).toEqual(getShownIndices(legacy))
    }

    for (let step = 0; step < 300; step++) {
      const operation = next() % 7
      const id = `n${next() % size}`
      if (operation === 0) {
        const value = next() % 2 === 0 ? CheckType.CHECKED : CheckType.UNCHECKED
        checkNode(lazy, id, value)
        checkNode(legacy, id, value)
      } else if (operation === 1) {
        const collapsed = next() % 2 === 0
        collapseTree(lazy, id, collapsed)
        collapseTree(legacy, id, collapsed)
      } else if (operation === 2) {
        const keyword =
          next() % 3 === 0
            ? ''
            : next() % 2 === 0
              ? 'Searchable'
              : `node ${next() % 20}`
        fuzzyTree(lazy, keyword)
        fuzzyTree(legacy, keyword)
      } else if (operation === 3) {
        const mode = modes[next() % modes.length]
        setCheckedOutputMode(lazy, mode)
        setCheckedOutputMode(legacy, mode)
      } else if (operation === 4) {
        const selected = [
          `n${next() % size}`,
          `n${next() % size}`,
          `n${next() % size}`,
        ]
        setCheckedNodes(lazy, selected)
        setCheckedNodes(legacy, selected)
      } else if (operation === 5) {
        clearCheckedNodes(lazy)
        clearCheckedNodes(legacy)
      } else {
        const scrollTop = (next() % 100) * 26
        setBoundary(lazy, scrollTop, 520)
        setBoundary(legacy, scrollTop, 520)
      }
      compare()
    }
  })

  it('紧凑与对象选择路径随机操作结果一致', () => {
    const compact = newTree('root', 26, SelectType.CHECKBOX)
    const legacy = newTree('root', 26, SelectType.CHECKBOX)
    setUseCompactSelection(compact, true)
    setUseCompactSelection(legacy, false)
    const nodes = [
      ['A', 'A', 'root'],
      ['A1', 'A1', 'A'],
      ['A2', 'A2', 'A'],
      ['A2a', 'A2a', 'A2'],
      ['B', 'B', 'root'],
      ['B1', 'B1', 'B'],
      ['C', 'C', 'root'],
    ]
    for (const [id, name, parent] of nodes) {
      pushNeighborNode(compact, id, name, parent)
      pushNeighborNode(legacy, id, name, parent)
    }
    popNeighbor(compact)
    popNeighbor(legacy)
    setBoundary(compact, 0, 500)
    setBoundary(legacy, 0, 500)

    const compare = () => {
      expect(getCheckedIds(compact)).toBe(getCheckedIds(legacy))
      expect(getCheckedNodes(compact)).toBe(getCheckedNodes(legacy))
      expect(getShownIndices(compact)).toEqual(getShownIndices(legacy))
    }
    for (const [id, value] of [
      ['A2a', CheckType.CHECKED],
      ['A', CheckType.CHECKED],
      ['A2a', CheckType.UNCHECKED],
      ['B1', CheckType.CHECKED],
      ['A', CheckType.UNCHECKED],
    ] as const) {
      checkNode(compact, id, value)
      checkNode(legacy, id, value)
      compare()
    }
    setCheckedNodes(compact, ['A2', 'B1'])
    setCheckedNodes(legacy, ['A2', 'B1'])
    compare()
    setCheckedNodes(compact, ['A', 'A2', 'missing-id'])
    setCheckedNodes(legacy, ['A', 'A2', 'missing-id'])
    compare()
    setCheckedNodes(compact, [])
    setCheckedNodes(legacy, [])
    compare()
    clearCheckedNodes(compact)
    clearCheckedNodes(legacy)
    compare()
  })

  it('紧凑批量设置保持禁用子树的旧路径语义', () => {
    const compact = newTree('root', 26, SelectType.CHECKBOX)
    const legacy = newTree('root', 26, SelectType.CHECKBOX)
    setUseCompactSelection(compact, true)
    setUseCompactSelection(legacy, false)
    for (const target of [compact, legacy]) {
      pushNeighborNode(target, 'A', 'A', 'root')
      pushNeighborNode(target, 'A-disabled', 'A disabled', 'A', true)
      pushNeighborNode(target, 'A-enabled', 'A enabled', 'A')
      pushNeighborNode(target, 'B', 'B', 'root')
      popNeighbor(target)
      setBoundary(target, 0, 500)
    }

    setCheckedNodes(compact, ['A'])
    setCheckedNodes(legacy, ['A'])
    expect(getCheckedIds(compact)).toBe(getCheckedIds(legacy))
    expect(getCheckedNodes(compact)).toBe(getCheckedNodes(legacy))

    setCheckedNodes(compact, ['A-enabled'])
    setCheckedNodes(legacy, ['A-enabled'])
    expect(getCheckedIds(compact)).toBe(getCheckedIds(legacy))
    expect(getCheckedNodes(compact)).toBe(getCheckedNodes(legacy))
  })

  it('compact visible serialization matches legacy state', () => {
    const compact = newTree('root', 26, SelectType.CHECKBOX)
    const legacy = newTree('root', 26, SelectType.CHECKBOX)
    setUseCompactSelection(compact, true)
    setUseCompactSelection(legacy, false)
    for (const target of [compact, legacy]) {
      pushNeighborNode(target, 'A', 'A', 'root')
      pushNeighborNode(target, 'A1', 'A1', 'A')
      pushNeighborNode(target, 'A2', 'A2', 'A')
      pushNeighborNode(target, 'B', 'B', 'root')
      popNeighbor(target)
      setBoundary(target, 0, 500)
    }
    const compare = () => {
      expect(JSON.parse(getShownNodes(compact))).toEqual(
        JSON.parse(getShownNodes(legacy))
      )
    }
    checkNode(compact, 'A', CheckType.CHECKED)
    checkNode(legacy, 'A', CheckType.CHECKED)
    compare()
    collapseTree(compact, 'A', true)
    collapseTree(legacy, 'A', true)
    compare()
    collapseTree(compact, 'A', false)
    collapseTree(legacy, 'A', false)
    compare()
  })

  it('search candidate index matches full scan for substring queries', () => {
    const indexed = newTree('root', 26, SelectType.CHECKBOX)
    const fullScan = newTree('root', 26, SelectType.CHECKBOX)
    setUseSearchCandidateIndex(indexed, true)
    setUseSearchCandidateIndex(fullScan, false)
    for (const target of [indexed, fullScan]) {
      pushNeighborNode(target, 'A', 'Alpha beta', 'root')
      pushNeighborNode(target, 'A1', 'child needle', 'A')
      pushNeighborNode(target, 'B', 'Gamma needle', 'root')
      pushNeighborNode(target, 'C', 'Delta', 'root')
      popNeighbor(target)
      setBoundary(target, 0, 500)
    }
    for (const keyword of ['needle', 'eta', 'ma', 'missing']) {
      expect(fuzzyTree(indexed, keyword)).toBe(fuzzyTree(fullScan, keyword))
    }
  })

  it('search candidate index preserves the 5,000-result limit and invalidates safely', () => {
    const indexed = newTree('root', 26, SelectType.CHECKBOX)
    const fullScan = newTree('root', 26, SelectType.CHECKBOX)
    setUseSearchCandidateIndex(indexed, true)
    setUseSearchCandidateIndex(fullScan, false)
    for (let i = 0; i < 5005; i++) {
      const id = `match-${i}`
      pushNeighborNode(indexed, id, `common searchable node ${i}`, 'root')
      pushNeighborNode(fullScan, id, `common searchable node ${i}`, 'root')
    }
    popNeighbor(indexed)
    popNeighbor(fullScan)
    setBoundary(indexed, 0, 200000)
    setBoundary(fullScan, 0, 200000)

    expect(JSON.parse(fuzzyTree(indexed, 'common'))).toEqual(
      JSON.parse(fuzzyTree(fullScan, 'common'))
    )
    expect(JSON.parse(fuzzyTree(indexed, 'common'))).toHaveLength(5000)
    setUseSearchCandidateIndex(indexed, false)
    expect(JSON.parse(fuzzyTree(indexed, 'node'))).toEqual(
      JSON.parse(fuzzyTree(fullScan, 'node'))
    )
  })

  it('search candidate index invalidates after clear and tree rebuild', () => {
    const indexed = newTree('root', 26, SelectType.CHECKBOX)
    const fullScan = newTree('root', 26, SelectType.CHECKBOX)
    setUseSearchCandidateIndex(indexed, true)
    setUseSearchCandidateIndex(fullScan, false)

    for (const target of [indexed, fullScan]) {
      pushNeighborNode(target, 'old', 'old searchable value', 'root')
      popNeighbor(target)
    }
    expect(fuzzyTree(indexed, 'old')).toBe(fuzzyTree(fullScan, 'old'))

    clear(indexed)
    clear(fullScan)
    for (const target of [indexed, fullScan]) {
      pushNeighborNode(target, 'new', 'new searchable value', 'root')
      pushNeighborNode(target, 'new-child', 'child searchable value', 'new')
      popNeighbor(target)
      setBoundary(target, 0, 500)
    }
    expect(fuzzyTree(indexed, 'old')).toBe(fuzzyTree(fullScan, 'old'))
    expect(fuzzyTree(indexed, 'searchable')).toBe(
      fuzzyTree(fullScan, 'searchable')
    )
  })

  it('RADIO 模式完整流程', () => {
    const tree = newTree('', 26, SelectType.RADIO)
    clear(tree)
    pushNeighborNode(tree, 'R1', 'Radio1', '')
    pushNeighborNode(tree, 'R2', 'Radio2', '')
    pushNeighborNode(tree, 'R3', 'Radio3', '')
    popNeighbor(tree)
    setBoundary(tree, 0, 5000)

    checkNode(tree, 'R1', CheckType.CHECKED)
    let result = JSON.parse(getCheckedNodes(tree))
    expect(result.id).toBe('R1')

    checkNode(tree, 'R3', CheckType.CHECKED)
    result = JSON.parse(getCheckedNodes(tree))
    expect(result.id).toBe('R3')
  })

  it('枚举值导出正确', () => {
    expect(CheckType.UNCHECKED).toBe(0)
    expect(CheckType.HALF_CHECKED).toBe(1)
    expect(CheckType.CHECKED).toBe(2)
    expect(SelectType.CHECKBOX).toBe(0)
    expect(SelectType.RADIO).toBe(1)
    expect(SelectType.SELECT).toBe(2)
    expect(DisplayType.TREE).toBe(0)
    expect(DisplayType.SEARCH).toBe(1)
  })
})
