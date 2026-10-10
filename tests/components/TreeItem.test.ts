import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TreeItem from '../../lib/TreeItem.vue'
import type { TreeNodeData } from '../../lib/types'
import { SelectType, CheckType } from '../wasm-bridge'

function makeItem(overrides: Partial<TreeNodeData> = {}): TreeNodeData {
  return {
    id: 'test-1',
    name: 'Test Node',
    parentId: '',
    leftNode: 0,
    rightNode: 1,
    deep: 0,
    checked: CheckType.UNCHECKED,
    selected: CheckType.UNCHECKED,
    collapsed: true,
    disabled: false,
    ...overrides,
  }
}

describe('TreeItem: 节点组件', () => {
  it('渲染节点名称', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ name: 'Hello World' }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    expect(wrapper.text()).toContain('Hello World')
  })

  it('叶子节点不显示展开箭头', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ leftNode: 0, rightNode: 1 }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    expect(wrapper.find('.giant-tree__icon-arrow-right').exists()).toBe(false)
    expect(wrapper.find('.giant-tree__icon-arrow-down').exists()).toBe(false)
  })

  it('父节点折叠状态显示右箭头', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ leftNode: 0, rightNode: 5, collapsed: true }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    expect(wrapper.find('.giant-tree__icon-arrow-right').exists()).toBe(true)
  })

  it('父节点展开状态显示下箭头', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ leftNode: 0, rightNode: 5, collapsed: false }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    expect(wrapper.find('.giant-tree__icon-arrow-down').exists()).toBe(true)
  })

  it('默认不显示节点图标', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ leftNode: 0, rightNode: 5 }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    expect(wrapper.find('.giant-tree__node-icon').exists()).toBe(false)
  })

  it('启用默认节点图标时按收起状态切换文件夹图标', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ leftNode: 0, rightNode: 5, collapsed: true }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
        nodeIcon: true,
      },
    })
    expect(wrapper.find('.giant-tree__icon-node-collapsed').exists()).toBe(true)

    await wrapper.setProps({
      item: makeItem({ leftNode: 0, rightNode: 5, collapsed: false }),
    })
    expect(wrapper.find('.giant-tree__icon-node-expanded').exists()).toBe(true)
  })

  it('节点图标回调支持隐藏、共用和状态图标', () => {
    const resolver = (node: ReturnType<typeof makeItem>) => {
      if (node.id === 'hidden') return false
      if (node.id === 'file') return 'app-icon-file'
      return { collapsed: 'app-icon-folder', expanded: 'app-icon-folder-open' }
    }
    const baseProps = {
      fontSize: '14px',
      selectType: SelectType.CHECKBOX,
      nodeIcon: resolver,
    }

    expect(
      mount(TreeItem, {
        props: { ...baseProps, item: makeItem({ id: 'hidden' }) },
      })
        .find('.giant-tree__node-icon')
        .exists()
    ).toBe(false)
    expect(
      mount(TreeItem, {
        props: { ...baseProps, item: makeItem({ id: 'file' }) },
      })
        .find('.app-icon-file')
        .exists()
    ).toBe(true)
    expect(
      mount(TreeItem, {
        props: {
          ...baseProps,
          item: makeItem({ leftNode: 0, rightNode: 5, collapsed: false }),
        },
      })
        .find('.app-icon-folder-open')
        .exists()
    ).toBe(true)
  })

  it('点击箭头触发 collapse-click 事件', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({
          id: 'node-x',
          leftNode: 0,
          rightNode: 5,
          collapsed: true,
        }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    await wrapper.find('.giant-tree__icon-arrow-right').trigger('click')
    const emitted = wrapper.emitted('collapse-click')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(['node-x', false])
  })

  it('展开按钮提供名称并支持键盘触发', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ leftNode: 0, rightNode: 5, collapsed: true }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    const expander = wrapper.find('[role="button"]')
    expect(expander.attributes('aria-label')).toBe('展开 Test Node')
    await expander.trigger('keydown.enter')
    expect(wrapper.emitted('collapse-click')).toHaveLength(1)
  })

  it('CHECKBOX 模式显示复选框图标', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ checked: CheckType.UNCHECKED }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    expect(wrapper.find('.giant-tree__icon-check-unchecked').exists()).toBe(
      true
    )
  })

  it('点击复选框从 UNCHECKED 切换到 CHECKED', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ id: 'chk-1', checked: CheckType.UNCHECKED }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    await wrapper.find('.giant-tree__icon-check-unchecked').trigger('click')
    const emitted = wrapper.emitted('check-click')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(['chk-1', CheckType.CHECKED])
  })

  it('复选框提供状态并支持键盘触发', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ checked: CheckType.HALF_CHECKED }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    const checkbox = wrapper.find('[role="checkbox"]')
    expect(checkbox.attributes('aria-checked')).toBe('mixed')
    await checkbox.trigger('keydown.space')
    expect(wrapper.emitted('check-click')).toEqual([
      ['test-1', CheckType.CHECKED],
    ])
  })

  it('CHECKED 状态再点击变为 UNCHECKED', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ id: 'chk-2', checked: CheckType.CHECKED }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    await wrapper.find('.giant-tree__icon-check-checked').trigger('click')
    const emitted = wrapper.emitted('check-click')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(['chk-2', CheckType.UNCHECKED])
  })

  it('RADIO 模式显示单选按钮图标', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ checked: CheckType.UNCHECKED }),
        fontSize: '14px',
        selectType: SelectType.RADIO,
      },
    })
    expect(wrapper.find('.giant-tree__icon-radio-unchecked').exists()).toBe(
      true
    )
  })

  it('点击文本触发 item-click 事件', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ id: 'click-me' }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    await wrapper.find('.item-text').trigger('click')
    const emitted = wrapper.emitted('item-click')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(['click-me'])
  })

  it('操作插槽接收节点且点击不会触发行点击', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ id: 'action-node' }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
      slots: {
        actions: '<button class="edit-action">编辑</button>',
      },
    })

    expect(wrapper.find('.item-actions').text()).toBe('编辑')
    await wrapper.find('.edit-action').trigger('click')
    expect(wrapper.emitted('item-click')).toBeFalsy()
  })

  it('右键触发 item-contextmenu 并携带节点与原生事件', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ id: 'ctx-node' }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    await wrapper.find('.tree-item').trigger('contextmenu')
    const emitted = wrapper.emitted('item-contextmenu')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({ id: 'ctx-node' })
    expect(emitted![0][1]).toBeInstanceOf(MouseEvent)
  })

  it('右键不会误触行点击', async () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ id: 'ctx-only' }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    await wrapper.find('.tree-item').trigger('contextmenu')
    expect(wrapper.emitted('item-click')).toBeFalsy()
  })
})

