import { describe, it, expect } from 'vitest'
import {
  newTree,
  pushNeighborNode,
  popNeighbor,
  getShownNodes,
  getShownHeight,
  setBoundary,
  clear,
  fuzzyTree,
  isSearchTruncated,
  collapseTree,
  switchDisplayTree,
  checkNode,
  SelectType,
  DisplayType,
  CheckType,
} from '../wasm-bridge'

function buildSearchTree() {
  const tree = newTree('', 26, SelectType.CHECKBOX)
  clear(tree)
  pushNeighborNode(tree, 'apple', 'Apple', '')
  pushNeighborNode(tree, 'apple-pie', 'Apple Pie', 'apple')
  pushNeighborNode(tree, 'apple-juice', 'Apple Juice', 'apple')
  pushNeighborNode(tree, 'banana', 'Banana', '')
  pushNeighborNode(tree, 'cherry', 'Cherry', '')
  popNeighbor(tree)
  setBoundary(tree, 0, 5000)
  return tree
}

describe('tree-search: 模糊搜索', () => {
  it('关键词匹配到叶子节点（含祖先）', () => {
    const tree = buildSearchTree()
    const result = JSON.parse(fuzzyTree(tree, 'Pie')) as any[]
    const ids = result.map((n: any) => n.id)
    expect(ids).toContain('apple-pie')
    expect(ids).toContain('apple')
  })

  it('关键词匹配到多个节点', () => {
    const tree = buildSearchTree()
    const result = JSON.parse(fuzzyTree(tree, 'Apple')) as any[]
    const ids = result.map((n: any) => n.id)
    expect(ids).toContain('apple')
    expect(ids).toContain('apple-pie')
    expect(ids).toContain('apple-juice')
  })

  it('无匹配返回空数组', () => {
    const tree = buildSearchTree()
    const result = JSON.parse(fuzzyTree(tree, 'Watermelon')) as any[]
    expect(result.length).toBe(0)
  })

  it('空关键词恢复完整树', () => {
    const tree = buildSearchTree()
    fuzzyTree(tree, 'Apple')
    fuzzyTree(tree, '')
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    const topLevel = nodes.filter((n: any) => n.deep === 0)
    expect(topLevel.length).toBe(3)
  })

  it('搜索中选中父节点后清空搜索，子节点状态仍保留', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    pushNeighborNode(tree, 'parent', 'Searchable parent', '')
    pushNeighborNode(tree, 'child', 'Hidden child', 'parent')
    pushNeighborNode(tree, 'grandchild', 'Hidden grandchild', 'child')
    popNeighbor(tree)
    setBoundary(tree, 0, 5000)

    fuzzyTree(tree, 'Searchable')
    checkNode(tree, 'parent', CheckType.CHECKED)
    fuzzyTree(tree, '')
    collapseTree(tree, 'parent', false)
    collapseTree(tree, 'child', false)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]

    expect(nodes.find(node => node.id === 'parent')?.checked).toBe(
      CheckType.CHECKED
    )
    expect(nodes.find(node => node.id === 'child')?.checked).toBe(
      CheckType.CHECKED
    )
    expect(nodes.find(node => node.id === 'grandchild')?.checked).toBe(
      CheckType.CHECKED
    )
  })

  it('搜索结果包含祖先节点自动补全', () => {
    const tree = buildSearchTree()
    const result = JSON.parse(fuzzyTree(tree, 'Juice')) as any[]
    const ids = result.map((n: any) => n.id)
    expect(ids).toContain('apple')
    expect(ids).toContain('apple-juice')
    expect(ids).not.toContain('banana')
  })

  it('搜索后操作不崩溃', () => {
    const tree = buildSearchTree()
    fuzzyTree(tree, 'Apple')
    expect(() => {
      collapseTree(tree, 'apple', false)
      getShownNodes(tree)
    }).not.toThrow()
  })

  it('搜索后切换回完整树', () => {
    const tree = buildSearchTree()
    fuzzyTree(tree, 'Apple')
    switchDisplayTree(tree, DisplayType.TREE)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    const topLevel = nodes.filter((n: any) => n.deep === 0)
    expect(topLevel.length).toBe(3)
  })

  it('搜索结果达到上限时给出截断标志', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    for (let i = 0; i < 6000; i++)
      pushNeighborNode(tree, `n${i}`, `match ${i}`, '')
    popNeighbor(tree)
    fuzzyTree(tree, 'match')
    expect(isSearchTruncated(tree)).toBe(true)
    fuzzyTree(tree, '')
    expect(isSearchTruncated(tree)).toBe(false)

    const small = newTree('', 26, SelectType.CHECKBOX)
    for (let i = 0; i < 100; i++)
      pushNeighborNode(small, `m${i}`, `match ${i}`, '')
    popNeighbor(small)
    fuzzyTree(small, 'match')
    expect(isSearchTruncated(small)).toBe(false)
  })

  it('切到 SEARCH 视图保留全部搜索结果，并可来回切换', () => {
    const tree = buildSearchTree()
    fuzzyTree(tree, 'Apple')
    setBoundary(tree, 0, 5000)
    const searchRows = JSON.parse(getShownNodes(tree)).map(
      (node: { id: string }) => node.id
    )

    switchDisplayTree(tree, DisplayType.SEARCH)
    expect(
      JSON.parse(getShownNodes(tree)).map((node: { id: string }) => node.id)
    ).toEqual(searchRows)

    switchDisplayTree(tree, DisplayType.TREE)
    expect(getShownHeight(tree)).toBeGreaterThan(0)

    switchDisplayTree(tree, DisplayType.SEARCH)
    expect(
      JSON.parse(getShownNodes(tree)).map((node: { id: string }) => node.id)
    ).toEqual(searchRows)
  })

  it('连续搜索不同关键词', () => {
    const tree = buildSearchTree()
    const r1 = JSON.parse(fuzzyTree(tree, 'Apple')) as any[]
    const r2 = JSON.parse(fuzzyTree(tree, 'Ban')) as any[]
    const ids2 = r2.map((n: any) => n.id)
    expect(ids2).toContain('banana')
    expect(ids2).not.toContain('apple')
  })
})
