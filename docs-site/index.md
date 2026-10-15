---
layout: home

hero:
  name: VueGiantTree
  text: 大规模树的 Vue 3 + WebAssembly 组件
  tagline: 面向 10 万至百万级节点；MPTT + 虚拟滚动，核心算法跑在 WASM
  actions:
    - theme: brand
      text: 从树构建开始
      link: /guide/tree-building
    - theme: alt
      text: 打开演示场
      link: /playground
    - theme: alt
      text: GitHub
      link: https://github.com/jktantan/vue3-giant-tree-wasm

features:
  - title: WASM 加速
    details: 树构建、遍历、搜索、选中都在 WebAssembly（AssemblyScript）中执行。
  - title: 虚拟滚动
    details: 只渲染可视区域内的行，DOM 占用极低。
  - title: MPTT 算法
    details: O(1) 子树判定、O(k) 视口切片、O(subtree + log N) 展开/折叠。
  - title: 三种选择模式
    details: 多选（Checkbox）、单选（Radio）、点击选中（Select）。
  - title: 模糊搜索
    details: 关键词过滤并自动补全祖先链；搜索视图的展开状态不影响主树。
  - title: 可交互 DEMO
    details: 每一页都内嵌跑真实 WASM 的演示，可切换数据规模与配置。
---
