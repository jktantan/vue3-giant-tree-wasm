import { describe, it, expect } from 'vitest'
import {
  newTree,
  pushNeighborNode,
  popNeighbor,
  getSize,
  getShownNodes,
  getShownHeight,
  getCheckedNodes,
  setBoundary,
  clear,
  checkNode,
  clearCheckedNodes,
  collapseTree,
  fuzzyTree,
  SelectType,
  CheckType,
  DisplayType,
} from '../wasm-bridge'

describe('giant-tree: 集成测试', () => {
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
