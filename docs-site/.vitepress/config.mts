import { defineConfig } from 'vitepress'
import { fileURLToPath, URL } from 'node:url'
import assemblyscriptSite from './assemblyscript.ts'

const REPOSITORY = 'https://github.com/jktantan/vue3-giant-tree-wasm'

/** 各语种共用的侧边栏条目顺序（slug 相同，标题不同）。 */
const GUIDE_SLUGS = [
  'tree-building',
  'virtual-scroll',
  'fuzzy-search',
  'check-and-output',
  'serialization',
  'guide-lines',
  'node-icons',
  'crud',
  'worker',
  'api-reference',
] as const

const buildSidebar = (
  prefix: string,
  titles: string[],
  groupText: string,
  platformText: string,
  limitationsText: string
) => ({
  [`${prefix}/guide/`]: [
    {
      text: groupText,
      items: GUIDE_SLUGS.map((slug, index) => ({
        text: titles[index],
        link: `${prefix}/guide/${slug}`,
      })),
    },
  ],
  [`${prefix}/platform/`]: [
    {
      text: platformText,
      items: [{ text: limitationsText, link: `${prefix}/platform/known-limitations` }],
    },
  ],
})

export default defineConfig({
  title: 'VueGiantTree',
  base: '/vue3-giant-tree-wasm/',
  cleanUrls: true,
  themeConfig: {
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    socialLinks: [{ icon: 'github', link: REPOSITORY }],
  },
  locales: {
    root: {
      label: '中文',
      lang: 'zh-CN',
      description:
        '面向 10 万至百万级节点的 Vue 3 + WebAssembly 虚拟树组件：MPTT + 虚拟滚动，核心算法跑在 WASM。',
      themeConfig: {
        nav: [
          { text: '首页', link: '/' },
          { text: '使用说明', link: '/guide/tree-building' },
          { text: '演示场', link: '/playground' },
          { text: 'GitHub', link: REPOSITORY },
        ],
        sidebar: buildSidebar(
          '',
          [
            '树构建与数据格式',
            '虚拟滚动与可见性',
            '模糊搜索',
            '勾选与输出模式',
            '序列化与节点数据',
            '连接线几何',
            '节点图标',
            '节点增删改',
            'Worker 与性能',
            'API 汇总',
          ],
          '使用说明',
          '平台',
          '已知限制'
        ),
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      description:
        'A WebAssembly-powered Vue 3 virtual tree for 100K–1M-node datasets: MPTT + virtual scrolling, core algorithms in WASM.',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Guide', link: '/en/guide/tree-building' },
          { text: 'Playground', link: '/en/playground' },
          { text: 'GitHub', link: REPOSITORY },
        ],
        sidebar: buildSidebar(
          '/en',
          [
            'Tree building & data format',
            'Virtual scrolling & visibility',
            'Fuzzy search',
            'Checking & output modes',
            'Serialization & node data',
            'Guide-line geometry',
            'Node icons',
            'Adding, editing & deleting',
            'Worker mode & performance',
            'API reference',
          ],
          'Guide',
          'Platform',
          'Known limitations'
        ),
      },
    },
  },
  vite: {
    plugins: [assemblyscriptSite()],
    // AssemblyScript 的 ESM loader 用 top-level await；Vite 默认的 'modules'
    // target（es2020 一档）会拒绝它，故站点构建提到 esnext。
    build: { target: 'esnext' },
    resolve: {
      alias: {
        // lib/ 源码在仓库根，站点 root 是 docs-site/。
        '@lib': fileURLToPath(new URL('../../lib', import.meta.url)),
      },
    },
    // lib/VueGiantTree.vue 用 `new Worker(new URL('./tree.worker.ts', import.meta.url))`，
    // worker 需按 ESM 产物输出；worker 内也会 import '../build/release'，故同样挂上插件。
    worker: {
      format: 'es',
      plugins: () => [assemblyscriptSite()],
    },
  },
})
