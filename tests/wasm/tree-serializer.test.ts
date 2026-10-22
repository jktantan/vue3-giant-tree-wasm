import { describe, it, expect } from 'vitest'
import {
  newTree,
  pushNeighborNode,
  popNeighbor,
  getShownNodes,
  setBoundary,
  clear,
  checkNode,
  SelectType,
  CheckType,
} from '../wasm-bridge'

describe('tree-serializer: 序列化', () => {
  it('空数组序列化返回 "[]"', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    popNeighbor(tree)
    setBoundary(tree, 0, 500)
    const result = getShownNodes(tree)
    expect(result).toBe('[]')
  })

  it('单节点序列化字段完整', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    pushNeighborNode(tree, 'only', 'OnlyNode', '')
    popNeighbor(tree)
    setBoundary(tree, 0, 500)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    expect(nodes.length).toBe(1)
    const node = nodes[0]
    expect(node).toHaveProperty('id')
    expect(node).toHaveProperty('name')
    expect(node).toHaveProperty('parentId')
    expect(node).toHaveProperty('leftNode')
    expect(node).toHaveProperty('rightNode')
    expect(node).toHaveProperty('deep')
    expect(node).toHaveProperty('checked')
    expect(node).toHaveProperty('selected')
    expect(node).toHaveProperty('collapsed')
  })

  it('序列化结果可被 JSON.parse 解析', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    pushNeighborNode(tree, 'n1', 'Node1', '')
    pushNeighborNode(tree, 'n2', 'Node2', '')
    popNeighbor(tree)
    setBoundary(tree, 0, 500)
    expect(() => JSON.parse(getShownNodes(tree))).not.toThrow()
  })

  it('大视口逐行序列化完整且可解析', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    for (let i = 0; i < 500; i++)
      pushNeighborNode(tree, `n${i}`, `Node "${i}" \\ value`, '')
    popNeighbor(tree)
    setBoundary(tree, 0, 26 * 400)
    const nodes = JSON.parse(getShownNodes(tree)) as Array<{
      id: string
      leftNode: number
    }>
    // ceil((0 + 400 * 26) / 26) + 1, clamped to the 500 available rows.
    expect(nodes.length).toBe(401)
    expect(nodes[0].id).toBe('n0')
    expect(nodes[nodes.length - 1].id).toBe('n400')
    expect(nodes.every(node => typeof node.leftNode === 'number')).toBe(true)
  })

  it('checked/selected 状态正确反映在序列化结果中', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    pushNeighborNode(tree, 'c1', 'Check1', '')
    pushNeighborNode(tree, 'c2', 'Check2', '')
    popNeighbor(tree)
    setBoundary(tree, 0, 500)
    checkNode(tree, 'c1', CheckType.CHECKED)
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    const c1 = nodes.find((n: any) => n.id === 'c1')
    const c2 = nodes.find((n: any) => n.id === 'c2')
    expect(c1.checked).toBe(CheckType.CHECKED)
    expect(c2.checked).toBe(CheckType.UNCHECKED)
  })
})
