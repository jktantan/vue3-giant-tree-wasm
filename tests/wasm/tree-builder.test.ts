import { describe, it, expect, beforeEach } from 'vitest'
import {
  newTree,
  pushNeighborNode,
  popNeighbor,
  setNeighborTree,
  setMpttTree,
  pushMpttNode,
  popMptt,
  getSize,
  getShownNodes,
  getAllNodes,
  getShownHeight,
  setBoundary,
  clear,
  pushNeighborNodesUtf8,
  SelectType,
} from '../wasm-bridge'

function buildSimpleTree() {
  const tree = newTree('', 26, SelectType.CHECKBOX)
  clear(tree)
  pushNeighborNode(tree, 'A', 'NodeA', '')
  pushNeighborNode(tree, 'A1', 'NodeA1', 'A')
  pushNeighborNode(tree, 'A2', 'NodeA2', 'A')
  pushNeighborNode(tree, 'B', 'NodeB', '')
  pushNeighborNode(tree, 'B1', 'NodeB1', 'B')
  popNeighbor(tree)
  setBoundary(tree, 0, 1000)
  return tree
}

describe('tree-builder: 树构建', () => {
  it('创建空树返回有效引用', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    expect(tree).not.toBeNull()
    expect(tree).toBeDefined()
  })

  it('逐条推入邻接表节点后 popNeighbor', () => {
    const tree = buildSimpleTree()
    expect(getSize(tree)).toBe(5)
  })

  it('UTF-8 连续输入与逐条邻接表输入保留顺序、禁用和 Unicode', () => {
    const fields = ['A', '\u6839\u8282\u70b9', 'root', 'A1', '\u5b50\u8282\u70b9', 'A']
    const values = fields.map(value => new TextEncoder().encode(value))
    const encoded = new Uint8Array(32 + values.reduce((total, value) => total + value.length, 0))
    const view = new DataView(encoded.buffer)
    let cursor = 0
    for (let record = 0; record < 2; record++) {
      const field = record * 3
      view.setInt32(cursor, values[field].length, true)
      view.setInt32(cursor + 4, values[field + 1].length, true)
      view.setInt32(cursor + 8, values[field + 2].length, true)
      view.setInt32(cursor + 12, record, true)
      cursor += 16
      for (let index = field; index < field + 3; index++) {
        encoded.set(values[index], cursor)
        cursor += values[index].length
      }
    }
    const tree = newTree('root', 26, SelectType.CHECKBOX)
    pushNeighborNodesUtf8(tree, encoded)
    popNeighbor(tree)
    setBoundary(tree, 0, 1000)

    expect(JSON.parse(getAllNodes(tree))).toMatchObject([
      { id: 'A', name: '\u6839\u8282\u70b9', parentId: 'root', disabled: false },
      { id: 'A1', name: '\u5b50\u8282\u70b9', parentId: 'A', disabled: true },
    ])
  })

  it('空数据 popNeighbor 不崩溃', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    popNeighbor(tree)
    expect(getSize(tree)).toBe(0)
  })

  it('MPTT leftNode/rightNode 范围正确', () => {
    const tree = buildSimpleTree()
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    // 展开 A 查看子节点
    // 初始只有顶层可见，验证顶层节点的 MPTT 范围
    const nodeA = nodes.find((n: any) => n.id === 'A')
    const nodeB = nodes.find((n: any) => n.id === 'B')
    expect(nodeA).toBeDefined()
    expect(nodeB).toBeDefined()
    // A 有两个子节点，右边界 - 左边界应该 > 1
    expect(nodeA.rightNode - nodeA.leftNode).toBeGreaterThan(1)
    // B 有一个子节点
    expect(nodeB.rightNode - nodeB.leftNode).toBeGreaterThan(1)
    // A 和 B 的范围不重叠
    expect(nodeA.rightNode).toBeLessThan(nodeB.leftNode)
  })

  it('deep 深度值正确', () => {
    const tree = buildSimpleTree()
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    for (const node of nodes) {
      expect(node.deep).toBe(0)
    }
  })

  it('初始仅顶层节点可见', () => {
    const tree = buildSimpleTree()
    const nodes = JSON.parse(getShownNodes(tree)) as any[]
    expect(nodes.length).toBe(2) // A and B
    expect(nodes.every((n: any) => n.deep === 0)).toBe(true)
  })

  it('setNeighborTree JSON 输入', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    const jsonData = JSON.stringify([
      { id: 'X', name: 'NodeX', parentId: '' },
      { id: 'X1', name: 'NodeX1', parentId: 'X' },
      { id: 'Y', name: 'NodeY', parentId: '' },
    ])
    setNeighborTree(tree, jsonData)
    expect(getSize(tree)).toBe(3)
  })

  it('setMpttTree 直接加载 MPTT 数据', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    const mpttData = JSON.stringify([
      {
        id: 'P',
        name: 'NodeP',
        parentId: '',
        leftNode: 0,
        rightNode: 3,
        deep: 0,
      },
      {
        id: 'P1',
        name: 'NodeP1',
        parentId: 'P',
        leftNode: 1,
        rightNode: 2,
        deep: 1,
      },
    ])
    setMpttTree(tree, mpttData)
    expect(getSize(tree)).toBe(2)
  })

  it('pushMpttNode + popMptt', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    pushMpttNode(tree, 'M1', 'NodeM1', '', 0, 3, 0)
    pushMpttNode(tree, 'M2', 'NodeM2', 'M1', 1, 2, 1)
    popMptt(tree)
    expect(getSize(tree)).toBe(2)
  })

  it('clear 重置状态', () => {
    const tree = buildSimpleTree()
    expect(getSize(tree)).toBe(5)
    clear(tree)
    expect(getSize(tree)).toBe(0)
  })

  it('大量节点(1000)构建不崩溃', () => {
    const tree = newTree('root', 26, SelectType.CHECKBOX)
    clear(tree)
    for (let i = 0; i < 100; i++) {
      pushNeighborNode(tree, `p${i}`, `Parent${i}`, 'root')
      for (let j = 0; j < 9; j++) {
        pushNeighborNode(tree, `p${i}c${j}`, `Child${i}-${j}`, `p${i}`)
      }
    }
    popNeighbor(tree)
    expect(getSize(tree)).toBe(1000)
  })

  it('重复 ID 不崩溃', () => {
    const tree = newTree('', 26, SelectType.CHECKBOX)
    clear(tree)
    pushNeighborNode(tree, 'dup', 'Node1', '')
    pushNeighborNode(tree, 'dup', 'Node2', '')
    popNeighbor(tree)
    expect(getSize(tree)).toBe(2)
  })
})
