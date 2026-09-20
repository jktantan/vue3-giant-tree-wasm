import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TreeItem from '../../lib/TreeItem.vue'
import { SelectType, CheckType } from '../wasm-bridge'

function makeItem(overrides: Record<string, any> = {}) {
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
      }).find('.giant-tree__node-icon').exists()
    ).toBe(false)
    expect(
      mount(TreeItem, {
        props: { ...baseProps, item: makeItem({ id: 'file' }) },
      }).find('.app-icon-file').exists()
    ).toBe(true)
    expect(
      mount(TreeItem, {
        props: {
          ...baseProps,
          item: makeItem({ leftNode: 0, rightNode: 5, collapsed: false }),
        },
      }).find('.app-icon-folder-open').exists()
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
})