describe('TreeItem: 连接线模式 (showLine)', () => {
  it('默认不渲染连接线格子', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ deep: 3 }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
      },
    })
    expect(wrapper.findAll('.item-guide-cell')).toHaveLength(0)
    expect(wrapper.findAll('.giant-tree__guide')).toHaveLength(0)
  })

  it('showLine 时按 deep 渲染缩进格；叶子行的 ├/└ 折线画在标记列', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({
          deep: 2,
          isLastChild: false,
          guideMask: 0b11,
          markerLine: 'lower',
        }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
        showLine: true,
      },
    })
    const cells = wrapper.findAll('.item-guide-cell')
    expect(cells).toHaveLength(2)
    // 缩进格只画竖向贯穿竖线，不含横向折线。
    expect(cells[0].find('.giant-tree__guide').classes()).toContain(
      'giant-tree__guide--v-full'
    )
    expect(cells[0].find('.giant-tree__guide').classes()).not.toContain(
      'giant-tree__guide--h'
    )
    // 叶子：折线在标记列（.item-icon）里，而不是缩进格。
    const marker = wrapper.find('.item-icon .giant-tree__guide')
    expect(marker.exists()).toBe(true)
    expect(marker.classes()).toContain('giant-tree__guide--h')
    expect(marker.classes()).toContain('giant-tree__guide--m-lower')
  })

  it('叶子标记列竖线段：首子 lower、中间 full、末子 upper', () => {
    const make = (markerLine: 'lower' | 'full' | 'upper') =>
      mount(TreeItem, {
        props: {
          item: makeItem({
            deep: 1,
            isLastChild: markerLine === 'upper',
            guideMask: 0b1,
            markerLine,
          }),
          fontSize: '14px',
          selectType: SelectType.CHECKBOX,
          showLine: true,
        },
      })
    expect(
      make('lower').find('.item-icon .giant-tree__guide').classes()
    ).toContain('giant-tree__guide--m-lower')
    expect(
      make('full').find('.item-icon .giant-tree__guide').classes()
    ).toContain('giant-tree__guide--m-full')
    expect(
      make('upper').find('.item-icon .giant-tree__guide').classes()
    ).toContain('giant-tree__guide--m-upper')
  })

  it('独子（markerLine=none）叶子不画标记列竖线', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({
          deep: 1,
          isLastChild: true,
          guideMask: 0b1,
          markerLine: 'none',
        }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
        showLine: true,
      },
    })
    // 缩进格照常，标记列无 guide 元素。
    expect(wrapper.findAll('.item-guide-cell')).toHaveLength(1)
    expect(wrapper.find('.item-icon .giant-tree__guide').exists()).toBe(false)
  })

  it('分支行（有箭头）不画标记列连接线，只有箭头', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({
          deep: 1,
          leftNode: 0,
          rightNode: 5,
          isLastChild: false,
          guideMask: 0b1,
          markerLine: 'full',
        }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
        showLine: true,
      },
    })
    // 分支行：标记列是箭头本身，不叠加任何 guide 竖线/折线。
    expect(wrapper.find('.giant-tree__icon-arrow-right').exists()).toBe(true)
    expect(wrapper.find('.item-icon .giant-tree__guide').exists()).toBe(false)
  })

  it('缩进格按 guideMask 位决定是否画贯穿竖线', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ deep: 2, isLastChild: true, guideMask: 0b10 }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
        showLine: true,
      },
    })
    const cells = wrapper.findAll('.item-guide-cell')
    // bit0=0 → 列 0 不画；bit1=1 → 列 1 贯穿。
    expect(cells[0].find('.giant-tree__guide').classes()).toContain(
      'giant-tree__guide--v-none'
    )
    expect(cells[1].find('.giant-tree__guide').classes()).toContain(
      'giant-tree__guide--v-full'
    )
  })

  it('guideMask 为 0 的缩进格不画竖线', () => {
    const wrapper = mount(TreeItem, {
      props: {
        item: makeItem({ deep: 2, isLastChild: true, guideMask: 0 }),
        fontSize: '14px',
        selectType: SelectType.CHECKBOX,
        showLine: true,
      },
    })
    const cells = wrapper.findAll('.item-guide-cell')
    expect(cells[0].find('.giant-tree__guide').classes()).toContain(
      'giant-tree__guide--v-none'
    )
    expect(cells[1].find('.giant-tree__guide').classes()).toContain(
      'giant-tree__guide--v-none'
    )
  })
})
