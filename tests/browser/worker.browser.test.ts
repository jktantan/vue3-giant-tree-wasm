import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import VueGiantTree from '../../lib/VueGiantTree.vue'
import { SelectType } from '../../build/release'

const nextPaint = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

describe('worker tree mode', () => {
  it('renders the first snapshot from a Worker', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const treeRef = ref<InstanceType<typeof VueGiantTree>>()
    let treeUpdateCount = 0
    const source = ref([
      { id: 'A', name: 'Worker A', parentId: 'root' },
      { id: 'A1', name: 'Worker A1', parentId: 'A' },
      { id: 'B', name: 'Worker B', parentId: 'root' },
    ])
    const app = createApp({
      setup: () => () =>
        h(VueGiantTree, {
          ref: treeRef,
          tree: source.value,
          root: 'root',
          modelValue: [],
          workerMode: true,
          preorderedInput: true,
          height: '300px',
          'onUpdate:tree': (tree: typeof source.value) => {
            treeUpdateCount++
            source.value = tree
          },
        }),
    })
    app.mount(host)

    const deadline = performance.now() + 10_000
    while (performance.now() < deadline && treeRef.value?.getTreeSize() !== 3) {
      await nextPaint()
    }
    await nextTick()
    expect(treeRef.value?.getTreeSize()).toBe(3)
    expect(host.textContent).toContain('Worker A')

    const expandA = host.querySelector(
      '[aria-label="展开 Worker A"]'
    ) as HTMLElement
    expect(expandA).toBeTruthy()
    expandA.click()
    const animationDeadline = performance.now() + 10_000
    while (
      performance.now() < animationDeadline &&
      !host.querySelector('.giant-tree__branch-transition')
    ) {
      await nextPaint()
    }
    expect(host.querySelector('.giant-tree__branch-transition')).toBeTruthy()
    while (
      performance.now() < animationDeadline &&
      host.querySelector('.giant-tree__branch-transition')
    ) {
      await nextPaint()
    }

    // Once the expand transition settles, it intentionally retains the old
    // row plan. A structural worker snapshot must replace that plan, otherwise
    // edits appear but adds/removes are visually stuck until the next scroll.
    expect(
      treeRef.value?.addNode({ id: 'A0', name: 'Worker A0', parentId: 'A' })
    ).toBe(true)
    const settledAddDeadline = performance.now() + 10_000
    while (
      performance.now() < settledAddDeadline &&
      (!source.value.some(node => node.id === 'A0') ||
        !host.textContent?.includes('Worker A0'))
    ) {
      await nextPaint()
    }
    expect(source.value.some(node => node.id === 'A0')).toBe(true)
    expect(host.textContent).toContain('Worker A0')

    expect(treeRef.value?.removeNode('A0')).toBe(true)
    const settledRemoveDeadline = performance.now() + 10_000
    while (
      performance.now() < settledRemoveDeadline &&
      (source.value.some(node => node.id === 'A0') ||
        host.textContent?.includes('Worker A0'))
    ) {
      await nextPaint()
    }
    expect(host.textContent).not.toContain('Worker A0')

    // A leaf that gains a child must receive fresh MPTT boundaries in the
    // Worker snapshot so TreeItem switches from its spacer to an expand arrow.
    expect(
      treeRef.value?.addNode({ id: 'B0', name: 'Worker B0', parentId: 'B' })
    ).toBe(true)
    const leafToBranchDeadline = performance.now() + 10_000
    while (
      performance.now() < leafToBranchDeadline &&
      !host.querySelector('[aria-label="展开 Worker B"]')
    ) {
      await nextPaint()
    }
    expect(host.querySelector('[aria-label="展开 Worker B"]')).toBeTruthy()

    expect(treeRef.value?.removeNode('B0')).toBe(true)
    const branchToLeafDeadline = performance.now() + 10_000
    while (
      performance.now() < branchToLeafDeadline &&
      host.querySelector('[aria-label="展开 Worker B"]')
    ) {
      await nextPaint()
    }
    expect(host.querySelector('[aria-label="展开 Worker B"]')).toBeNull()

    treeRef.value?.expandAll()
    const expandAllDeadline = performance.now() + 10_000
    while (
      performance.now() < expandAllDeadline &&
      host.querySelectorAll('.giant-tree__row').length !== 3
    ) {
      await nextPaint()
    }
    expect(host.querySelectorAll('.giant-tree__row')).toHaveLength(3)
    treeRef.value?.collapseAll()
    const collapseAllDeadline = performance.now() + 10_000
    while (
      performance.now() < collapseAllDeadline &&
      host.querySelectorAll('.giant-tree__row').length !== 2
    ) {
      await nextPaint()
    }
    expect(host.querySelectorAll('.giant-tree__row')).toHaveLength(2)

    // The settled animation plan keeps DOM stable; Worker selection snapshots
    // must still update its checkbox state rather than only the v-model value.
    const checkA = host.querySelector(
      '[aria-label="选择 Worker A"]'
    ) as HTMLElement
    expect(checkA.getAttribute('aria-checked')).toBe('false')
    checkA.click()
    const checkDeadline = performance.now() + 10_000
    while (
      performance.now() < checkDeadline &&
      checkA.getAttribute('aria-checked') !== 'true'
    ) {
      await nextPaint()
    }
    expect(checkA.getAttribute('aria-checked')).toBe('true')

    expect(treeRef.value?.updateNode('A', { name: 'Edited A' })).toBe(true)
    expect(treeRef.value?.updateNode('A', { disabled: true })).toBe(true)
    const disabledDeadline = performance.now() + 10_000
    while (
      performance.now() < disabledDeadline &&
      source.value.find(node => node.id === 'A')?.disabled !== true
    ) {
      await nextPaint()
    }
    expect(source.value.find(node => node.id === 'A')?.disabled).toBe(true)
    expect(
      (
        host.querySelector('[aria-label="选择 Edited A"]') as HTMLElement
      )?.getAttribute('aria-disabled')
    ).toBe('true')
    expect(
      treeRef.value?.addNode({ id: 'A2', name: 'Worker A2', parentId: 'A' })
    ).toBe(true)
    const mutationDeadline = performance.now() + 10_000
    while (performance.now() < mutationDeadline && source.value.length !== 4) {
      await nextPaint()
    }
    expect(source.value.map(node => node.id)).toContain('A2')

    expect(treeRef.value?.removeNode('A')).toBe(true)
    const removeDeadline = performance.now() + 10_000
    while (performance.now() < removeDeadline && source.value.length !== 1) {
      await nextPaint()
    }
    expect(source.value.map(node => node.id)).toEqual(['B'])

    // Two synchronous structural calls share one worker transaction and one
    // controlled-model write, rather than rebuilding the derived tree twice.
    treeUpdateCount = 0
    expect(
      treeRef.value?.addNode({ id: 'C', name: 'Worker C', parentId: 'root' })
    ).toBe(true)
    expect(
      treeRef.value?.addNode({ id: 'D', name: 'Worker D', parentId: 'root' })
    ).toBe(true)
    const batchDeadline = performance.now() + 10_000
    while (performance.now() < batchDeadline && source.value.length !== 3) {
      await nextPaint()
    }
    expect(source.value.map(node => node.id)).toEqual(['B', 'C', 'D'])
    expect(treeUpdateCount).toBe(1)
    const metrics = treeRef.value?.getWorkerMetrics()
    expect(metrics?.enabled).toBe(true)
    expect(metrics?.pendingCommands).toBe(0)
    expect(metrics?.structuralBatches).toBeGreaterThan(0)
    expect(metrics?.structuralOperations).toBeGreaterThanOrEqual(2)
    expect(metrics?.lastRoundTripMs).toBeGreaterThanOrEqual(0)

    app.unmount()
    host.remove()
  })

  it('applies content-only updates without a full stream', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const treeRef = ref<InstanceType<typeof VueGiantTree>>()
    const source = ref([
      { id: 'A', name: 'Content A', parentId: 'root' },
      { id: 'A1', name: 'Content A1', parentId: 'A' },
      { id: 'B', name: 'Content B', parentId: 'root' },
    ])
    const app = createApp({
      setup: () => () =>
        h(VueGiantTree, {
          ref: treeRef,
          tree: source.value,
          root: 'root',
          modelValue: [],
          workerMode: true,
          preorderedInput: true,
          height: '300px',
          'onUpdate:tree': (tree: typeof source.value) => {
            source.value = tree
          },
        }),
    })
    app.mount(host)

    const readyDeadline = performance.now() + 10_000
    while (
      performance.now() < readyDeadline &&
      treeRef.value?.getTreeSize() !== 3
    ) {
      await nextPaint()
    }
    expect(host.textContent).toContain('Content A')
    const hitsBefore = treeRef.value?.getBuildMetrics().contentDiffHits ?? 0

    source.value = source.value.map(node =>
      node.id === 'A'
        ? { ...node, name: 'Content A renamed', disabled: true }
        : node
    )
    await nextTick()

    const updateDeadline = performance.now() + 10_000
    while (
      performance.now() < updateDeadline &&
      (!host.textContent?.includes('Content A renamed') ||
        !host.querySelector('[aria-disabled="true"]'))
    ) {
      await nextPaint()
    }
    expect(host.textContent).toContain('Content A renamed')
    expect(host.querySelector('[aria-disabled="true"]')).toBeTruthy()
    const hitsAfterFirst = treeRef.value?.getBuildMetrics().contentDiffHits ?? 0
    expect(hitsAfterFirst).toBeGreaterThan(hitsBefore)

    // Mutate a row in place and replace the array: the Worker snapshot must
    // still detect the new name instead of trusting the previous object.
    const bNode = source.value.find(node => node.id === 'B')!
    bNode.name = 'Content B in place'
    source.value = [...source.value]
    await nextTick()
    const inPlaceDeadline = performance.now() + 10_000
    while (
      performance.now() < inPlaceDeadline &&
      !host.textContent?.includes('Content B in place')
    ) {
      await nextPaint()
    }
    expect(host.textContent).toContain('Content B in place')
    expect(treeRef.value?.getBuildMetrics().contentDiffHits).toBeGreaterThan(
      hitsAfterFirst
    )

    app.unmount()
    host.remove()
  })

  it('外部替换 tree 不会被未绑定的 update:tree 回声吞掉', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const treeRef = ref<InstanceType<typeof VueGiantTree>>()
    const source = ref([
      { id: 'A', name: 'Echo A', parentId: 'root' },
      { id: 'A1', name: 'Echo A1', parentId: 'A' },
      { id: 'B', name: 'Echo B', parentId: 'root' },
    ])
    const app = createApp({
      setup: () => () =>
        h(VueGiantTree, {
          ref: treeRef,
          tree: source.value,
          root: 'root',
          modelValue: [],
          workerMode: true,
          preorderedInput: true,
          height: '300px',
          // Deliberately no onUpdate:tree listener: the component emits a
          // mutation echo that nobody feeds back.
        }),
    })
    app.mount(host)

    const readyDeadline = performance.now() + 10_000
    while (
      performance.now() < readyDeadline &&
      treeRef.value?.getTreeSize() !== 3
    ) {
      await nextPaint()
    }
    expect(treeRef.value?.getTreeSize()).toBe(3)

    expect(
      treeRef.value?.addNode({ id: 'A0', name: 'Echo A0', parentId: 'A' })
    ).toBe(true)
    const addDeadline = performance.now() + 10_000
    while (
      performance.now() < addDeadline &&
      treeRef.value?.getTreeSize() !== 4
    ) {
      await nextPaint()
    }
    expect(treeRef.value?.getTreeSize()).toBe(4)

    // A later external replacement must still reach the worker even though the
    // previous update:tree echo was never acknowledged by the parent.
    source.value = [
      { id: 'X', name: 'Echo X', parentId: 'root' },
      { id: 'Y', name: 'Echo Y', parentId: 'root' },
    ]
    await nextTick()
    const replaceDeadline = performance.now() + 10_000
    while (
      performance.now() < replaceDeadline &&
      (treeRef.value?.getTreeSize() !== 2 ||
        !host.textContent?.includes('Echo X'))
    ) {
      await nextPaint()
    }
    expect(treeRef.value?.getTreeSize()).toBe(2)
    expect(host.textContent).toContain('Echo X')
    expect(host.textContent).not.toContain('Echo A0')

    app.unmount()
    host.remove()
  })

  it('worker 模式下运行时修改 lineHeight / selectType 会更新几何与控件', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const treeRef = ref<InstanceType<typeof VueGiantTree>>()
    const lineHeight = ref(26)
    const selectType = ref(SelectType.CHECKBOX)
    const source = ref([
      { id: 'A', name: 'Config A', parentId: 'root' },
      { id: 'A1', name: 'Config A1', parentId: 'A' },
      { id: 'B', name: 'Config B', parentId: 'root' },
    ])
    const app = createApp({
      setup: () => () =>
        h(VueGiantTree, {
          ref: treeRef,
          tree: source.value,
          root: 'root',
          modelValue: [],
          workerMode: true,
          preorderedInput: true,
          height: '300px',
          lineHeight: lineHeight.value,
          selectType: selectType.value,
        }),
    })
    app.mount(host)

    const readyDeadline = performance.now() + 10_000
    while (
      performance.now() < readyDeadline &&
      treeRef.value?.getTreeSize() !== 3
    ) {
      await nextPaint()
    }
    treeRef.value?.expandAll()
    const expandDeadline = performance.now() + 10_000
    const phantom = () =>
      host.querySelector<HTMLElement>('.giant-tree__phantom')
    while (
      performance.now() < expandDeadline &&
      phantom()?.style.height !== '78px'
    ) {
      await nextPaint()
    }
    expect(phantom()?.style.height).toBe('78px')

    lineHeight.value = 40
    await nextTick()
    const heightDeadline = performance.now() + 10_000
    while (
      performance.now() < heightDeadline &&
      phantom()?.style.height !== '120px'
    ) {
      await nextPaint()
    }
    expect(phantom()?.style.height).toBe('120px')

    selectType.value = SelectType.RADIO
    await nextTick()
    const radioDeadline = performance.now() + 10_000
    while (
      performance.now() < radioDeadline &&
      !host.querySelector('[role="radio"]')
    ) {
      await nextPaint()
    }
    expect(host.querySelector('[role="radio"]')).toBeTruthy()
    expect(host.querySelector('[role="checkbox"]')).toBeNull()

    app.unmount()
    host.remove()
  })
})
