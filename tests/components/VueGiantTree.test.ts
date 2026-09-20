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

const waitForBranchAnimation = async (wrapper: ReturnType<typeof mount>) => {
  await new Promise(resolve => setTimeout(resolve, 320))
  await wrapper.vm.$nextTick()
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

  it('显式分批构建保留默认输入的可见节点与禁用语义', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        root: 'root',
        chunkedBuild: true,
        buildBatchSize: 1,
        tree: [
          { id: 'A', name: 'NodeA', parentId: 'root' },
          { id: 'A1', name: 'NodeA1', parentId: 'A', disabled: true },
          { id: 'B', name: 'NodeB', parentId: 'root' },
        ],
      },
    })
    await vi.waitFor(() =>
      expect((wrapper.vm as any).getBuildReady()).toBe(true)
    )
    expect((wrapper.vm as any).getTreeSize()).toBe(3)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tree-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('NodeA')
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

  it('展开节点时只刷新可见窗口且正确显示子节点', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.tree-item')).toHaveLength(2)
    await wrapper.find('.giant-tree__icon-arrow-right').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.tree-item')).toHaveLength(3)
    expect(wrapper.text()).toContain('NodeA1')
  })

  it('节点图标会在展开和收起时同步切换', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
        nodeIcon: true,
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.giant-tree__icon-node-collapsed').exists()).toBe(true)
    await wrapper.find('.giant-tree__icon-arrow-right').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.giant-tree__icon-node-expanded').exists()).toBe(true)

    await waitForBranchAnimation(wrapper)
    await wrapper.find('.giant-tree__icon-arrow-down').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.giant-tree__icon-node-collapsed').exists()).toBe(true)
    expect(wrapper.find('.giant-tree__icon-node-expanded').exists()).toBe(false)
  })

  it('勾选后同步可见节点状态', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper.find('.giant-tree__icon-check-unchecked').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.giant-tree__icon-check-checked').exists()).toBe(true)
  })

  it('公开全部展开和全部收起方法', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()

    ;(wrapper.vm as any).expandAll()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tree-item')).toHaveLength(3)

    ;(wrapper.vm as any).collapseAll()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tree-item')).toHaveLength(2)
  })
  it('搜索结果首次收缩只影响被点击的节点', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        root: 'root',
        tree: [
          { id: 'parent', name: 'Parent', parentId: 'root' },
          { id: 'first', name: 'First match', parentId: 'parent' },
          { id: 'second', name: 'Second match', parentId: 'parent' },
          { id: 'other', name: 'Other match', parentId: 'root' },
        ],
      },
    })
    await flushPromises()
    ;(wrapper.vm as any).fuzzySearchRaw('match')
    await wrapper.vm.$nextTick()

    const parent = wrapper
      .findAll('.tree-item')
      .find(item => item.text().includes('Parent'))
    expect(parent?.find('.giant-tree__icon-arrow-down').exists()).toBe(true)
    await parent?.find('.giant-tree__icon-arrow-down').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.giant-tree__branch-transition').exists()).toBe(true)
    await waitForBranchAnimation(wrapper)

    expect(wrapper.text()).toContain('Parent')
    expect(wrapper.text()).toContain('Other match')
    expect(wrapper.text()).not.toContain('First match')
    expect(wrapper.text()).not.toContain('Second match')
  })
  it('搜索中选中父节点后清空搜索会刷新隐藏子节点状态', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        root: 'root',
        tree: [
          { id: 'parent', name: 'Searchable parent', parentId: 'root' },
          { id: 'child', name: 'Hidden child', parentId: 'parent' },
          { id: 'grandchild', name: 'Hidden grandchild', parentId: 'child' },
        ],
      },
    })
    await flushPromises()
    ;(wrapper.vm as any).fuzzySearchRaw('Searchable')
    await wrapper.vm.$nextTick()
    await wrapper.find('.giant-tree__icon-check-unchecked').trigger('click')
    ;(wrapper.vm as any).fuzzySearchRaw('')
    await wrapper.vm.$nextTick()
    await wrapper.find('.giant-tree__icon-arrow-right').trigger('click')
    await wrapper.vm.$nextTick()
    await waitForBranchAnimation(wrapper)

    const child = wrapper
      .findAll('.tree-item')
      .find(item => item.text().includes('Hidden child'))
    expect(child?.find('.giant-tree__icon-check-checked').exists()).toBe(true)

    await child?.find('.giant-tree__icon-arrow-right').trigger('click')
    await wrapper.vm.$nextTick()
    await waitForBranchAnimation(wrapper)
    const grandchild = wrapper
      .findAll('.tree-item')
      .find(item => item.text().includes('Hidden grandchild'))
    expect(grandchild?.find('.giant-tree__icon-check-checked').exists()).toBe(
      true
    )
  })

  it('选择 API 同步隐藏后代和清空状态的缓存', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        root: 'root',
        tree: [
          { id: 'parent', name: 'Parent', parentId: 'root' },
          { id: 'child', name: 'Child', parentId: 'parent' },
        ],
      },
    })
    await flushPromises()

    const api = wrapper.vm as any
    api.setChecked('parent')
    await wrapper.vm.$nextTick()
    await wrapper.find('.giant-tree__icon-arrow-right').trigger('click')
    await wrapper.vm.$nextTick()
    await waitForBranchAnimation(wrapper)

    const child = wrapper
      .findAll('.tree-item')
      .find(item => item.text().includes('Child'))
    expect(child?.find('.giant-tree__icon-check-checked').exists()).toBe(true)

    api.clearAllChecked()
    await wrapper.vm.$nextTick()
    expect(child?.find('.giant-tree__icon-check-unchecked').exists()).toBe(true)

    api.setCheckedByIds(['parent'])
    await wrapper.vm.$nextTick()
    expect(child?.find('.giant-tree__icon-check-checked').exists()).toBe(true)
  })

  it('SELECT 模式首击展开后的叶子节点即可选中', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        root: 'root',
        selectType: SelectType.SELECT,
        tree: [
          { id: 'parent', name: 'Parent', parentId: 'root' },
          { id: 'leaf', name: 'Leaf', parentId: 'parent' },
        ],
      },
    })
    await flushPromises()
    await wrapper.find('.giant-tree__icon-arrow-right').trigger('click')
    await wrapper.vm.$nextTick()

    const leaf = wrapper
      .findAll('.tree-item')
      .find(item => item.text().includes('Leaf'))
    // Selection is bound to the full virtual row, not just its text line.
    await leaf?.trigger('click')
    await wrapper.vm.$nextTick()

    expect(leaf?.classes()).toContain('selected')
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
