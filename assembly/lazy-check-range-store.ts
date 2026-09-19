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

  get(indexLeft: i32, indexRight: i32): i32 {
    if (indexRight <= indexLeft) return -1
    for (let i: i32 = 0; i < this.left.length; i++) {
      if (indexLeft < this.left[i]) break
      if (indexLeft >= this.left[i] && indexRight <= this.right[i])
        return this.value[i]
    }
    return -1
  }

  getPoint(index: i32): i32 {
    for (let i: i32 = 0; i < this.left.length; i++) {
      if (index < this.left[i]) break
      if (index < this.right[i]) return this.value[i]
    }
    return -1
  }

  get size(): i32 {
    return this.left.length
  }

  private mergeAdjacent(): void {
    for (let i: i32 = this.left.length - 2; i >= 0; i--) {
      if (
        this.right[i] === this.left[i + 1] &&
        this.value[i] === this.value[i + 1]
      ) {
        this.right[i] = this.right[i + 1]
        this.left.splice(i + 1, 1)
        this.right.splice(i + 1, 1)
        this.value.splice(i + 1, 1)
      }
    }
  }
}
