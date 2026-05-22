import { describe, it, expect } from 'vitest'
import {
  newTree,
  pushNeighborNode,
  popNeighbor,
  getShownNodes,
  getShownHeight,
  setBoundary,
  clear,
  collapseTree,
  SelectType,
} from '../wasm-bridge'

function buildTree() {
  const tree = newTree('', 26, SelectType.CHECKBOX)
  clear(tree)
  pushNeighborNode(tree, 'A', 'NodeA', '')
  pushNeighborNode(tree, 'A1', 'NodeA1', 'A')
  pushNeighborNode(tree, 'A1a', 'NodeA1a', 'A1')
  pushNeighborNode(tree, 'A2', 'NodeA2', 'A')
  pushNeighborNode(tree, 'B', 'NodeB', '')
  pushNeighborNode(tree, 'B1', 'NodeB1', 'B')
  popNeighbor(tree)
  setBoundary(tree, 0, 1000)
  return tree
}

describe('tree-visibility: 展开/折叠', () => {
  it('初始状态：仅顶层可见', () => {
    const tree = buildTree()
    const height = getShownHeight(tree)
    expect(height).toBe(2 * 26) // A + B
  })

  it('展开节点 A', () => {
    const tree = buildTree()
    const beforeHeight = getShownHeight(tree)
    collapseTree(tree, 'A', false)
    const afterHeight = getShownHeight(tree)
    expect(afterHeight).toBeGreaterThan(beforeHeight)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    const ids = nodes.map((n: any) => n.id)
    expect(ids).toContain('A1')
    expect(ids).toContain('A2')
  })

  it('折叠已展开节点', () => {
    const tree = buildTree()
    const initHeight = getShownHeight(tree)
    collapseTree(tree, 'A', false)
    collapseTree(tree, 'A', true)
    expect(getShownHeight(tree)).toBe(initHeight)
  })

  it('嵌套展开', () => {
    const tree = buildTree()
    collapseTree(tree, 'A', false)
    collapseTree(tree, 'A1', false)
    setBoundary(tree, 0, 5000)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    const ids = nodes.map((n: any) => n.id)
    expect(ids).toContain('A1a')
  })

  it('折叠祖先→后代全部隐藏', () => {
    const tree = buildTree()
    collapseTree(tree, 'A', false)
    collapseTree(tree, 'A1', false)
    collapseTree(tree, 'A', true)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    const ids = nodes.map((n: any) => n.id)
    expect(ids).not.toContain('A1')
    expect(ids).not.toContain('A1a')
    expect(ids).not.toContain('A2')
  })

  it('设置滚动边界后 getShownNodes 返回视窗内节点', () => {
    const tree = buildTree()
    collapseTree(tree, 'A', false)
    collapseTree(tree, 'B', false)
    setBoundary(tree, 0, 200)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.length).toBeLessThanOrEqual(10)
  })

  it('滚动偏移返回不同节点', () => {
    const tree = buildTree()
    collapseTree(tree, 'A', false)
    collapseTree(tree, 'B', false)
    setBoundary(tree, 0, 52)
    const nodesA = JSON.parse(getShownNodes(tree)) as any[]
    setBoundary(tree, 78, 52)
    const nodesB = JSON.parse(getShownNodes(tree)) as any[]
    const idsA = nodesA.map((n: any) => n.id)
    const idsB = nodesB.map((n: any) => n.id)
    expect(idsA).not.toEqual(idsB)
  })

  it('空树 getShownHeight 返回 0', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    popNeighbor(tree)
    expect(getShownHeight(tree)).toBe(0)
  })

  it('空树 getShownNodes 返回空数组', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    popNeighbor(tree)
    setBoundary(tree, 0, 500)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    expect(nodes).toEqual([])
  })

  it('连续相同参数调用 getShownNodes 返回一致结果（缓存）', () => {
    const tree = buildTree()
    setBoundary(tree, 0, 200)
    const result1 = getShownNodes(tree)
    const result2 = getShownNodes(tree)
    expect(result1).toBe(result2)
  })

  it('展开后缓存失效', () => {
    const tree = buildTree()
    setBoundary(tree, 0, 500)
    const before = getShownNodes(tree)
    collapseTree(tree, 'A', false)
    const after = getShownNodes(tree)
    expect(before).not.toBe(after)
  })

  it('叶子节点展开/折叠不影响高度', () => {
    const tree = buildTree()
    collapseTree(tree, 'A', false)
    setBoundary(tree, 0, 5000)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    const leaf = nodes.find((n: any) => n.rightNode - n.leftNode === 1)
    if (leaf) {
      const heightBefore = getShownHeight(tree)
      collapseTree(tree, leaf.id, false)
      expect(getShownHeight(tree)).toBe(heightBefore)
    }
  })
})
