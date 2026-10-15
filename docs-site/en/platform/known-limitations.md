# Known limitations

The repository reviews `assembly/` and `lib/` and records findings by priority in
[`docs/diagnostics.md`](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/diagnostics.md).
This page is a summary of that report: **6 fixed, 4 kept**.

The other pages describe how to use the component; this one describes what is
**known to misbehave or known to be inelegant**.

## Fixed (6)

| # | Priority | Problem | How it was handled |
| --- | --- | --- | --- |
| 1 | 🔴 | `appendChild` shifted every node by ±2 when appending at the top level, colliding with the new node's position | `needsShift` flag, skips an O(N) rewrite |
| 2 | 🔴 | `checkNodeInTree` might misuse `break` while walking ancestors | Kept the loop (`break` breaks outer-ancestor aggregation) and documented it |
| 3 | 🟠 | `checkCheckbox` re-read `disabled` on every round | Fast path reusing `hasDisabledInSubtree` |
| 4 | 🟠 | `_syncAfterStructureMutation` scanned the whole tree for RADIO / SELECT | `_locateCheckedIndex` and friends, O(N) → O(checkedCount) |
| 5 | 🟠 | `refreshAllNodesCache` could produce `extendData: undefined` | Fallback plus a console warning to locate the inconsistency |
| 6 | 🟡 | `skipValue` failed silently at the depth limit | `_skipValueOverflowed` flag; `parseOneObject` discards the half-written object |

## Kept (4)

| # | Priority | Problem | Why it can wait |
| --- | --- | --- | --- |
| 7 | 🟡 | `updateChildState` readability | Not a runtime bug; needs a naming cleanup |
| 8 | 🟡 | `getParentNodeCheckType` does not skip disabled children | Only used on the legacy path |
| 9 | 🟡 | `TreeItem.vue`'s `guideCells` calls `Array.from` frequently | Performance-sensitive but not blocking |
| 10 | 🟡 | `tree.worker.ts`'s `flushStructure` throttling rebound | Behaviour is correct; an optimisation |

## Related documents

- [Diagnostics report (repository)](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/diagnostics.md)
- [Performance refactor plan](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-refactor-plan.md)
- [Performance gate archive](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md)

## When something looks wrong

If actual behaviour differs from what the other pages describe, trust the **code** and the
**diagnostics report**, and please open an
[issue](https://github.com/jktantan/vue3-giant-tree-wasm/issues).
