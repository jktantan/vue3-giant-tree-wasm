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
})
