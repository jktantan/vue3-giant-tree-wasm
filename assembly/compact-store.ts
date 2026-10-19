import { CheckType, MpttTree } from './models'

// Hot loops address the typed arrays through their data pointer once. The
// owning typed-array references stay alive for the whole call, so GC
// ownership is unchanged; only per-element shadow-stack bookkeeping and
// bounds checks are removed. Kept private to this module and inlined.
// @ts-ignore: decorator
@inline
function updateChildStateAt(
  childCheckedBase: usize,
  childHalfBase: usize,
  parent: i32,
  previous: u8,
  next: u8
): void {
  if (parent < 0 || previous === next) return
  const offset = (<usize>parent) << 2
  const checkedPtr = childCheckedBase + offset
  const halfPtr = childHalfBase + offset
  if (previous === 2) store<i32>(checkedPtr, load<i32>(checkedPtr) - 1)
  else if (previous === 1) store<i32>(halfPtr, load<i32>(halfPtr) - 1)
  if (next === 2) store<i32>(checkedPtr, load<i32>(checkedPtr) + 1)
  else if (next === 1) store<i32>(halfPtr, load<i32>(halfPtr) + 1)
}

// @ts-ignore: decorator
@inline
function aggregateStateAt(
  childCheckedBase: usize,
  childTotalBase: usize,
  childHalfBase: usize,
  index: i32
): u8 {
  const offset = (<usize>index) << 2
  const childChecked = load<i32>(childCheckedBase + offset)
  if (childChecked === load<i32>(childTotalBase + offset)) return 2
  return childChecked === 0 && load<i32>(childHalfBase + offset) === 0 ? 0 : 1
}

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

    const leftBase = this.left.dataStart
    const rightBase = this.right.dataStart
    const depthBase = this.depth.dataStart
    const checkedBase = this.checked.dataStart
    const selectedBase = this.selected.dataStart
    const collapsedBase = this.collapsed.dataStart
    const shownBase = this.shown.dataStart
    const disabledBase = this.disabled.dataStart
    const parentBase = this.parent.dataStart
    const subtreeEndBase = this.subtreeEnd.dataStart
    const disabledPrefixBase = this.disabledPrefix.dataStart
    const childTotalBase = this.childTotal.dataStart
    const childCheckedBase = this.childChecked.dataStart
    const childHalfBase = this.childHalf.dataStart
    // Growable stacks are intentionally sized by actual depth/width. Allocating
    // two `size`-length Int32Arrays pushed a 1M-node build from 512MB to the
    // allocator's next arena (1GB), even though wide trees only need a handful
    // of entries here.
    const stack: i32[] = []
    const open: i32[] = []
    for (let i = 0; i < size; i++) {
      const node = tree[i]
      const offset = <usize>i
      store<i32>(leftBase + (offset << 2), node.leftNode)
      store<i32>(rightBase + (offset << 2), node.rightNode)
      store<i32>(depthBase + (offset << 2), node.deep)
      const checked = <u8>node.checked
      store<u8>(checkedBase + offset, checked)
      store<u8>(selectedBase + offset, <u8>node.selected)
      store<u8>(collapsedBase + offset, node.collapsed ? 1 : 0)
      store<u8>(shownBase + offset, node.shown ? 1 : 0)
      const disabled: u8 = node.disabled ? 1 : 0
      store<u8>(disabledBase + offset, disabled)
      store<i32>(
        disabledPrefixBase + ((offset + 1) << 2),
        load<i32>(disabledPrefixBase + (offset << 2)) + disabled
      )

      // Preorder MPTT boundaries let us finalize completed subtrees while
      // loading node fields, avoiding a second full traversal below.
      while (
        open.length > 0 &&
        load<i32>(rightBase + ((<usize>open[open.length - 1]) << 2)) <=
          node.leftNode
      )
        store<i32>(subtreeEndBase + ((<usize>open.pop()) << 2), i)
      while (
        stack.length > 0 &&
        load<i32>(depthBase + ((<usize>stack[stack.length - 1]) << 2)) >=
          node.deep
      )
        stack.pop()
      if (stack.length > 0) {
        const parentIndex = stack[stack.length - 1]
        store<i32>(parentBase + (offset << 2), parentIndex)
        if (disabled === 0) {
          const parentOffset = (<usize>parentIndex) << 2
          store<i32>(
            childTotalBase + parentOffset,
            load<i32>(childTotalBase + parentOffset) + 1
          )
          if (checked === 2)
            store<i32>(
              childCheckedBase + parentOffset,
              load<i32>(childCheckedBase + parentOffset) + 1
            )
          else if (checked === 1)
            store<i32>(
              childHalfBase + parentOffset,
              load<i32>(childHalfBase + parentOffset) + 1
            )
        }
      }
      stack.push(i)
      open.push(i)
    }
    while (open.length > 0)
      store<i32>(subtreeEndBase + ((<usize>open.pop()) << 2), size)
  }

  setChecked(index: i32, value: u8): void {
    if (index >= 0 && index < this.checked.length) this.checked[index] = value
  }

  setSelected(index: i32, value: u8): void {
    if (index >= 0 && index < this.selected.length) this.selected[index] = value
  }

  /**
   * Updates the disabled flag, its prefix sums and the parent's eligible-child
   * count. Returns the parent index so the caller can roll aggregates upward.
   */
  updateDisabled(index: i32, disabled: bool): i32 {
    const value: u8 = disabled ? 1 : 0
    if (this.disabled[index] === value) return this.parent[index]
    this.disabled[index] = value
    const delta: i32 = disabled ? 1 : -1
    const prefixBase = this.disabledPrefix.dataStart
    for (let i: i32 = index + 1; i < this.disabledPrefix.length; i++)
      store<i32>(
        prefixBase + ((<usize>i) << 2),
        load<i32>(prefixBase + ((<usize>i) << 2)) + delta
      )
    const parent = this.parent[index]
    if (parent >= 0) {
      if (disabled) this.childTotal[parent]--
      else this.childTotal[parent]++
    }
    return parent
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
    const checkedBase = this.checked.dataStart
    const selectedBase = this.selected.dataStart
    const disabledBase = this.disabled.dataStart
    const parentBase = this.parent.dataStart
    const childCheckedBase = this.childChecked.dataStart
    const childHalfBase = this.childHalf.dataStart
    for (let i: i32 = 0; i < size; i++) {
      const offset = <usize>i
      store<u8>(checkedBase + offset, <u8>tree[i].checked)
      store<u8>(selectedBase + offset, <u8>tree[i].selected)
      store<i32>(childCheckedBase + (offset << 2), 0)
      store<i32>(childHalfBase + (offset << 2), 0)
    }
    for (let i: i32 = 0; i < size; i++) {
      const offset = <usize>i
      const parent = load<i32>(parentBase + (offset << 2))
      if (parent >= 0 && load<u8>(disabledBase + offset) === 0) {
        const value = load<u8>(checkedBase + offset)
        const checkedPtr = childCheckedBase + ((<usize>parent) << 2)
        const halfPtr = childHalfBase + ((<usize>parent) << 2)
        if (value === 2) store<i32>(checkedPtr, load<i32>(checkedPtr) + 1)
        else if (value === 1) store<i32>(halfPtr, load<i32>(halfPtr) + 1)
      }
    }
  }

  /** Resets CHECKBOX state while preserving disabled-node state and selection. */
  resetCheckboxSelection(tree: MpttTree[]): void {
    const size =
      tree.length < this.checked.length ? tree.length : this.checked.length
    const checkedBase = this.checked.dataStart
    const disabledBase = this.disabled.dataStart
    const parentBase = this.parent.dataStart
    const childCheckedBase = this.childChecked.dataStart
    const childHalfBase = this.childHalf.dataStart
    for (let i: i32 = 0; i < size; i++) {
      const offset = <usize>i
      store<i32>(childCheckedBase + (offset << 2), 0)
      store<i32>(childHalfBase + (offset << 2), 0)
      if (load<u8>(disabledBase + offset) === 0) {
        store<u8>(checkedBase + offset, 0)
        tree[i].checked = CheckType.UNCHECKED
      }
    }
    for (let i: i32 = 0; i < size; i++) {
      const offset = <usize>i
      const parent = load<i32>(parentBase + (offset << 2))
      if (parent >= 0 && load<u8>(disabledBase + offset) === 0) {
        const value = load<u8>(checkedBase + offset)
        const checkedPtr = childCheckedBase + ((<usize>parent) << 2)
        const halfPtr = childHalfBase + ((<usize>parent) << 2)
        if (value === 2) store<i32>(checkedPtr, load<i32>(checkedPtr) + 1)
        else if (value === 1) store<i32>(halfPtr, load<i32>(halfPtr) + 1)
      }
    }
  }

  /**
   * Recomputes branch states after a structural edit. `load()` has already
   * rebuilt the direct-child aggregates, so this only walks leaves upward and
   * rewrites each branch plus its parent's counters.
   */
  recomputeAggregates(tree: MpttTree[]): void {
    const checkedBase = this.checked.dataStart
    const parentBase = this.parent.dataStart
    const childTotalBase = this.childTotal.dataStart
    const childCheckedBase = this.childChecked.dataStart
    const childHalfBase = this.childHalf.dataStart
    for (let i: i32 = this.checked.length - 1; i >= 0; i--) {
      const offset = <usize>i
      if (load<i32>(childTotalBase + (offset << 2)) === 0) continue
      const previous = load<u8>(checkedBase + offset)
      const next = aggregateStateAt(
        childCheckedBase,
        childTotalBase,
        childHalfBase,
        i
      )
      store<u8>(checkedBase + offset, next)
      tree[i].checked = next
      updateChildStateAt(
        childCheckedBase,
        childHalfBase,
        load<i32>(parentBase + (offset << 2)),
        previous,
        next
      )
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
    const checkedBase = this.checked.dataStart
    const disabledBase = this.disabled.dataStart
    const parentBase = this.parent.dataStart
    const childCheckedBase = this.childChecked.dataStart
    const childHalfBase = this.childHalf.dataStart
    const childTotalBase = this.childTotal.dataStart
    const targetOffset = <usize>targetIndex

    const targetPrevious = load<u8>(checkedBase + targetOffset)
    updateChildStateAt(
      childCheckedBase,
      childHalfBase,
      load<i32>(parentBase + (targetOffset << 2)),
      targetPrevious,
      value
    )
    store<u8>(checkedBase + targetOffset, value)
    tree[targetIndex].checked = value
    const subtreeEnd = this.subtreeEnd[targetIndex]
    // Fast path: when this subtree has no disabled descendants there is no
    // need to recheck `disabled[i]` on each iteration. Skipping that branch
    // saves a typed-array load per child on the hot checkbox path.
    if (!this.hasDisabledInSubtree(targetIndex)) {
      for (let i = targetIndex + 1; i < subtreeEnd; i++) {
        const offset = <usize>i
        const previous = load<u8>(checkedBase + offset)
        updateChildStateAt(
          childCheckedBase,
          childHalfBase,
          load<i32>(parentBase + (offset << 2)),
          previous,
          value
        )
        store<u8>(checkedBase + offset, value)
        tree[i].checked = value
      }
    } else {
      for (let i = targetIndex + 1; i < subtreeEnd; i++) {
        const offset = <usize>i
        if (load<u8>(disabledBase + offset) === 0) {
          const previous = load<u8>(checkedBase + offset)
          updateChildStateAt(
            childCheckedBase,
            childHalfBase,
            load<i32>(parentBase + (offset << 2)),
            previous,
            value
          )
          store<u8>(checkedBase + offset, value)
          tree[i].checked = value
        }
      }
    }
    let ancestor = load<i32>(parentBase + (targetOffset << 2))
    while (ancestor >= 0) {
      const ancestorOffset = <usize>ancestor
      const next = aggregateStateAt(
        childCheckedBase,
        childTotalBase,
        childHalfBase,
        ancestor
      )
      const previous = load<u8>(checkedBase + ancestorOffset)
      const ancestorParent = load<i32>(parentBase + (ancestorOffset << 2))
      updateChildStateAt(
        childCheckedBase,
        childHalfBase,
        ancestorParent,
        previous,
        next
      )
      store<u8>(checkedBase + ancestorOffset, next)
      tree[ancestor].checked = next
      ancestor = ancestorParent
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
