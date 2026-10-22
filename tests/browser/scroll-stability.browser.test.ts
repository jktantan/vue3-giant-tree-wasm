import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import '../../lib/assets/style/index.scss'
import VueGiantTree from '../../lib/VueGiantTree.vue'
import type { TreeNodeData } from '../../lib/types'

const ROW_HEIGHT = 26

function nextPaint() {
  return new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )
}

/** A wide flat tree: plenty of rows, no expansion needed. */
function makeFlatTree(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `n-${i}`,
    name: `Node ${i}`,
    parentId: 'root',
  }))
}

async function waitForRows(host: HTMLElement, minimum: number) {
  const deadline = performance.now() + 15_000
  while (performance.now() < deadline) {
    if (host.querySelectorAll('.tree-item').length >= minimum) return
    await nextPaint()
  }
  throw new Error('tree never rendered enough rows')
}

/** Document-space Y of every rendered row, keyed by node name. */
function rowOffsets(host: HTMLElement): Map<string, number> {
  const container = host.querySelector<HTMLElement>('.tree-container')
  if (!container) throw new Error('missing scroll container')
  const containerTop = container.getBoundingClientRect().top
  const offsets = new Map<string, number>()
  for (const row of host.querySelectorAll<HTMLElement>('.tree-item')) {
    const label = row.querySelector('.item-text > span')
    if (!label?.textContent) continue
    offsets.set(
      label.textContent.trim(),
      row.getBoundingClientRect().top - containerTop + container.scrollTop
    )
  }
  return offsets
}

function firstRowName(host: HTMLElement) {
  return host.querySelector('.tree-item .item-text > span')?.textContent ?? ''
}

/**
 * Scroll jitter is a timing problem: a viewport is requested from one scroll
 * position and materialised one Worker round trip later. If the rendered block
 * were positioned from the *newest* scroll position instead of from the rows it
 * actually holds, every late snapshot would push the whole block down and snap
 * it back — which is what a fling on a slow device looks like.
 *
 * These tests pin the invariant that makes that impossible: a row that stays in
 * the list keeps its document position, however late the snapshot is.
 */
describe('scroll stability', () => {
  it('keeps rendered rows in place when a viewport snapshot arrives late', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const NativeWorker = window.Worker
    // Delay the worker's viewport replies well past a frame.
    class LateWorker extends NativeWorker {
      set onmessage(handler: ((event: MessageEvent) => void) | null) {
        super.onmessage = handler
          ? (event: MessageEvent) => {
              if ((event.data as { type?: string })?.type === 'snapshot')
                setTimeout(() => handler(event), 150)
              else handler(event)
            }
          : null
      }
      get onmessage() {
        return super.onmessage
      }
    }
    window.Worker = LateWorker as unknown as typeof Worker

    const treeRef = ref<InstanceType<typeof VueGiantTree>>()
    const app = createApp({
      render: () =>
        h(VueGiantTree, {
          ref: treeRef,
          modelValue: [],
          tree: makeFlatTree(400),
          root: 'root',
          workerMode: true,
          lineHeight: ROW_HEIGHT,
          height: '400px',
          'onUpdate:modelValue': () => undefined,
        }),
    })
    app.mount(host)

    try {
      await waitForRows(host, 10)
      await nextPaint()
      const container = host.querySelector<HTMLElement>('.tree-container')!

      // Move far enough that the window must advance by several rows, while
      // still leaving plenty of overlap with the rows already on screen.
      const before = rowOffsets(host)
      const beforeFirst = firstRowName(host)
      container.scrollTop = 10 * ROW_HEIGHT
      container.dispatchEvent(new Event('scroll', { bubbles: true }))
      // Two frames: the request went out, the reply is still in flight.
      await nextPaint()

      // The late reply is what makes this test meaningful: the window is still
      // the old one, yet nothing may have moved.
      expect(firstRowName(host)).toBe(beforeFirst)
      for (const [name, offset] of rowOffsets(host)) {
        const previous = before.get(name)
        if (previous === undefined) continue
        expect(Math.abs(offset - previous)).toBeLessThan(1)
      }

      // Once the reply lands the window catches up — and the rows that were
      // already rendered are still exactly where they were.
      const deadline = performance.now() + 5_000
      while (
        performance.now() < deadline &&
        firstRowName(host) === beforeFirst
      ) {
        await nextPaint()
      }
      expect(firstRowName(host)).not.toBe(beforeFirst)
      await nextTick()
      for (const [name, offset] of rowOffsets(host)) {
        const previous = before.get(name)
        if (previous === undefined) continue
        expect(Math.abs(offset - previous)).toBeLessThan(1)
      }
      expect(treeRef.value?.getTreeSize()).toBe(400)
    } finally {
      app.unmount()
      host.remove()
      window.Worker = NativeWorker
    }
  })

  it('only renders the rows that scrolled in', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    // The host slot is the most expensive part of a row, so counting its calls
    // is a direct measure of how many rows were re-rendered.
    let slotCalls = 0
    const treeRef = ref<InstanceType<typeof VueGiantTree>>()
    const app = createApp({
      render: () =>
        h(
          VueGiantTree,
          {
            ref: treeRef,
            modelValue: [],
            tree: makeFlatTree(400),
            root: 'root',
            workerMode: true,
            lineHeight: ROW_HEIGHT,
            height: '400px',
            'onUpdate:modelValue': () => undefined,
          },
          {
            node: ({ node }: { node: TreeNodeData }) => {
              slotCalls++
              return h('span', `${node.name} · slot`)
            },
          }
        ),
    })
    app.mount(host)

    try {
      await waitForRows(host, 10)
      // Start deep enough that the overscan padding is already exhausted and a
      // single row of scrolling really does advance the window.
      const container = host.querySelector<HTMLElement>('.tree-container')!
      container.scrollTop = 20 * ROW_HEIGHT
      container.dispatchEvent(new Event('scroll', { bubbles: true }))
      await nextPaint()
      await nextPaint()
      await nextPaint()

      const firstBefore = firstRowName(host)
      const baseline = slotCalls
      expect(baseline).toBeGreaterThan(10)

      // One row of scrolling enters exactly one row below and drops one above.
      container.scrollTop = 21 * ROW_HEIGHT
      container.dispatchEvent(new Event('scroll', { bubbles: true }))
      await nextPaint()
      await nextPaint()
      await nextPaint()

      const rerendered = slotCalls - baseline
      expect(rerendered).toBeGreaterThan(0)
      expect(rerendered).toBeLessThanOrEqual(4)
      expect(firstRowName(host)).not.toBe(firstBefore)
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
