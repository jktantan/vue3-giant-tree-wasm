import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import VueGiantTree from '../../lib/VueGiantTree.vue'

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

    const expandA = host.querySelector('[aria-label="展开 Worker A"]') as HTMLElement
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

    treeRef.value?.expandAll()
    const expandAllDeadline = performance.now() + 10_000
    while (performance.now() < expandAllDeadline && host.querySelectorAll('.tree-item').length !== 3) {
      await nextPaint()
    }
    expect(host.querySelectorAll('.tree-item')).toHaveLength(3)
    treeRef.value?.collapseAll()
    const collapseAllDeadline = performance.now() + 10_000
    while (performance.now() < collapseAllDeadline && host.querySelectorAll('.tree-item').length !== 2) {
      await nextPaint()
    }
    expect(host.querySelectorAll('.tree-item')).toHaveLength(2)

    // The settled animation plan keeps DOM stable; Worker selection snapshots
    // must still update its checkbox state rather than only the v-model value.
    const checkA = host.querySelector('[aria-label="选择 Worker A"]') as HTMLElement
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
    expect(treeRef.value?.addNode({ id: 'A2', name: 'Worker A2', parentId: 'A' })).toBe(true)
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
    expect(treeRef.value?.addNode({ id: 'C', name: 'Worker C', parentId: 'root' })).toBe(true)
    expect(treeRef.value?.addNode({ id: 'D', name: 'Worker D', parentId: 'root' })).toBe(true)
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
})
