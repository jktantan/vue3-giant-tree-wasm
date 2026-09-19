import { describe, it, expect, beforeEach } from 'vitest'
import {
  newTree,
  pushNeighborNode,
  popNeighbor,
  getSize,
  getShownNodes,
  setBoundary,
  clear,
  checkNode,
  getCheckedNodes,
  getCheckedIdList,
  clearCheckedNodes,
  setCheckedNodes,
  setCheckedNode,
  collapseTree,
  getNodeSelectionStates,
  SelectType,
  CheckType,
} from '../wasm-bridge'

function buildCheckboxTree() {
  const tree = newTree('', 26, SelectType.CHECKBOX)
  clear(tree)
  pushNeighborNode(tree, 'A', 'NodeA', '')
  pushNeighborNode(tree, 'A1', 'NodeA1', 'A')
  pushNeighborNode(tree, 'A2', 'NodeA2', 'A')
  pushNeighborNode(tree, 'B', 'NodeB', '')
  pushNeighborNode(tree, 'B1', 'NodeB1', 'B')
  popNeighbor(tree)
  setBoundary(tree, 0, 2000)
  return tree
}

function buildRadioTree() {
  const tree = newTree('', 26, SelectType.RADIO)
  clear(tree)
  pushNeighborNode(tree, 'A', 'NodeA', '')
  pushNeighborNode(tree, 'A1', 'NodeA1', 'A')
  pushNeighborNode(tree, 'B', 'NodeB', '')
  pushNeighborNode(tree, 'B1', 'NodeB1', 'B')
  popNeighbor(tree)
  setBoundary(tree, 0, 2000)
  return tree
}

function buildSelectTree() {
  const tree = newTree('', 26, SelectType.SELECT)
  clear(tree)
  pushNeighborNode(tree, 'A', 'NodeA', '')
  pushNeighborNode(tree, 'A1', 'NodeA1', 'A')
  pushNeighborNode(tree, 'B', 'NodeB', '')
  popNeighbor(tree)
  setBoundary(tree, 0, 2000)
  return tree
}

function getAllNodes(tree: any) {
  collapseTree(tree, 'A', false)
  collapseTree(tree, 'B', false)
  setBoundary(tree, 0, 5000)
  return JSON.parse(getShownNodes(tree)) as any[]
}

describe('tree-check: CHECKBOX 模式', () => {
  it('选中叶子节点→父节点变半选', () => {
    const tree = buildCheckboxTree()
    checkNode(tree, 'A1', CheckType.CHECKED)
    const nodes = getAllNodes(tree)
    const a1 = nodes.find((n: any) => n.id === 'A1')
    const a = nodes.find((n: any) => n.id === 'A')
    expect(a1.checked).toBe(CheckType.CHECKED)
    expect(a.checked).toBe(CheckType.HALF_CHECKED)
  })

  it('选中第三层叶子节点→所有祖先均为半选', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    pushNeighborNode(tree, 'A', 'A', '')
    pushNeighborNode(tree, 'A1', 'A1', 'A')
    pushNeighborNode(tree, 'A1a', 'A1a', 'A1')
    pushNeighborNode(tree, 'A1b', 'A1b', 'A1')
    pushNeighborNode(tree, 'B', 'B', '')
    popNeighbor(tree)
    setBoundary(tree, 0, 5000)

    checkNode(tree, 'A1a', CheckType.CHECKED)
    collapseTree(tree, 'A', false)
    collapseTree(tree, 'A1', false)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]

    expect(nodes.find(node => node.id === 'A')?.checked).toBe(
      CheckType.HALF_CHECKED
    )
    expect(nodes.find(node => node.id === 'A1')?.checked).toBe(
      CheckType.HALF_CHECKED
    )
    expect(nodes.find(node => node.id === 'A1a')?.checked).toBe(
      CheckType.CHECKED
    )
  })

  it('全选所有子节点→父节点自动全选', () => {
    const tree = buildCheckboxTree()
    checkNode(tree, 'A1', CheckType.CHECKED)
    checkNode(tree, 'A2', CheckType.CHECKED)
    const nodes = getAllNodes(tree)
    const a = nodes.find((n: any) => n.id === 'A')
    expect(a.checked).toBe(CheckType.CHECKED)
  })

  it('选中父节点→所有子节点自动选中', () => {
    const tree = buildCheckboxTree()
    checkNode(tree, 'A', CheckType.CHECKED)
    const nodes = getAllNodes(tree)
    const a1 = nodes.find((n: any) => n.id === 'A1')
    const a2 = nodes.find((n: any) => n.id === 'A2')
    expect(a1.checked).toBe(CheckType.CHECKED)
    expect(a2.checked).toBe(CheckType.CHECKED)
  })

  it('取消选中父节点→子节点全部取消', () => {
    const tree = buildCheckboxTree()
    checkNode(tree, 'A', CheckType.CHECKED)
    checkNode(tree, 'A', CheckType.UNCHECKED)
    const nodes = getAllNodes(tree)
    const a1 = nodes.find((n: any) => n.id === 'A1')
    const a2 = nodes.find((n: any) => n.id === 'A2')
    expect(a1.checked).toBe(CheckType.UNCHECKED)
    expect(a2.checked).toBe(CheckType.UNCHECKED)
  })

  it('取消一个子节点→父变半选', () => {
    const tree = buildCheckboxTree()
    checkNode(tree, 'A', CheckType.CHECKED)
    checkNode(tree, 'A1', CheckType.UNCHECKED)
    const nodes = getAllNodes(tree)
    const a = nodes.find((n: any) => n.id === 'A')
    expect(a.checked).toBe(CheckType.HALF_CHECKED)
  })

  it('getCheckedNodes 返回所有已选中节点', () => {
    const tree = buildCheckboxTree()
    checkNode(tree, 'A1', CheckType.CHECKED)
    checkNode(tree, 'B1', CheckType.CHECKED)
    const result = JSON.parse(getCheckedNodes(tree)) as any[]
    const ids = result.map((n: any) => n.id)
    expect(ids).toContain('A1')
    expect(ids).toContain('B1')
  })

  it('getCheckedIdList 保持输出模式并避免 JSON 往返', () => {
    const tree = buildCheckboxTree()
    checkNode(tree, 'A', CheckType.CHECKED)
    checkNode(tree, 'B1', CheckType.CHECKED)
    expect(getCheckedIdList(tree)).toEqual(['A', 'A1', 'A2', 'B', 'B1'])
  })

  it('clearCheckedNodes 清空所有选中', () => {
    const tree = buildCheckboxTree()
    checkNode(tree, 'A', CheckType.CHECKED)
    clearCheckedNodes(tree)
    const result = JSON.parse(getCheckedNodes(tree)) as any[]
    expect(result.length).toBe(0)
  })

  it('setCheckedNodes 批量设置选中', () => {
    const tree = buildCheckboxTree()
    setCheckedNodes(tree, ['A1', 'B1'])
    const nodes = getAllNodes(tree)
    const a1 = nodes.find((n: any) => n.id === 'A1')
    const b1 = nodes.find((n: any) => n.id === 'B1')
    expect(a1.checked).toBe(CheckType.CHECKED)
    expect(b1.checked).toBe(CheckType.CHECKED)
  })

  it('setCheckedNode 在 CHECKBOX 模式传播到子树', () => {
    const tree = buildCheckboxTree()
    setCheckedNode(tree, 'A')
    const nodes = getAllNodes(tree)
    expect(nodes.find(node => node.id === 'A')?.checked).toBe(CheckType.CHECKED)
    expect(nodes.find(node => node.id === 'A1')?.checked).toBe(
      CheckType.CHECKED
    )
    expect(nodes.find(node => node.id === 'A2')?.checked).toBe(
      CheckType.CHECKED
    )
  })

  it('按索引读取选择状态会返回最新的 checkbox 状态', () => {
    const tree = buildCheckboxTree()
    checkNode(tree, 'A', CheckType.CHECKED)

    // Preorder indices: A, A1, A2, B, B1.
    expect(getNodeSelectionStates(tree, [0, 1, 2, 4])).toEqual([
      CheckType.CHECKED << 8,
      CheckType.CHECKED << 8,
      CheckType.CHECKED << 8,
      CheckType.UNCHECKED << 8,
    ])
  })
})

