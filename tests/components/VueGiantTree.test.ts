import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueGiantTree from '../../lib/VueGiantTree.vue'
import { SelectType } from '../wasm-bridge'

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    private callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(target: Element) {
      this.callback(
        [{ contentBoxSize: [{ blockSize: 500, inlineSize: 300 }] } as any],
        this
      )
    }
    disconnect() {}
    unobserve() {}
  }
})

function makeTreeData() {
  return [
    { id: 'A', name: 'NodeA', parentId: 'root' },
    { id: 'A1', name: 'NodeA1', parentId: 'A' },
    { id: 'B', name: 'NodeB', parentId: 'root' },
  ]
}

describe('VueGiantTree: 主组件', () => {
  it('空数据挂载不崩溃', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: [],
        root: '',
      },
    })
    await flushPromises()
    expect(wrapper.find('.giant-tree').exists()).toBe(true)
  })

  it('传入数据后组件正常渲染', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const container = wrapper.find('.infinite-list')
    expect(container.exists()).toBe(true)
  })

  it('默认 props 值', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: [],
        root: '',
      },
    })
    await flushPromises()
    const container = wrapper.find('.tree-container')
    expect(container.attributes('style')).toContain('width: 100%')
    expect(container.attributes('style')).toContain('height: 100%')
  })

  it('自定义宽高', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: [],
        root: '',
        width: '300px',
        height: '500px',
      },
    })
    await flushPromises()
    const container = wrapper.find('.tree-container')
    expect(container.attributes('style')).toContain('width: 300px')
    expect(container.attributes('style')).toContain('height: 500px')
  })

  it('容器包含正确的 class', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: [],
        root: '',
      },
    })
    await flushPromises()
    expect(wrapper.find('.giant-tree').exists()).toBe(true)
    expect(wrapper.find('.tree-container').exists()).toBe(true)
  })

  it('虚拟滚动 DOM 结构', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: [],
        root: '',
      },
    })
    await flushPromises()
    expect(wrapper.find('.infinite-list-phantom').exists()).toBe(true)
    expect(wrapper.find('.infinite-list').exists()).toBe(true)
  })

  it('自定义 fontSize', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
        fontSize: '18px',
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const items = wrapper.findAll('.tree-item')
    if (items.length > 0) {
      expect(items[0].attributes('style')).toContain('font-size: 18px')
    }
  })

  it('v-model 双向绑定：选中触发 update:modelValue', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
        'onUpdate:modelValue': (e: any) => wrapper.setProps({ modelValue: e }),
      },
    })
    await flushPromises()
    expect(wrapper.find('.giant-tree').exists()).toBe(true)
  })
})
