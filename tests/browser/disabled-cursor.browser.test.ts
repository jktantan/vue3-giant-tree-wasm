import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import '../../lib/assets/style/index.scss'
import VueGiantTree from '../../lib/VueGiantTree.vue'
import { SelectType } from '../../build/release'

/**
 * 禁用行里的复选框/单选框图标是 `.giant-tree__mask-button`，它自带
 * `cursor: pointer`。这个规则特异性高于行上的 `.giant-tree__row--disabled`
 * （子元素自身声明的光标也不会被继承覆盖），所以必须在禁用行里显式
 * 覆盖回 `not-allowed`。happy-dom 不算样式，只能在真实浏览器里验证。
 *
 * The checkbox/radio icon is a `.giant-tree__mask-button` with its own
 * `cursor: pointer`; that declaration beats the row's inherited disabled
 * cursor, so disabled rows must override it explicitly. Only a real browser
 * resolves the cascade here.
 */
const tree = [
  { id: 'A', name: 'Enabled node', parentId: 'root' },
  { id: 'B', name: 'Disabled node', parentId: 'root', disabled: true },
]

async function mountTree(selectType: SelectType) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () =>
      h(VueGiantTree, {
        modelValue: [],
        tree,
        root: 'root',
        width: '300px',
        height: '300px',
        selectType,
      }),
  })
  app.mount(host)

  const deadline = performance.now() + 10_000
  while (
    performance.now() < deadline &&
    host.querySelectorAll('.giant-tree__row').length < tree.length
  ) {
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
  }
  const rows = [...host.querySelectorAll<HTMLElement>('.giant-tree__row')]
  expect(rows).toHaveLength(tree.length)

  return {
    host,
    rows,
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

describe('VueGiantTree: 禁用行的选择控件光标（真实浏览器）', () => {
  it('CHECKBOX：禁用节点的复选框显示禁用光标，未禁用节点仍是 pointer', async () => {
    const { rows, unmount } = await mountTree(SelectType.CHECKBOX)
    const enabledRow = rows.find(row => row.textContent?.includes('Enabled'))
    const disabledRow = rows.find(row => row.textContent?.includes('Disabled'))

    expect(enabledRow?.classList.contains('disabled')).toBe(false)
    expect(disabledRow?.classList.contains('disabled')).toBe(true)

    // 复选框容器与图标（cursor: pointer 的实际载体）都必须是禁用光标。
    expect(
      getComputedStyle(
        disabledRow!.querySelector<HTMLElement>('[role="checkbox"]')!
      ).cursor
    ).toBe('not-allowed')
    expect(
      getComputedStyle(
        disabledRow!.querySelector<HTMLElement>('.giant-tree__mask-button')!
      ).cursor
    ).toBe('not-allowed')

    // 未禁用行不受影响。
    expect(
      getComputedStyle(
        enabledRow!.querySelector<HTMLElement>('.giant-tree__mask-button')!
      ).cursor
    ).toBe('pointer')

    unmount()
  })

  it('RADIO：禁用节点的单选框显示禁用光标，未禁用节点仍是 pointer', async () => {
    const { rows, unmount } = await mountTree(SelectType.RADIO)
    const enabledRow = rows.find(row => row.textContent?.includes('Enabled'))
    const disabledRow = rows.find(row => row.textContent?.includes('Disabled'))

    expect(disabledRow?.classList.contains('disabled')).toBe(true)
    expect(
      getComputedStyle(
        disabledRow!.querySelector<HTMLElement>('[role="radio"]')!
      ).cursor
    ).toBe('not-allowed')
    expect(
      getComputedStyle(
        disabledRow!.querySelector<HTMLElement>('.giant-tree__mask-button')!
      ).cursor
    ).toBe('not-allowed')
    expect(
      getComputedStyle(
        enabledRow!.querySelector<HTMLElement>('.giant-tree__mask-button')!
      ).cursor
    ).toBe('pointer')

    unmount()
  })
})
