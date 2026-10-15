import { defineConfig } from 'vitepress'
import { fileURLToPath, URL } from 'node:url'
import assemblyscriptSite from './assemblyscript.ts'

const REPOSITORY = 'https://github.com/jktantan/vue3-giant-tree-wasm'
const SITE_NAME = 'VueGiantTree'
const SITE_URL = 'https://jktantan.github.io'
const BASE = '/vue3-giant-tree-wasm/'
// 社交分享卡片图。SVG 在部分平台不生效（Twitter/Facebook 只认位图），
// 后续有 1200×630 的 PNG 时把这里换掉即可。
const OG_IMAGE = `${SITE_URL}${BASE}logo.svg`

/** 站点语种（hreflang 用）：root locale 不带路径前缀。 */
const LOCALES = [
  { key: 'root', hreflang: 'zh-CN', prefix: '' },
  { key: 'en', hreflang: 'en-US', prefix: 'en/' },
  { key: 'ru', hreflang: 'ru-RU', prefix: 'ru/' },
] as const

/** 用 VitePress 的 relativePath 还原出干净的 URL 尾段（配合 cleanUrls）。 */
const cleanPath = (relativePath: string) =>
  relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')

/** 把站点内路径（可能带或不带前导 `/`）补成对外绝对 URL。 */
const withBase = (path: string) =>
  `${SITE_URL}${BASE}${path.replace(/^\/+/, '')}`

/**
 * 各语种的站点描述：locales 配置与 og:description / twitter:description 共用同一份，
 * 避免两处文案漂移。（transformPageData 阶段 `siteConfig.locales` 取不到这里的值，
 * 所以 og 标签不能靠它回落，只能直接引用本常量。）
 */
const DESCRIPTIONS = {
  root: '面向 10 万至百万级节点的 Vue 3 + WebAssembly 虚拟树组件：MPTT + 虚拟滚动，核心算法跑在 WASM。',
  en: 'A WebAssembly-powered Vue 3 virtual tree for 100K–1M-node datasets: MPTT + virtual scrolling, core algorithms in WASM.',
  ru: 'Дерево на Vue 3 + WebAssembly для наборов данных на 100 тыс. — 1 млн узлов: MPTT + виртуальная прокрутка, основные алгоритмы в WASM.',
} as const

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
  title: SITE_NAME,
  base: BASE,
  cleanUrls: true,
  /**
   * sitemap：VitePress 把 hostname 交给 `sitemap` 包，由它用
   * `new URL(item.url, hostname)` 拼接，而页面路径以 `/` 开头，会整段替换掉
   * hostname 里的路径 —— 所以 base 只能加在每个 item 上（改成绝对 URL，
   * 绝对 URL 不会再被解析改写）。
   */
  sitemap: {
    hostname: SITE_URL,
    transformItems: (items) =>
      items.map((item) => ({
        ...item,
        // item.url 不带前导 `/`（首页是空串），所以这里拼带尾斜杠的 BASE。
        url: withBase(item.url),
        // VitePress 自动生成的语种互链同样会丢掉 hostname 里的 base，一并修正。
        links: item.links?.map((link) => ({ ...link, url: withBase(link.url) })),
      })),
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: SITE_NAME }],
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { property: 'og:image:alt', content: `${SITE_NAME} — Vue 3 + WebAssembly tree` }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE }],
  ],

  /**
   * 逐页注入 SEO 元信息：canonical、og:url / og:title / og:description，
   * 以及三个语种之间的 hreflang 互链（避免被搜索引擎当成重复内容）。
   */
  transformPageData(pageData) {
    const slug = cleanPath(pageData.relativePath)
    const canonical = `${SITE_URL}${BASE}${slug}`
    const head = (pageData.frontmatter.head ??= [])

    // 去掉语言前缀后得到语种无关的路径，再拼回各语种的 URL。
    const currentLocale =
      LOCALES.find(
        (locale) => locale.prefix && slug.startsWith(locale.prefix)
      ) ?? LOCALES[0]
    const bareSlug = slug.slice(currentLocale.prefix.length)

    // transformPageData 阶段 pageData.description 还是空串、siteConfig.locales 也取
    // 不到本地的 description，所以直接引用本文件的常量，否则 og:description 会缺失。
    const description =
      pageData.description?.trim() || DESCRIPTIONS[currentLocale.key]

    head.push(['link', { rel: 'canonical', href: canonical }])
    head.push(['meta', { property: 'og:url', content: canonical }])
    head.push([
      'meta',
      { property: 'og:title', content: pageData.title ?? SITE_NAME },
    ])
    if (description) {
      head.push(['meta', { property: 'og:description', content: description }])
      head.push(['meta', { name: 'twitter:description', content: description }])
    }

    for (const locale of LOCALES) {
      head.push([
        'link',
        {
          rel: 'alternate',
          hreflang: locale.hreflang,
          href: `${SITE_URL}${BASE}${locale.prefix}${bareSlug}`,
        },
      ])
    }
    head.push([
      'link',
      {
        rel: 'alternate',
        hreflang: 'x-default',
        href: `${SITE_URL}${BASE}${bareSlug}`,
      },
    ])
  },

  themeConfig: {
    // 站点 LOGO：指数铺开的节点树，浅色/深色各一版
    logo: { light: '/logo.svg', dark: '/logo-dark.svg' },
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    socialLinks: [{ icon: 'github', link: REPOSITORY }],
  },
  locales: {
    root: {
      label: '中文',
      lang: 'zh-CN',
      description: DESCRIPTIONS.root,
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
      description: DESCRIPTIONS.en,
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
    ru: {
      label: 'Русский',
      lang: 'ru-RU',
      description: DESCRIPTIONS.ru,
      themeConfig: {
        nav: [
          { text: 'Главная', link: '/ru/' },
          { text: 'Руководство', link: '/ru/guide/tree-building' },
          { text: 'Демо-площадка', link: '/ru/playground' },
          { text: 'GitHub', link: REPOSITORY },
        ],
        sidebar: buildSidebar(
          '/ru',
          [
            'Построение дерева и формат данных',
            'Виртуальная прокрутка и видимость',
            'Нечёткий поиск',
            'Выбор и режимы вывода',
            'Сериализация и данные узла',
            'Геометрия направляющих линий',
            'Значки узлов',
            'Добавление, изменение и удаление',
            'Worker и производительность',
            'Справочник API',
          ],
          'Руководство',
          'Платформа',
          'Известные ограничения'
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
