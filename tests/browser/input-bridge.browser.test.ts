import { describe, expect, it } from 'vitest'
import {
  newTree,
  pushNeighborNodesUtf8,
  popNeighbor,
  getSize,
  getInputNodeLayouts,
  clearInputNodeLayouts,
  setBoundary,
  getShownIndices,
  getNodeSelectionStates,
  SelectType,
} from '../../build/release'

function encodeTree(size: number) {
  const encoder = new TextEncoder()
  const fields: Uint8Array[] = []
  let byteLength = size * 16
  for (let index = 0; index < size; index++) {
    const values = [
      `n${index}`,
      `Node ${index}`,
      index === 0 ? 'root' : `n${Math.floor((index - 1) / 10)}`,
    ].map(value => encoder.encode(value))
    fields.push(...values)
    byteLength += values.reduce((sum, value) => sum + value.length, 0)
  }
  const payload = new Uint8Array(byteLength)
  const view = new DataView(payload.buffer)
  let cursor = 0
  for (let index = 0; index < size; index++) {
    const values = fields.slice(index * 3, index * 3 + 3)
    view.setInt32(cursor, values[0].length, true)
    view.setInt32(cursor + 4, values[1].length, true)
    view.setInt32(cursor + 8, values[2].length, true)
    view.setInt32(cursor + 12, 0, true)
    cursor += 16
    for (const value of values) {
      payload.set(value, cursor)
      cursor += value.length
    }
  }
  return payload
}

describe('binary input bridge', () => {
  it('builds 1,050 nodes directly through browser glue', () => {
    const samples: number[] = []
    const payload = encodeTree(1_050)
    for (let round = 0; round < 10; round++) {
      const started = performance.now()
      const tree = newTree('root', 26, SelectType.CHECKBOX)
      pushNeighborNodesUtf8(tree, payload)
      popNeighbor(tree)
      const layouts = getInputNodeLayouts(tree) as number[]
      expect(layouts).toHaveLength(1_050 * 5)
      clearInputNodeLayouts(tree)
      setBoundary(tree, 0, 520)
      const shown = getShownIndices(tree) as number[]
      expect(shown.length).toBeGreaterThan(0)
      expect(getNodeSelectionStates(tree, shown)).toHaveLength(shown.length)
      samples.push(performance.now() - started)
      expect(getSize(tree)).toBe(1_050)
    }
    const sorted = [...samples].sort((a, b) => a - b)
    console.info(
      'browser-input-bridge',
      JSON.stringify({
        samples: samples.length,
        p50Ms: sorted[4],
        p95Ms: sorted[9],
        maxMs: sorted[9],
      })
    )
  })
})
