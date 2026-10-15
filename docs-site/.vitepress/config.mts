import { defineConfig } from 'vitepress'
import { fileURLToPath, URL } from 'node:url'

const REPOSITORY = 'https://github.com/jktantan/vue3-giant-tree-wasm'

export default defineConfig({
  title: 'VueGiantTree',
  description:
    '面向 10 万至百万级节点的 Vue 3 + WebAssembly 虚拟树组件：MPTT + 虚拟滚动，核心算法跑在 WASM。',
  base: '/vue3-giant-tree-wasm/',
  lang: 'zh-CN',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '使用说明', link: '/guide/tree-building' },
      { text: '演示场', link: '/playground' },
      { text: 'GitHub', link: REPOSITORY },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '使用说明',
          items: [
            { text: '树构建与数据格式', link: '/guide/tree-building' },
            { text: '虚拟滚动与可见性', link: '/guide/virtual-scroll' },
            { text: '模糊搜索', link: '/guide/fuzzy-search' },
            { text: '勾选与输出模式', link: '/guide/check-and-output' },
            { text: '序列化与节点数据', link: '/guide/serialization' },
            { text: '连接线几何', link: '/guide/guide-lines' },
            { text: '节点图标', link: '/guide/node-icons' },
            { text: '节点增删改', link: '/guide/crud' },
            { text: 'Worker 与性能', link: '/guide/worker' },
            { text: 'API 汇总', link: '/guide/api-reference' },
          ],
        },
      ],
      '/platform/': [
        {
          text: '平台',
          items: [{ text: '已知限制', link: '/platform/known-limitations' }],
        },
      ],
    },
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    socialLinks: [{ icon: 'github', link: REPOSITORY }],
  },
  vite: {
    plugins: [],
    resolve: {
      alias: {
        // lib/ 源码在仓库根，站点 root 是 docs-site/。
        '@lib': fileURLToPath(new URL('../../lib', import.meta.url)),
      },
    },
    // lib/VueGiantTree.vue 用 `new Worker(new URL('./tree.worker.ts', import.meta.url))`，
    // worker 需按 ESM 产物输出。
    worker: { format: 'es' },
  },
})
