import { describe, expect, it } from 'vitest'
import {
  clearLazyCheckedRanges,
  lazyGetCheckedPoint,
  lazyGetRangeCount,
  lazySetCheckedRange,
  newLazyCheckRangeStore,
} from '../wasm-bridge'

describe('LazyCheckRangeStore', () => {
  it('returns the newest range value and preserves unaffected points', () => {
    const store = newLazyCheckRangeStore()
    lazySetCheckedRange(store, 10, 30, 2)
    lazySetCheckedRange(store, 15, 20, 0)

    expect(lazyGetCheckedPoint(store, 9)).toBe(-1)
    expect(lazyGetCheckedPoint(store, 10)).toBe(2)
    expect(lazyGetCheckedPoint(store, 14)).toBe(2)
    expect(lazyGetCheckedPoint(store, 15)).toBe(0)
    expect(lazyGetCheckedPoint(store, 19)).toBe(0)
    expect(lazyGetCheckedPoint(store, 20)).toBe(2)
    expect(lazyGetCheckedPoint(store, 30)).toBe(-1)
    expect(lazyGetRangeCount(store)).toBe(3)
  })

  it('merges adjacent equal values and clears all overrides', () => {
    const store = newLazyCheckRangeStore()
    lazySetCheckedRange(store, 0, 10, 2)
    lazySetCheckedRange(store, 10, 20, 2)
    lazySetCheckedRange(store, 20, 30, 0)

    expect(lazyGetRangeCount(store)).toBe(2)
    expect(lazyGetCheckedPoint(store, 19)).toBe(2)
    expect(lazyGetCheckedPoint(store, 20)).toBe(0)
    clearLazyCheckedRanges(store)
    expect(lazyGetRangeCount(store)).toBe(0)
    expect(lazyGetCheckedPoint(store, 5)).toBe(-1)
  })

  it('replaces multiple existing ranges without breaking sort order', () => {
    const store = newLazyCheckRangeStore()
    lazySetCheckedRange(store, 0, 10, 2)
    lazySetCheckedRange(store, 10, 20, 0)
    lazySetCheckedRange(store, 20, 30, 2)
    lazySetCheckedRange(store, 5, 25, 1)

    expect(lazyGetRangeCount(store)).toBe(3)
    expect(lazyGetCheckedPoint(store, 4)).toBe(2)
    expect(lazyGetCheckedPoint(store, 5)).toBe(1)
    expect(lazyGetCheckedPoint(store, 24)).toBe(1)
    expect(lazyGetCheckedPoint(store, 25)).toBe(2)
  })
})
