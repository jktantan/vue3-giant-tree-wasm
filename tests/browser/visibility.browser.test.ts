import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createApp, h, nextTick, ref } from 'vue'
import VueGiantTree from '../../lib/VueGiantTree.vue'

const runHundredThousandWorkload = import.meta.env.MODE === 'browser-100k'
const runBuildProfile = import.meta.env.MODE === 'browser-build-profile'

function makeWorkloadTree(groups = 220, children = 20) {
  const tree = []
  for (let group = 0; group < groups; group++) {
    const parentId = `parent-${group}`
    tree.push({ id: parentId, name: `Parent ${group}`, parentId: 'root' })
    for (let child = 0; child < children; child++) {
      tree.push({
        id: `${parentId}-child-${child}`,
        name: `Child ${group}-${child}`,
        parentId,
      })
    }
  }
  return tree
}

function makeHundredThousandWorkloadTree() {
  return makeWorkloadTree(100, 999)
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]
}

function nextPaint() {
  return new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )
}

async function waitForTreeSize(
  treeRef: {
    value?: {
      getTreeSize: () => number
      getBuildReady: () => boolean
      getBuildMetrics: () => Record<string, number>
    }
  },
  expectedSize: number,
  timeoutMs = 90_000
) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (
      treeRef.value?.getTreeSize() === expectedSize &&
      treeRef.value.getBuildReady()
    )
      return
    await nextPaint()
  }
  throw new Error(
    `tree did not finish building ${expectedSize} nodes; actual=${treeRef.value?.getTreeSize() ?? 'missing'} ready=${treeRef.value?.getBuildReady() ?? 'missing'} metrics=${JSON.stringify(treeRef.value?.getBuildMetrics?.() ?? {})}`
  )
}

type LayoutShiftEntry = PerformanceEntry & {
  value: number
  hadRecentInput: boolean
  sources?: Array<{ node?: Node | null }>
}

function describeShiftSource(node: Node | null | undefined) {
  if (!(node instanceof Element)) return 'unknown'
  const className = typeof node.className === 'string' ? node.className : ''
  return [
    node.tagName.toLowerCase(),
    node.id && `#${node.id}`,
    className && `.${className.split(/\s+/).filter(Boolean).join('.')}`,
  ]
    .filter(Boolean)
    .join('')
}

async function measure(rounds: number, action: () => Promise<void>) {
  const actionSamples: number[] = []
  const renderSamples: number[] = []
  const totalSamples: number[] = []
  for (let round = 0; round < rounds; round++) {
    const start = performance.now()
    await action()
    const actionEnd = performance.now()
    await nextPaint()
    const end = performance.now()
    actionSamples.push(actionEnd - start)
    renderSamples.push(end - actionEnd)
    totalSamples.push(end - start)
  }
  return {
    samples: totalSamples.length,
    p50Ms: percentile(totalSamples, 0.5),
    p95Ms: percentile(totalSamples, 0.95),
    actionP50Ms: percentile(actionSamples, 0.5),
    actionP95Ms: percentile(actionSamples, 0.95),
    renderP50Ms: percentile(renderSamples, 0.5),
    renderP95Ms: percentile(renderSamples, 0.95),
  }
}

