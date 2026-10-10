import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VueGiantTree from '../../lib/VueGiantTree.vue'
import type { TreeInputItem } from '../../lib/types'
import { SelectType } from '../wasm-bridge'

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    private callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      this.callback(
        [
          {
            contentBoxSize: [{ blockSize: 500, inlineSize: 300 }],
          } as unknown as ResizeObserverEntry,
        ],
        this
      )
    }
    disconnect() {}
    unobserve() {}
  }
})

/** 组件实例公开方法的类型化视图，避免测试里出现 any。 */
type TreeApi = {
  updateNode(id: string, patch: Record<string, unknown>): boolean
  removeNode(id: string): boolean
  getBuildReady(): boolean
  getTreeSize(): number
  expandAll(): void
  collapseAll(): void
  fuzzySearchRaw(keyword: string): void
  setChecked(id: string): void
  clearAllChecked(): void
  setCheckedByIds(ids: string[]): void
}
const treeApi = (wrapper: { vm: unknown }): TreeApi => wrapper.vm as TreeApi

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

  it('将 actions 插槽透传到每个可见节点', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
      },
      slots: {
        actions: '<button class="node-action">操作</button>',
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.item-actions')).toHaveLength(2)
    expect(wrapper.findAll('.node-action')).toHaveLength(2)
  })

  it('行右键把节点与原生事件透传给父组件', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('.tree-item')[0].trigger('contextmenu')
    const emitted = wrapper.emitted('item-contextmenu')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({ id: 'A' })
    expect(emitted![0][1]).toBeInstanceOf(MouseEvent)
    // 右键不应触发选中
    expect(wrapper.emitted('item-click')).toBeFalsy()
  })

  it('结构操作通过 update:tree 回写，且不需要重挂载组件', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()

    expect(treeApi(wrapper).updateNode('A', { name: 'Renamed A' })).toBe(true)
    const renamedTree = wrapper.emitted('update:tree')![0][0] as TreeInputItem[]
    expect(renamedTree.find(node => node.id === 'A')?.name).toBe('Renamed A')

    await wrapper.setProps({ tree: renamedTree })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Renamed A')

    expect(treeApi(wrapper).removeNode('A')).toBe(true)
    const prunedTree = wrapper.emitted('update:tree')![1][0] as TreeInputItem[]
    expect(prunedTree.map(node => node.id)).toEqual(['B'])
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
    await vi.waitFor(() => expect(treeApi(wrapper).getBuildReady()).toBe(true))
    expect(treeApi(wrapper).getTreeSize()).toBe(3)
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

    ;(wrapper.vm as TreeApi).expandAll()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tree-item')).toHaveLength(3)

    ;(wrapper.vm as TreeApi).collapseAll()
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
    ;(wrapper.vm as TreeApi).fuzzySearchRaw('match')
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
    ;(wrapper.vm as TreeApi).fuzzySearchRaw('Searchable')
    await wrapper.vm.$nextTick()
    await wrapper.find('.giant-tree__icon-check-unchecked').trigger('click')
    ;(wrapper.vm as TreeApi).fuzzySearchRaw('')
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

    const api = wrapper.vm as TreeApi
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
        'onUpdate:modelValue': (e: unknown) =>
          wrapper.setProps({ modelValue: e }),
      },
    })
    await flushPromises()
    expect(wrapper.find('.giant-tree').exists()).toBe(true)
  })

  it('首次展开不重建未变化的行（箭头 DOM 被复用，过渡才能播放）', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const arrowBefore = wrapper.find(
      '.tree-item .giant-tree__mask-button'
    ).element
    expect(arrowBefore.className).toContain('giant-tree__icon-arrow-right')

    await wrapper.findAll('.item-icon')[0].trigger('click')
    await wrapper.vm.$nextTick()

    const arrowAfter = wrapper.find(
      '.tree-item .giant-tree__mask-button'
    ).element
    // 同一个 DOM 节点：浏览器只看到 class 变化，CSS transition 因此能播放。
    // 若这里被换成了新元素（重建），箭头就会直接跳到目标角度、动画消失。
    expect(arrowAfter).toBe(arrowBefore)
    expect(arrowAfter.className).toContain('giant-tree__icon-arrow-down')
  })

  it('展开与折叠完成后过渡容器都已释放，折叠的行离开 DOM', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('.item-icon')[0].trigger('click')
    await waitForBranchAnimation(wrapper)
    // 过渡结束即释放容器；展开出来的行由普通列表常驻渲染
    expect(wrapper.find('.giant-tree__branch-transition').exists()).toBe(false)
    expect(wrapper.text()).toContain('NodeA1')

    await wrapper.findAll('.item-icon')[0].trigger('click')
    await waitForBranchAnimation(wrapper)
    expect(wrapper.find('.giant-tree__branch-transition').exists()).toBe(false)
    // 被收起的行必须真的离开 DOM，否则它们仍可被 Tab 聚焦、被读屏读出来
    expect(wrapper.text()).not.toContain('NodeA1')
  })

  it('showLine 默认关闭时不渲染连接线格子', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.item-guide-cell')).toHaveLength(0)
  })

  it('showLine 开启后按结构绘制 ├/└ 与祖先竖线', async () => {
    const deepTree: TreeInputItem[] = [
      { id: 'A', name: 'NodeA', parentId: 'root' },
      { id: 'A1', name: 'NodeA1', parentId: 'A' },
      { id: 'A1a', name: 'NodeA1a', parentId: 'A1' },
      { id: 'A1b', name: 'NodeA1b', parentId: 'A1' },
      { id: 'A2', name: 'NodeA2', parentId: 'A' },
      { id: 'B', name: 'NodeB', parentId: 'root' },
    ]
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: deepTree, root: 'root', showLine: true },
    })
    await flushPromises()
    treeApi(wrapper).expandAll()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const rowOf = (label: string) =>
      wrapper.findAll('.tree-item').find(row => row.text().includes(label))!
    const guideClasses = (label: string) =>
      rowOf(label)
        .findAll('.item-guide-cell')
        .map(cell => cell.find('.giant-tree__guide').classes())

    // deep2 叶子 A1a（内层首子）：缩进格两列都贯穿；标记列 full + 横线。
    const a1a = guideClasses('NodeA1a')
    expect(a1a).toHaveLength(2)
    expect(a1a[0]).toContain('giant-tree__guide--v-full')
    expect(a1a[0]).not.toContain('giant-tree__guide--h')
    expect(a1a[1]).toContain('giant-tree__guide--v-full')
    expect(a1a[1]).not.toContain('giant-tree__guide--h')
    const a1aMarker = rowOf('NodeA1a').find('.item-icon .giant-tree__guide')
    expect(a1aMarker.classes()).toContain('giant-tree__guide--m-full')
    expect(a1aMarker.classes()).toContain('giant-tree__guide--h')

    // deep2 叶子 A1b（末子）：标记列 upper + 横线。
    const a1bMarker = rowOf('NodeA1b').find('.item-icon .giant-tree__guide')
    expect(a1bMarker.classes()).toContain('giant-tree__guide--m-upper')
    expect(a1bMarker.classes()).toContain('giant-tree__guide--h')

    // deep1 末子 A2：列 0 贯穿（A 非末子）；标记列 upper。
    const a2 = guideClasses('NodeA2')
    expect(a2).toHaveLength(1)
    expect(a2[0]).toContain('giant-tree__guide--v-full')
    expect(a2[0]).not.toContain('giant-tree__guide--h')
    expect(
      rowOf('NodeA2').find('.item-icon .giant-tree__guide').classes()
    ).toContain('giant-tree__guide--m-upper')

    // 顶层节点不缩进，无连接线格。
    expect(rowOf('NodeB').findAll('.item-guide-cell')).toHaveLength(0)
  })

  it('运行时切换 showLine 即时重绘连接线', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // 先展开 A，使 deep1 的 A1 进入可见区。
    await wrapper.findAll('.item-icon')[0].trigger('click')
    await waitForBranchAnimation(wrapper)
    expect(wrapper.text()).toContain('NodeA1')
    expect(wrapper.findAll('.item-guide-cell')).toHaveLength(0)

    await wrapper.setProps({ showLine: true })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const a1Row = wrapper
      .findAll('.tree-item')
      .find(row => row.text().includes('NodeA1'))!
    expect(a1Row.findAll('.item-guide-cell')).toHaveLength(1)
  })
})
