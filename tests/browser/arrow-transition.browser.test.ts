import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import '../../lib/assets/style/index.scss'
import VueGiantTree from '../../lib/VueGiantTree.vue'

/**
 * 展开/折叠会重建整块视口 DOM，箭头元素是新建的。若新元素一出生就是目标
 * 角度，浏览器只看到最终状态，CSS transition 不会播放 —— 也就是「第一次
 * 展开箭头不动」。happy-dom 不做样式计算，这个断言只能跑在真实浏览器里。
 */
const tree = [
  { id: 'A', name: 'NodeA', parentId: 'root' },
  { id: 'A1', name: 'NodeA1', parentId: 'A' },
  { id: 'B', name: 'NodeB', parentId: 'root' },
]

describe('VueGiantTree: 箭头过渡（真实浏览器）', () => {
  it('首次展开时箭头元素收到 transition 事件', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      setup() {
        const model = ref<string[]>([])
        return () =>
          h(VueGiantTree, {
            modelValue: model.value,
            tree,
            root: 'root',
            width: '300px',
            height: '400px',
          })
      },
    })
    app.mount(host)
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 60))

    const arrow = () =>
      host.querySelector<HTMLElement>('.tree-item .giant-tree__mask-button')
    expect(arrow()?.className).toContain('giant-tree__icon-arrow-right')

    const transitions: string[] = []
    host.addEventListener('transitionrun', event => {
      const target = event.target as HTMLElement
      if (String(target.className).includes('arrow')) {
        transitions.push(target.className)
      }
    })

    host.querySelector<HTMLElement>('.item-icon')?.click()
    await new Promise(resolve => setTimeout(resolve, 300))
    await nextTick()

    expect(arrow()?.className).toContain('giant-tree__icon-arrow-down')
    expect(transitions.length).toBeGreaterThan(0)

    app.unmount()
    host.remove()
  })
})
