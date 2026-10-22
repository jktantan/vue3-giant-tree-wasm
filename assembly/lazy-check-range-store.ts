/** Ordered interval overrides for lazy CHECKBOX subtree state. */
export class LazyCheckRangeStore {
  left: i32[] = []
  right: i32[] = []
  value: u8[] = []

  clear(): void {
    this.left.splice(0)
    this.right.splice(0)
    this.value.splice(0)
  }

  setRange(rangeLeft: i32, rangeRight: i32, rangeValue: u8): void {
    if (rangeRight <= rangeLeft) return
    const nextLeft: i32[] = []
    const nextRight: i32[] = []
    const nextValue: u8[] = []
    let inserted = false
    for (let i: i32 = 0; i < this.left.length; i++) {
      const l = this.left[i]
      const r = this.right[i]
      if (r <= rangeLeft) {
        nextLeft.push(l)
        nextRight.push(r)
        nextValue.push(this.value[i])
      } else if (l >= rangeRight) {
        if (!inserted) {
          nextLeft.push(rangeLeft)
          nextRight.push(rangeRight)
          nextValue.push(rangeValue)
          inserted = true
        }
        nextLeft.push(l)
        nextRight.push(r)
        nextValue.push(this.value[i])
      } else {
        if (l < rangeLeft) {
          nextLeft.push(l)
          nextRight.push(rangeLeft)
          nextValue.push(this.value[i])
        }
        if (!inserted) {
          nextLeft.push(rangeLeft)
          nextRight.push(rangeRight)
          nextValue.push(rangeValue)
          inserted = true
        }
        if (r > rangeRight) {
          nextLeft.push(rangeRight)
          nextRight.push(r)
          nextValue.push(this.value[i])
        }
      }
    }
    if (!inserted) {
      nextLeft.push(rangeLeft)
      nextRight.push(rangeRight)
      nextValue.push(rangeValue)
    }
    this.left = nextLeft
    this.right = nextRight
    this.value = nextValue
    this.mergeAdjacent()
  }

  /** Index of the right-most interval whose left bound is <= `index`. */
  private findInterval(index: i32): i32 {
    let lo: i32 = 0
    let hi: i32 = this.left.length - 1
    let found: i32 = -1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if (this.left[mid] <= index) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return found
  }

  get(indexLeft: i32, indexRight: i32): i32 {
    if (indexRight <= indexLeft) return -1
    const i = this.findInterval(indexLeft)
    if (i >= 0 && indexRight <= this.right[i]) return this.value[i]
    return -1
  }

  getPoint(index: i32): i32 {
    const i = this.findInterval(index)
    return i >= 0 && index < this.right[i] ? this.value[i] : -1
  }

  get size(): i32 {
    return this.left.length
  }

  private mergeAdjacent(): void {
    const length = this.left.length
    if (length < 2) return
    // Compact in place instead of splicing once per merged pair (which made a
    // long range list quadratic on every pointer move).
    let write: i32 = 1
    for (let read: i32 = 1; read < length; read++) {
      if (
        this.right[write - 1] === this.left[read] &&
        this.value[write - 1] === this.value[read]
      ) {
        this.right[write - 1] = this.right[read]
      } else {
        this.left[write] = this.left[read]
        this.right[write] = this.right[read]
        this.value[write] = this.value[read]
        write++
      }
    }
    if (write < length) {
      this.left.splice(write, length - write)
      this.right.splice(write, length - write)
      this.value.splice(write, length - write)
    }
  }
}