describe('browser performance harness', () => {
  it('exposes browser timing APIs', () => {
    expect(typeof performance.now).toBe('function')
    expect(typeof requestAnimationFrame).toBe('function')
  })

  it.runIf(!runHundredThousandWorkload)(
    'measures repeatable scroll, collapse, checkbox, and search workloads',
    async () => {
      const host = document.createElement('div')
      document.body.append(host)
      const treeRef = ref<{ fuzzySearchRaw: (keyword: string) => void }>()
      const app = createApp({
        render: () =>
          h(VueGiantTree, {
            ref: treeRef,
            modelValue: [],
            tree: makeWorkloadTree(),
            root: 'root',
            height: '520px',
            'onUpdate:modelValue': () => undefined,
          }),
      })
      app.mount(host)
      await nextTick()

      const list = host.querySelector('.infinite-list')
      const scrollContainer = host.querySelector<HTMLElement>('.tree-container')
      const phantom = host.querySelector<HTMLElement>('.infinite-list-phantom')
      expect(list).not.toBeNull()
      expect(scrollContainer).not.toBeNull()
      expect(phantom).not.toBeNull()
      if (!scrollContainer || !phantom)
        throw new Error('tree workload did not mount')
      const rowHeight = 26
      const branchHeight = 21 * rowHeight
      for (let branch = 9; branch >= 0; branch--) {
        scrollContainer.scrollTop = branch * branchHeight
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))
        await nextPaint()
        await nextTick()
        const parent = [
          ...host.querySelectorAll<HTMLElement>('.tree-item'),
        ].find(item => item.textContent?.includes(`Parent ${branch}`))
        const expander = parent?.querySelector<HTMLElement>(
          '.giant-tree__icon-arrow-right'
        )
        expect(parent).toBeDefined()
        expect(expander).not.toBeNull()
        expander?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await nextTick()
      }
      expect(Number.parseFloat(phantom.style.height)).toBeGreaterThan(5_000)
      const shifts: Array<{
        value: number
        hadRecentInput: boolean
        sources: string[]
      }> = []
      let observer: PerformanceObserver | null = null
      let scrollDown = true
      const scrollMetrics = await measure(10, async () => {
        expect(
          scrollContainer.scrollHeight - scrollContainer.clientHeight
        ).toBeGreaterThan(5_000)
        scrollContainer.scrollTop = scrollDown
          ? scrollContainer.scrollHeight - scrollContainer.clientHeight
          : 0
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))
        scrollDown = !scrollDown
        await nextTick()
      })

      // Vitest's embedded browser iframe cannot drive this nested container with
      // wheel/keyboard input. Do not include scripted scroll in interaction CLS.
      if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
        observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries() as LayoutShiftEntry[]) {
            shifts.push({
              value: entry.value,
              hadRecentInput: entry.hadRecentInput,
              sources: (entry.sources ?? []).map(source =>
                describeShiftSource(source.node)
              ),
            })
          }
        })
        observer.observe({ type: 'layout-shift' })
      }

      const collapseMetrics = await measure(10, async () => {
        scrollContainer.scrollTop = 0
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))
        await nextPaint()
        const expander = host.querySelector<HTMLElement>(
          '.giant-tree__icon-arrow-right, .giant-tree__icon-arrow-down'
        )
        expect(expander).not.toBeNull()
        if (expander) await userEvent.click(expander, { force: true })
        await nextTick()
      })

      let checkboxRound = 0
      const checkboxMetrics = await measure(10, async () => {
        const checkboxes = host.querySelectorAll<HTMLElement>(
          '.giant-tree__icon-check-unchecked, .giant-tree__icon-check-checked'
        )
        const checkbox = checkboxes[checkboxRound++ % 2 === 0 ? 0 : 3]
        expect(checkbox).toBeDefined()
        if (checkbox) await userEvent.click(checkbox, { force: true })
        await nextTick()
      })

      const searchTerms = [
        'Parent 1',
        'Parent',
        'Child 1-1',
        'missing-search-term',
        '',
      ]
      let searchRound = 0
      const searchMetrics = await measure(10, async () => {
        treeRef.value?.fuzzySearchRaw(
          searchTerms[searchRound++ % searchTerms.length]
        )
        await nextTick()
      })

      observer?.disconnect()
      const unexpectedShifts = shifts.filter(shift => !shift.hadRecentInput)
      const cls = unexpectedShifts.reduce((sum, shift) => sum + shift.value, 0)
      const report = {
        scrollMetrics,
        collapseMetrics,
        checkboxMetrics,
        searchMetrics,
        cls,
        clsScope: 'collapse-and-checkbox-interactions',
        layoutShiftCount: shifts.length,
        unexpectedLayoutShiftCount: unexpectedShifts.length,
        layoutShiftSources: [
          ...new Set(unexpectedShifts.flatMap(shift => shift.sources)),
        ],
      }
      console.info('browser-workload', JSON.stringify(report))

      for (const metrics of [
        scrollMetrics,
        collapseMetrics,
        checkboxMetrics,
        searchMetrics,
      ]) {
        expect(metrics.samples).toBe(10)
        expect(Number.isFinite(metrics.p50Ms)).toBe(true)
        expect(Number.isFinite(metrics.p95Ms)).toBe(true)
      }
      expect(Number.isFinite(cls)).toBe(true)
      expect(host.querySelectorAll('.tree-item').length).toBeGreaterThan(0)
      app.unmount()
      host.remove()
    }
  )

  it.runIf(runHundredThousandWorkload)(
    'keeps a 100k-node multi-branch virtual-scroll workload interactive',
    async () => {
      const host = document.createElement('div')
      document.body.append(host)
      const mountedAt = performance.now()
      const treeRef = ref<{
        getTreeSize: () => number
        getBuildReady: () => boolean
      }>()
      const app = createApp({
        render: () =>
          h(VueGiantTree, {
            ref: treeRef,
            modelValue: [],
            tree: makeHundredThousandWorkloadTree(),
            root: 'root',
            height: '520px',
            chunkedBuild: true,
            buildBatchSize: 2_000,
            'onUpdate:modelValue': () => undefined,
          }),
      })
      app.mount(host)
      await nextTick()
      await waitForTreeSize(treeRef, 100_000)
      await nextPaint()

      const scrollContainer = host.querySelector<HTMLElement>('.tree-container')
      const phantom = host.querySelector<HTMLElement>('.infinite-list-phantom')
      expect(scrollContainer).not.toBeNull()
      expect(phantom).not.toBeNull()
      if (!scrollContainer || !phantom)
        throw new Error('100k tree workload did not mount')

      const rowHeight = 26
      const branchHeight = 1_000 * rowHeight
      for (let branch = 9; branch >= 0; branch--) {
        scrollContainer.scrollTop = branch * branchHeight
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))
        await nextPaint()
        await nextTick()
        const parent = [
          ...host.querySelectorAll<HTMLElement>('.tree-item'),
        ].find(item => item.textContent?.includes(`Parent ${branch}`))
        const expander = parent?.querySelector<HTMLElement>(
          '.giant-tree__icon-arrow-right'
        )
        expect(expander).not.toBeNull()
        expander?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await nextPaint()
      }
      expect(Number.parseFloat(phantom.style.height)).toBeGreaterThan(250_000)

      let scrollDown = true
      const scrollMetrics = await measure(10, async () => {
        scrollContainer.scrollTop = scrollDown
          ? scrollContainer.scrollHeight - scrollContainer.clientHeight
          : 0
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))
        scrollDown = !scrollDown
        await nextTick()
      })

      let checkboxMetrics = await measure(10, async () => {
        scrollContainer.scrollTop = 0
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))
        await nextPaint()
        const checkbox = host.querySelector<HTMLElement>(
          '[role="checkbox"]:not([aria-disabled="true"])'
        )
        expect(checkbox).not.toBeNull()
        if (checkbox) await userEvent.click(checkbox, { force: true })
        await nextTick()
      })

      const report = {
        nodes: 100_000,
        mountToFirstPaintMs: performance.now() - mountedAt,
        expandedBranchPhantomHeight: Number.parseFloat(phantom.style.height),
        scrollMetrics,
        checkboxMetrics,
      }
      console.info('browser-workload-100k', JSON.stringify(report))

      for (const metrics of [scrollMetrics, checkboxMetrics]) {
        expect(metrics.samples).toBe(10)
        expect(Number.isFinite(metrics.p50Ms)).toBe(true)
        expect(Number.isFinite(metrics.p95Ms)).toBe(true)
      }
      expect(Number.isFinite(report.mountToFirstPaintMs)).toBe(true)
      expect(host.querySelectorAll('.tree-item').length).toBeGreaterThan(0)
      app.unmount()
      host.remove()
    },
    60_000
  )

  it.runIf(runBuildProfile)(
    'profiles chunked input and cache construction without full-node JSON',
    async () => {
      const host = document.createElement('div')
      document.body.append(host)
      const treeRef = ref<{
        getTreeSize: () => number
        getBuildReady: () => boolean
        getBuildMetrics: () => Record<string, number>
      }>()
      const app = createApp({
        render: () =>
          h(VueGiantTree, {
            ref: treeRef,
            modelValue: [],
            tree: makeWorkloadTree(50, 20),
            root: 'root',
            height: '520px',
            chunkedBuild: true,
            buildBatchSize: 2_000,
            'onUpdate:modelValue': () => undefined,
          }),
      })
      app.mount(host)
      await nextTick()
      await waitForTreeSize(treeRef, 1_050, runBuildProfile ? 5_000 : 90_000)
      const metrics = treeRef.value?.getBuildMetrics()
      console.info('browser-build-profile', JSON.stringify(metrics))
      expect(metrics).toBeDefined()
      for (const value of Object.values(metrics ?? {})) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
      }
      app.unmount()
      host.remove()
    }
  )
})
