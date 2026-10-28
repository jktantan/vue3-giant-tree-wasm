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
  addNode(node: Record<string, unknown>): boolean
  removeNode(id: string): boolean
  getBuildReady(): boolean
  getTreeSize(): number
  getBuildMetrics(): { contentDiffHits: number; contentDiffMs: number }
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
    const container = wrapper.find('.giant-tree__list')
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

    expect(wrapper.findAll('.giant-tree__actions')).toHaveLength(2)
    expect(wrapper.findAll('.node-action')).toHaveLength(2)
  })

  it('行右键把节点与原生事件透传给父组件', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('.giant-tree__row')[0].trigger('contextmenu')
    const emitted = wrapper.emitted('item-contextmenu')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toMatchObject({ id: 'A' })
    expect(emitted![0][1]).toBeInstanceOf(MouseEvent)
    // 右键不应触发选中
    expect(wrapper.emitted('item-click')).toBeFalsy()
  })

  it('JSON 输出使用最新输入行（外部替换 tree 后不残留旧对象）', async () => {
    const first = [
      { id: 'A', name: 'A', parentId: 'root', meta: 'old' },
    ] as TreeInputItem[]
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: first,
        root: 'root',
        outputIdOnly: false,
      },
    })
    await flushPromises()

    treeApi(wrapper).setChecked('A')
    await flushPromises()
    let emitted = wrapper.emitted('update:modelValue')!
    let last = emitted[emitted.length - 1][0] as Array<Record<string, unknown>>
    expect(last[0].meta).toBe('old')

    await wrapper.setProps({
      tree: [
        { id: 'A', name: 'A', parentId: 'root', meta: 'new' },
      ] as TreeInputItem[],
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    treeApi(wrapper).clearAllChecked()
    treeApi(wrapper).setChecked('A')
    await flushPromises()
    emitted = wrapper.emitted('update:modelValue')!
    last = emitted[emitted.length - 1][0] as Array<Record<string, unknown>>
    expect(last[0].meta).toBe('new')
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

  it('运行时修改 lineHeight 会更新虚拟滚动几何', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
        lineHeight: 26,
      },
    })
    await flushPromises()
    treeApi(wrapper).expandAll()
    await wrapper.vm.$nextTick()

    const phantom = wrapper.find('.giant-tree__phantom')
    expect(phantom.attributes('style')).toContain('height: 78px')

    await wrapper.setProps({ lineHeight: 40 })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(phantom.attributes('style')).toContain('height: 120px')
  })

  it('运行时修改 selectType / root / fieldKeys 会重建 WASM 实例', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
      },
    })
    await flushPromises()
    expect(wrapper.findAll('[role="checkbox"]').length).toBeGreaterThan(0)

    await wrapper.setProps({ selectType: SelectType.RADIO })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(0)
    expect(wrapper.findAll('[role="radio"]').length).toBeGreaterThan(0)

    const custom = [
      { key: 'A', label: 'Custom A', parent: 'ROOT' },
      { key: 'B', label: 'Custom B', parent: 'ROOT' },
    ]
    await wrapper.setProps({
      root: 'ROOT',
      fieldKeys: {
        idField: 'key',
        nameField: 'label',
        parentIdField: 'parent',
      },
      tree: custom,
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(treeApi(wrapper).getTreeSize()).toBe(2)
    expect(wrapper.text()).toContain('Custom A')
    expect(wrapper.text()).toContain('Custom B')
  })

  it('主线程 addNode 增量更新可见行，无需整树重建', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    treeApi(wrapper).expandAll()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.giant-tree__row')).toHaveLength(3)

    expect(
      treeApi(wrapper).addNode({ id: 'A2', name: 'NodeA2', parentId: 'A' })
    ).toBe(true)
    const emitted = wrapper.emitted('update:tree')!
    const updated = emitted[emitted.length - 1][0] as TreeInputItem[]
    expect(updated.map(node => node.id)).toEqual(['A', 'A1', 'B', 'A2'])
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(treeApi(wrapper).getTreeSize()).toBe(4)
    expect(wrapper.text()).toContain('NodeA2')
    await wrapper.setProps({ tree: updated })
    await flushPromises()
  })

  it('主线程 removeNode 增量删除整个子树', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    treeApi(wrapper).expandAll()
    await wrapper.vm.$nextTick()

    expect(treeApi(wrapper).removeNode('A')).toBe(true)
    const emitted = wrapper.emitted('update:tree')!
    const updated = emitted[emitted.length - 1][0] as TreeInputItem[]
    expect(updated.map(node => node.id)).toEqual(['B'])
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(treeApi(wrapper).getTreeSize()).toBe(1)
    expect(wrapper.text()).toContain('NodeB')
    expect(wrapper.text()).not.toContain('NodeA1')
    await wrapper.setProps({ tree: updated })
    await flushPromises()
  })

  it('主线程 updateNode 支持移动子树与禁用状态', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    treeApi(wrapper).expandAll()
    await wrapper.vm.$nextTick()

    expect(treeApi(wrapper).updateNode('A', { parentId: 'B' })).toBe(true)
    const emitted = wrapper.emitted('update:tree')!
    const moved = emitted[emitted.length - 1][0] as TreeInputItem[]
    expect(moved.find(node => node.id === 'A')?.parentId).toBe('B')
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.giant-tree__row').map(row => row.text())).toEqual([
      'NodeB',
      'NodeA',
      'NodeA1',
    ])

    // Moving a node into its own descendant must be rejected.
    expect(treeApi(wrapper).updateNode('A', { parentId: 'A1' })).toBe(false)

    expect(treeApi(wrapper).updateNode('B', { disabled: true })).toBe(true)
    await flushPromises()
    await wrapper.vm.$nextTick()
    const rows = wrapper.findAll('.giant-tree__row')
    expect(rows[0].classes()).toContain('giant-tree__row--disabled')
    await wrapper.setProps({ tree: moved })
    await flushPromises()
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
    expect(wrapper.findAll('.giant-tree__row')).toHaveLength(2)
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
    const container = wrapper.find('.giant-tree__container')
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
    const container = wrapper.find('.giant-tree__container')
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
    expect(wrapper.find('.giant-tree__container').exists()).toBe(true)
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
    expect(wrapper.find('.giant-tree__phantom').exists()).toBe(true)
    expect(wrapper.find('.giant-tree__list').exists()).toBe(true)
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

    expect(wrapper.findAll('.giant-tree__row')).toHaveLength(2)
    await wrapper.find('.giant-tree__icon-arrow-right').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.giant-tree__row')).toHaveLength(3)
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
    expect(wrapper.findAll('.giant-tree__row')).toHaveLength(3)

    ;(wrapper.vm as TreeApi).collapseAll()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.giant-tree__row')).toHaveLength(2)
  })
  it('开启 searchHighlight 时只高亮输入的关键词片段', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        root: 'root',
        searchHighlight: true,
        tree: [
          { id: 'parent', name: 'Parent Group', parentId: 'root' },
          { id: 'child', name: 'Match A and Match B', parentId: 'parent' },
          { id: 'hidden', name: 'Hidden child', parentId: 'child' },
        ],
      },
    })
    await flushPromises()
    ;(wrapper.vm as TreeApi).fuzzySearchRaw('Match')
    await wrapper.vm.$nextTick()

    const hits = wrapper.findAll('.giant-tree__search-hit')
    expect(hits.map(hit => hit.text())).toEqual(['Match', 'Match'])

    // 祖先只是因为补全路径出现，名称不含关键词，不应被高亮。
    const parent = wrapper
      .findAll('.giant-tree__row')
      .find(item => item.text() === 'Parent Group')
    expect(parent?.find('.giant-tree__search-hit').exists()).toBe(false)
  })

  it('searchHighlight 默认关闭，清空搜索后高亮消失', async () => {
    const tree = [
      { id: 'parent', name: 'Parent Group', parentId: 'root' },
      { id: 'child', name: 'Match A', parentId: 'parent' },
    ]
    const off = mount(VueGiantTree, {
      props: { modelValue: [], root: 'root', tree },
    })
    await flushPromises()
    ;(off.vm as TreeApi).fuzzySearchRaw('Match')
    await off.vm.$nextTick()
    expect(off.find('.giant-tree__search-hit').exists()).toBe(false)

    const on = mount(VueGiantTree, {
      props: { modelValue: [], root: 'root', searchHighlight: true, tree },
    })
    await flushPromises()
    ;(on.vm as TreeApi).fuzzySearchRaw('Match')
    await on.vm.$nextTick()
    expect(on.find('.giant-tree__search-hit').exists()).toBe(true)

    ;(on.vm as TreeApi).fuzzySearchRaw('')
    await on.vm.$nextTick()
    expect(on.find('.giant-tree__search-hit').exists()).toBe(false)
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
      .findAll('.giant-tree__row')
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
      .findAll('.giant-tree__row')
      .find(item => item.text().includes('Hidden child'))
    expect(child?.find('.giant-tree__icon-check-checked').exists()).toBe(true)

    await child?.find('.giant-tree__icon-arrow-right').trigger('click')
    await wrapper.vm.$nextTick()
    await waitForBranchAnimation(wrapper)
    const grandchild = wrapper
      .findAll('.giant-tree__row')
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
      .findAll('.giant-tree__row')
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
      .findAll('.giant-tree__row')
      .find(item => item.text().includes('Leaf'))
    // Selection is bound to the full virtual row, not just its text line.
    await leaf?.trigger('click')
    await wrapper.vm.$nextTick()

    expect(leaf?.classes()).toContain('giant-tree__row--selected')
  })

  it('自定义 fontSize 通过根节点 CSS 变量下发', async () => {
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
    const style = wrapper.find('.giant-tree').attributes('style') ?? ''
    expect(style).toContain('--giant-tree-font-size: 18px')
    expect(style).toContain('--giant-tree-row-size: 18px')
    expect(style).toContain('--giant-tree-indent-size: 18px')
    expect(style).toContain('--giant-tree-icon-size: 18px')
  })

  it('默认不写内联尺寸变量，宿主可用 CSS 覆盖', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const style = wrapper.find('.giant-tree').attributes('style') ?? ''
    expect(style).not.toContain('--giant-tree-font-size')
  })

  it('theme=dark / light 在根节点挂主题类，inherit 不挂', async () => {
    const mountWithTheme = (theme?: 'dark' | 'light' | 'inherit') =>
      mount(VueGiantTree, {
        props: {
          modelValue: [],
          tree: makeTreeData(),
          root: 'root',
          ...(theme ? { theme } : {}),
        },
      })

    const dark = mountWithTheme('dark')
    expect(dark.find('.giant-tree').classes()).toContain('giant-tree--dark')

    const light = mountWithTheme('light')
    expect(light.find('.giant-tree').classes()).toContain('giant-tree--light')

    const inherit = mountWithTheme()
    expect(inherit.find('.giant-tree').classes()).not.toContain(
      'giant-tree--dark'
    )
    expect(inherit.find('.giant-tree').classes()).not.toContain(
      'giant-tree--light'
    )
  })

  it('size 预设同时切换根节点类与虚拟行高', async () => {
    const mountWithSize = (size: 'small' | 'default' | 'large') =>
      mount(VueGiantTree, {
        props: {
          modelValue: [],
          tree: makeTreeData(),
          root: 'root',
          size,
        },
      })

    const small = mountWithSize('small')
    await flushPromises()
    await small.vm.$nextTick()
    expect(small.find('.giant-tree').classes()).toContain('giant-tree--small')
    expect(small.find('.giant-tree__row').attributes('style')).toContain(
      'height: 24px'
    )

    const large = mountWithSize('large')
    await flushPromises()
    await large.vm.$nextTick()
    expect(large.find('.giant-tree').classes()).toContain('giant-tree--large')
    expect(large.find('.giant-tree__row').attributes('style')).toContain(
      'height: 32px'
    )

    const normal = mountWithSize('default')
    await flushPromises()
    await normal.vm.$nextTick()
    expect(normal.find('.giant-tree').classes()).not.toContain(
      'giant-tree--small'
    )
    expect(normal.find('.giant-tree').classes()).not.toContain(
      'giant-tree--large'
    )
    expect(normal.find('.giant-tree__row').attributes('style')).toContain(
      'height: 26px'
    )
  })

  it('显式 lineHeight 优先于 size 预设', async () => {
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        tree: makeTreeData(),
        root: 'root',
        size: 'small',
        lineHeight: 30,
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.giant-tree__row').attributes('style')).toContain(
      'height: 30px'
    )
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
      '.giant-tree__row .giant-tree__mask-button'
    ).element
    expect(arrowBefore.className).toContain('giant-tree__icon-arrow-right')

    await wrapper.findAll('.giant-tree__arrow-cell')[0].trigger('click')
    await wrapper.vm.$nextTick()

    const arrowAfter = wrapper.find(
      '.giant-tree__row .giant-tree__mask-button'
    ).element
    // 同一个 DOM 节点：浏览器只看到 class 变化，CSS transition 因此能播放。
    // 若这里被换成了新元素（重建），箭头就会直接跳到目标角度、动画消失。
    expect(arrowAfter).toBe(arrowBefore)
    expect(arrowAfter.className).toContain('giant-tree__icon-arrow-down')
  })

  it('展开高于视口的分支时，兄弟行在动画期间保留并随容器下移', async () => {
    const children = Array.from({ length: 30 }, (_, index) => ({
      id: `c${index}`,
      name: `Child${index}`,
      parentId: 'P',
    }))
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        root: 'root',
        tree: [
          { id: 'P', name: 'Parent', parentId: 'root' },
          ...children,
          { id: 'S', name: 'Sibling', parentId: 'root' },
        ],
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const parent = wrapper
      .findAll('.giant-tree__row')
      .find(item => item.text().includes('Parent'))
    await parent?.find('.giant-tree__arrow-cell').trigger('click')
    await wrapper.vm.$nextTick()

    // 展开后虚拟窗口被 30 个子行填满，Sibling 被挤出窗口；它仍必须留在
    // DOM 中排在过渡容器之后，否则父节点下方会先塌成空白再长出内容。
    expect(wrapper.find('.giant-tree__branch-transition').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sibling')

    await new Promise(resolve => setTimeout(resolve, 520))
    await wrapper.vm.$nextTick()
  })

  it('分支过渡时长随高度增加而变长（像素速度恒定）', async () => {
    const children = Array.from({ length: 18 }, (_, index) => ({
      id: `c${index}`,
      name: `Child${index}`,
      parentId: 'P',
    }))
    const wrapper = mount(VueGiantTree, {
      props: {
        modelValue: [],
        root: 'root',
        tree: [{ id: 'P', name: 'Parent', parentId: 'root' }, ...children],
      },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const parent = wrapper
      .findAll('.giant-tree__row')
      .find(item => item.text().includes('Parent'))
    await parent?.find('.giant-tree__arrow-cell').trigger('click')
    await wrapper.vm.$nextTick()

    const style =
      wrapper.find('.giant-tree__branch-transition').attributes('style') ?? ''
    const duration = Number(
      /--giant-tree-branch-duration:\s*(\d+)ms/.exec(style)?.[1]
    )
    // 18 行 × 26px 远超单行分支的 120ms 下限，说明时长由高度换算而来，
    // 而不是所有分支共用一个固定时长。
    expect(duration).toBeGreaterThan(120)
    await waitForBranchAnimation(wrapper)
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

    await wrapper.findAll('.giant-tree__arrow-cell')[0].trigger('click')
    await waitForBranchAnimation(wrapper)
    // 过渡结束即释放容器；展开出来的行由普通列表常驻渲染
    expect(wrapper.find('.giant-tree__branch-transition').exists()).toBe(false)
    expect(wrapper.text()).toContain('NodeA1')

    await wrapper.findAll('.giant-tree__arrow-cell')[0].trigger('click')
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
    expect(wrapper.findAll('.giant-tree__guide-cell')).toHaveLength(0)
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
      wrapper.findAll('.giant-tree__row').find(row => row.text().includes(label))!
    const guideClasses = (label: string) =>
      rowOf(label)
        .findAll('.giant-tree__guide-cell')
        .map(cell => cell.find('.giant-tree__guide').classes())

    // deep2 叶子 A1a（内层首子）：缩进格两列都贯穿；标记列 full + 横线。
    const a1a = guideClasses('NodeA1a')
    expect(a1a).toHaveLength(2)
    expect(a1a[0]).toContain('giant-tree__guide--v-full')
    expect(a1a[0]).not.toContain('giant-tree__guide--h')
    expect(a1a[1]).toContain('giant-tree__guide--v-full')
    expect(a1a[1]).not.toContain('giant-tree__guide--h')
    const a1aMarker = rowOf('NodeA1a').find('.giant-tree__arrow-cell .giant-tree__guide')
    expect(a1aMarker.classes()).toContain('giant-tree__guide--m-full')
    expect(a1aMarker.classes()).toContain('giant-tree__guide--h')

    // deep2 叶子 A1b（末子）：标记列 upper + 横线。
    const a1bMarker = rowOf('NodeA1b').find('.giant-tree__arrow-cell .giant-tree__guide')
    expect(a1bMarker.classes()).toContain('giant-tree__guide--m-upper')
    expect(a1bMarker.classes()).toContain('giant-tree__guide--h')

    // deep1 末子 A2：列 0 贯穿（A 非末子）；标记列 upper。
    const a2 = guideClasses('NodeA2')
    expect(a2).toHaveLength(1)
    expect(a2[0]).toContain('giant-tree__guide--v-full')
    expect(a2[0]).not.toContain('giant-tree__guide--h')
    expect(
      rowOf('NodeA2').find('.giant-tree__arrow-cell .giant-tree__guide').classes()
    ).toContain('giant-tree__guide--m-upper')

    // 顶层节点不缩进，无连接线格。
    expect(rowOf('NodeB').findAll('.giant-tree__guide-cell')).toHaveLength(0)
  })

  it('运行时切换 showLine 即时重绘连接线', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // 先展开 A，使 deep1 的 A1 进入可见区。
    await wrapper.findAll('.giant-tree__arrow-cell')[0].trigger('click')
    await waitForBranchAnimation(wrapper)
    expect(wrapper.text()).toContain('NodeA1')
    expect(wrapper.findAll('.giant-tree__guide-cell')).toHaveLength(0)

    await wrapper.setProps({ showLine: true })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const a1Row = wrapper
      .findAll('.giant-tree__row')
      .find(row => row.text().includes('NodeA1'))!
    expect(a1Row.findAll('.giant-tree__guide-cell')).toHaveLength(1)
  })

  it('名称-only 替换走内容 diff，并保留结构状态', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const before = treeApi(wrapper).getBuildMetrics().contentDiffHits

    const next = makeTreeData().map(node =>
      node.id === 'A' ? { ...node, name: 'Renamed A' } : node
    )
    await wrapper.setProps({ tree: next })
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(treeApi(wrapper).getBuildMetrics().contentDiffHits).toBe(before + 1)
    expect(wrapper.text()).toContain('Renamed A')
    expect(treeApi(wrapper).getTreeSize()).toBe(3)
  })

  it('结构变化不会误走内容 diff', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const before = treeApi(wrapper).getBuildMetrics().contentDiffHits

    await wrapper.setProps({
      tree: [...makeTreeData(), { id: 'C', name: 'NodeC', parentId: 'root' }],
    })
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(treeApi(wrapper).getBuildMetrics().contentDiffHits).toBe(before)
    expect(treeApi(wrapper).getTreeSize()).toBe(4)
    expect(wrapper.text()).toContain('NodeC')
  })

  it('disabled-only 替换走内容 diff 并更新禁用语义', async () => {
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: makeTreeData(), root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const before = treeApi(wrapper).getBuildMetrics().contentDiffHits

    const next = makeTreeData().map(node =>
      node.id === 'B' ? { ...node, disabled: true } : node
    )
    await wrapper.setProps({ tree: next })
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(treeApi(wrapper).getBuildMetrics().contentDiffHits).toBe(before + 1)
    const bRow = wrapper
      .findAll('.giant-tree__row')
      .find(row => row.text().includes('NodeB'))!
    expect(bRow.classes()).toContain('giant-tree__row--disabled')
    expect(treeApi(wrapper).getTreeSize()).toBe(3)
  })

  it('原地改名后替换数组也能命中内容 diff', async () => {
    const nodes = makeTreeData()
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: nodes, root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const before = treeApi(wrapper).getBuildMetrics().contentDiffHits

    nodes[0].name = '原地改名'
    await wrapper.setProps({ tree: [...nodes] })
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(treeApi(wrapper).getBuildMetrics().contentDiffHits).toBe(before + 1)
    expect(wrapper.text()).toContain('原地改名')
  })

  it('大量 disabled 变化回退全量重建，避免逐节点重写前缀', async () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      id: `x${i}`,
      name: `X${i}`,
      parentId: 'root',
    }))
    const wrapper = mount(VueGiantTree, {
      props: { modelValue: [], tree: nodes, root: 'root' },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const before = treeApi(wrapper).getBuildMetrics().contentDiffHits

    const next = nodes.map((node, i) =>
      i < 65 ? { ...node, disabled: true } : node
    )
    await wrapper.setProps({ tree: next })
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(treeApi(wrapper).getBuildMetrics().contentDiffHits).toBe(before)
    expect(treeApi(wrapper).getTreeSize()).toBe(100)
    expect(wrapper.findAll('.giant-tree__row')[0].classes()).toContain(
      'giant-tree__row--disabled'
    )
  })
})
