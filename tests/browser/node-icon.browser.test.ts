import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import '../../lib/assets/style/index.scss'
import VueGiantTree from '../../lib/VueGiantTree.vue'

const tree = [
  { id: 'A', name: 'Folder', parentId: 'root' },
  { id: 'A1', name: 'File', parentId: 'A' },
]

/**
 * 节点图标是一个空元素，只有背景图：
 * 如果只给它宽度而没有高度，盒子就是 width x 0，背景图永远画不出来。
 * happy-dom 不做布局，这个回归只能在真实浏览器里量出来。
 */
describe('VueGiantTree: 节点图标尺寸（真实浏览器）', () => {
  it('内置图标拿到与行字号一致的正方形盒子', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () =>
        h(VueGiantTree, {
          modelValue: [],
          tree,
          root: 'root',
          nodeIcon: true,
          width: '300px',
          height: '400px',
          fontSize: '14px',
        }),
    })
    app.mount(host)
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 80))

    const icon = host.querySelector<HTMLElement>('.giant-tree__node-icon')
    expect(icon).not.toBeNull()
    expect(icon?.className).toContain('giant-tree__icon-node-collapsed')

    const rect = icon!.getBoundingClientRect()
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.height).toBeGreaterThan(0)
    expect(rect.height).toBeCloseTo(rect.width, 0)

    app.unmount()
    host.remove()
  })
})
