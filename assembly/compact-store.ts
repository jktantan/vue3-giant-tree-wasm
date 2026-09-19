import { CheckType, MpttTree } from './models'

/**
 * 紧凑数值布局原型：把 MPTT 数值和状态字段放入连续 typed arrays。
 * 当前用于对拍和内存评估，字符串仍由对象模型保留；后续可逐模块替换读取方。
 */
export class CompactNodeStore {
  left: Int32Array = new Int32Array(0)
  right: Int32Array = new Int32Array(0)
  depth: Int32Array = new Int32Array(0)
  checked: Uint8Array = new Uint8Array(0)
  selected: Uint8Array = new Uint8Array(0)
  collapsed: Uint8Array = new Uint8Array(0)
  shown: Uint8Array = new Uint8Array(0)
  disabled: Uint8Array = new Uint8Array(0)
  parent: Int32Array = new Int32Array(0)
  subtreeEnd: Int32Array = new Int32Array(0)
  disabledPrefix: Int32Array = new Int32Array(0)
  childTotal: Int32Array = new Int32Array(0)
  childChecked: Int32Array = new Int32Array(0)
  childHalf: Int32Array = new Int32Array(0)
  shownIndices: Int32Array = new Int32Array(0)
  shownLength: i32 = 0

  load(tree: MpttTree[]): void {
    const size = tree.length
    this.left = new Int32Array(size)
    this.right = new Int32Array(size)
    this.depth = new Int32Array(size)
    this.checked = new Uint8Array(size)
    this.selected = new Uint8Array(size)
    this.collapsed = new Uint8Array(size)
    this.shown = new Uint8Array(size)
    this.disabled = new Uint8Array(size)
    this.parent = new Int32Array(size)
    this.subtreeEnd = new Int32Array(size)
    this.disabledPrefix = new Int32Array(size + 1)
    this.parent.fill(-1)
    this.childTotal = new Int32Array(size)
    this.childChecked = new Int32Array(size)
    this.childHalf = new Int32Array(size)
    const stack: i32[] = []
    this.shownIndices = new Int32Array(0)
    this.shownLength = 0
    for (let i = 0; i < size; i++) {
      const node = tree[i]
      this.left[i] = node.leftNode
      this.right[i] = node.rightNode
      this.depth[i] = node.deep
      this.checked[i] = node.checked
      this.selected[i] = node.selected
      this.collapsed[i] = node.collapsed ? 1 : 0
      this.shown[i] = node.shown ? 1 : 0
      this.disabled[i] = node.disabled ? 1 : 0
      this.disabledPrefix[i + 1] = this.disabledPrefix[i] + this.disabled[i]
      while (
        stack.length > 0 &&
        this.depth[stack[stack.length - 1]] >= this.depth[i]
      )
        stack.pop()
      if (stack.length > 0) {
        this.parent[i] = stack[stack.length - 1]
        if (this.disabled[i] === 0) this.childTotal[this.parent[i]]++
        if (this.checked[i] === 2 && this.disabled[i] === 0)
          this.childChecked[this.parent[i]]++
      }
      stack.push(i)
    }

    // MPTT nodes are preorder-sorted. Each index enters and leaves this stack
    // once, so subtree end positions are built in O(N), not per-node scans.
    const open: i32[] = []
    for (let i: i32 = 0; i < size; i++) {
      while (
        open.length > 0 &&
        this.right[open[open.length - 1]] <= this.left[i]
      ) {
        this.subtreeEnd[open.pop()] = i
      }
      open.push(i)
    }
    while (open.length > 0) this.subtreeEnd[open.pop()] = size
  }

  setShownIndices(indices: i32[]): void {
    if (this.shownIndices.length < indices.length) {
      let capacity =
        this.shownIndices.length > 0 ? this.shownIndices.length : indices.length
      while (capacity < indices.length) capacity *= 2
      this.shownIndices = new Int32Array(capacity)
    }
    this.shownLength = indices.length
    for (let i = 0; i < indices.length; i++) this.shownIndices[i] = indices[i]
  }

  getShownIndices(start: i32, end: i32): i32[] {
    const from =
      start < 0 ? 0 : start >= this.shownLength ? this.shownLength : start
    const to =
      end < from ? from : end > this.shownLength ? this.shownLength : end
    const result: i32[] = []
    for (let i = from; i < to; i++) result.push(this.shownIndices[i])
    return result
  }

  setChecked(index: i32, value: u8): void {
    if (index >= 0 && index < this.checked.length) this.checked[index] = value
  }