describe('tree-check: RADIO 模式', () => {
  it('选中一个节点', () => {
    const tree = buildRadioTree()
    checkNode(tree, 'A1', CheckType.CHECKED)
    const result = getCheckedNodes(tree)
    const node = JSON.parse(result)
    expect(node.id).toBe('A1')
  })

  it('切换选中：先选A1再选B1', () => {
    const tree = buildRadioTree()
    checkNode(tree, 'A1', CheckType.CHECKED)
    checkNode(tree, 'B1', CheckType.CHECKED)
    const result = getCheckedNodes(tree)
    const node = JSON.parse(result)
    expect(node.id).toBe('B1')
  })

  it('getCheckedNodes 返回单个对象（非数组）', () => {
    const tree = buildRadioTree()
    checkNode(tree, 'A', CheckType.CHECKED)
    const result = getCheckedNodes(tree)
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe('A')
    expect(Array.isArray(parsed)).toBe(false)
  })
})

describe('tree-check: SELECT 模式', () => {
  it('点击选中设置 selected 字段', () => {
    const tree = buildSelectTree()
    checkNode(tree, 'A1', CheckType.CHECKED)
    collapseTree(tree, 'A', false)
    setBoundary(tree, 0, 5000)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    const a1 = nodes.find((n: any) => n.id === 'A1')
    expect(a1.selected).toBe(CheckType.CHECKED)
  })

  it('切换 selected：先选A1再选B', () => {
    const tree = buildSelectTree()
    checkNode(tree, 'A1', CheckType.CHECKED)
    checkNode(tree, 'B', CheckType.CHECKED)
    collapseTree(tree, 'A', false)
    setBoundary(tree, 0, 5000)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    const a1 = nodes.find((n: any) => n.id === 'A1')
    const b = nodes.find((n: any) => n.id === 'B')
    expect(a1.selected).toBe(CheckType.UNCHECKED)
    expect(b.selected).toBe(CheckType.CHECKED)
  })

  it('getCheckedNodes 返回 selected 的节点', () => {
    const tree = buildSelectTree()
    checkNode(tree, 'A', CheckType.CHECKED)
    const result = getCheckedNodes(tree)
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe('A')
  })

  it('setCheckedNode 单节点设置', () => {
    const tree = buildSelectTree()
    setCheckedNode(tree, 'B')
    const result = getCheckedNodes(tree)
    const parsed = JSON.parse(result)
    expect(parsed.id).toBe('B')
  })
})