  setSelected(index: i32, value: u8): void {
    if (index >= 0 && index < this.selected.length) this.selected[index] = value
  }

  updateChildState(parent: i32, previous: u8, next: u8): void {
    if (parent < 0 || previous === next) return
    if (previous === 2) this.childChecked[parent]--
    else if (previous === 1) this.childHalf[parent]--
    if (next === 2) this.childChecked[parent]++
    else if (next === 1) this.childHalf[parent]++
  }

  getAggregateState(index: i32): u8 {
    if (this.childChecked[index] === this.childTotal[index]) return 2
    return this.childChecked[index] === 0 && this.childHalf[index] === 0 ? 0 : 1
  }

  hasDisabledInSubtree(index: i32): bool {
    if (index < 0 || index >= this.subtreeEnd.length) return true
    return (
      this.disabledPrefix[this.subtreeEnd[index]] !== this.disabledPrefix[index]
    )
  }

  syncSelection(tree: MpttTree[]): void {
    const size =
      tree.length < this.checked.length ? tree.length : this.checked.length
    for (let i: i32 = 0; i < size; i++) {
      this.checked[i] = tree[i].checked
      this.selected[i] = tree[i].selected
      this.childChecked[i] = 0
      this.childHalf[i] = 0
    }
    for (let i: i32 = 0; i < size; i++) {
      const parent = this.parent[i]
      if (parent >= 0 && this.disabled[i] === 0) {
        if (this.checked[i] === 2) this.childChecked[parent]++
        else if (this.checked[i] === 1) this.childHalf[parent]++
      }
    }
  }

  /** Resets CHECKBOX state while preserving disabled-node state and selection. */
  resetCheckboxSelection(tree: MpttTree[]): void {
    const size =
      tree.length < this.checked.length ? tree.length : this.checked.length
    for (let i: i32 = 0; i < size; i++) {
      this.childChecked[i] = 0
      this.childHalf[i] = 0
      if (this.disabled[i] === 0) {
        this.checked[i] = 0
        tree[i].checked = CheckType.UNCHECKED
      }
    }
    for (let i: i32 = 0; i < size; i++) {
      const parent = this.parent[i]
      if (parent >= 0 && this.disabled[i] === 0) {
        if (this.checked[i] === 2) this.childChecked[parent]++
        else if (this.checked[i] === 1) this.childHalf[parent]++
      }
    }
  }

  hasDisabledNodes(): bool {
    return (
      this.disabledPrefix.length > 0 &&
      this.disabledPrefix[this.disabledPrefix.length - 1] !== 0
    )
  }

  checkCheckbox(tree: MpttTree[], targetIndex: i32, value: u8): void {
    if (
      targetIndex < 0 ||
      targetIndex >= this.checked.length ||
      this.disabled[targetIndex] !== 0
    )
      return
    const targetPrevious = this.checked[targetIndex]
    this.updateChildState(this.parent[targetIndex], targetPrevious, value)
    this.checked[targetIndex] = value
    tree[targetIndex].checked = value
    const subtreeEnd = this.subtreeEnd[targetIndex]
    for (let i = targetIndex + 1; i < subtreeEnd; i++) {
      if (this.disabled[i] === 0) {
        const previous = this.checked[i]
        this.updateChildState(this.parent[i], previous, value)
        this.checked[i] = value
        tree[i].checked = value
      }
    }
    let ancestor = this.parent[targetIndex]
    while (ancestor >= 0) {
      const next = this.getAggregateState(ancestor)
      const previous = this.checked[ancestor]
      this.updateChildState(this.parent[ancestor], previous, next)
      this.checked[ancestor] = next
      tree[ancestor].checked = next
      ancestor = this.parent[ancestor]
    }
  }

  memoryBytes(): i32 {
    return (this.left.byteLength +
      this.right.byteLength +
      this.depth.byteLength +
      this.checked.byteLength +
      this.selected.byteLength +
      this.collapsed.byteLength +
      this.shown.byteLength +
      this.shownIndices.byteLength +
      this.disabled.byteLength +
      this.parent.byteLength +
      this.subtreeEnd.byteLength +
      this.disabledPrefix.byteLength +
      this.childTotal.byteLength +
      this.childChecked.byteLength +
      this.childHalf.byteLength) as i32
  }

  // Fields duplicated from the object model; excludes index-only arrays.
  mirrorBytes(): i32 {
    return (this.left.byteLength +
      this.right.byteLength +
      this.depth.byteLength +
      this.checked.byteLength +
      this.selected.byteLength +
      this.collapsed.byteLength +
      this.shown.byteLength +
      this.disabled.byteLength) as i32
  }
}
