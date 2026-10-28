import { fileURLToPath, URL } from 'node:url'
import { cpSync, existsSync, rmSync } from 'node:fs'
import dts from 'vite-plugin-dts'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import loadVersion from 'vite-plugin-package-version'
import assemblyscriptPlugin from './vite-plugin-assemblyscript.ts'

/**
 * 把 SCSS 源发布到包根的 `scss/`，让消费者能做编译期定制：
 *
 *   @use 'vue3-giant-tree-wasm/scss/style/common/var' with (
 *     $giant-tree__color-primary: #7c3aed
 *   );
 *   @use 'vue3-giant-tree-wasm/scss/style/index';
 *
 * 放到包根而不是 dist 下，是因为 Sass 的普通 filesystem importer 不会读
 * package.json 的 exports：裸包名会被解析成
 * `node_modules/<pkg>/scss/...`，只有真实存在这个目录才找得到。`files`
 * 里同步加上 "scss"，发布时才会带上。
 *
 * Ship the SCSS sources at the package root so consumers can customise them
 * at compile time. Sass's filesystem importer resolves bare package imports to
 * `node_modules/<pkg>/scss/...`, so a root-level directory is required.
 */
const copyScssSources = (): Plugin => ({
  name: 'copy-library-scss',
  apply: 'build',
  closeBundle() {
    const from = fileURLToPath(new URL('./lib/assets', import.meta.url))
    const to = fileURLToPath(new URL('./scss', import.meta.url))
    if (!existsSync(from)) return
    rmSync(to, { recursive: true, force: true })
    cpSync(from, to, {
      recursive: true,
      filter: source => !source.endsWith('.DS_Store'),
    })

    // `lib/style.ts` 只是 CSS 的构建载体：它生成的 JS（以及多入口带来的
    // 空声明文件）没有运行时意义，发布前清掉，避免 dist 里出现无用文件。
    for (const relativePath of [
      './dist/style.js',
      './dist/style.d.ts',
      './dist/index.d.ts',
      './dist/lib/style.d.ts',
    ]) {
      rmSync(fileURLToPath(new URL(relativePath, import.meta.url)), {
        force: true,
      })
    }
  },
})

// https://vitejs.dev/config/
export default defineConfig(() => ({
  // 库产物会被安装到 node_modules 的任意深度：绝对资源路径（/assets/…）会被
  // 解析到站点根目录而 404，只有相对路径才能让 worker / wasm 随包被消费者取到。
  base: './',
  plugins: [
    assemblyscriptPlugin(),
    vue(),
    vueJsx(),
    loadVersion(),
    dts({ insertTypesEntry: true, tsconfigPath: 'tsconfig.lib.json' }),
    copyScssSources(),
  ],
  resolve: {
    alias: {
      '@lib': fileURLToPath(new URL('./lib', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
    // worker 内 `import('../build/release')` 也会经过插件图，
    // 显式挂上 assemblyscriptPlugin 确保同一份 virtual 模块被复用，
    // 而不是被 Vite 单独 chunk 出孤儿 release 文件。
    plugins: () => [assemblyscriptPlugin()],
    rolldownOptions: {
      output: {
        // worker 必须是自包含的单文件：消费者打包器只会把 worker 入口搬进自己的产物，
        // 不会重写它内部的相对 import。一旦 rolldown 把互操作辅助提取成共享 chunk
        // （`import{...}from"./rolldown-runtime-*.js"`），worker 一加载就是 404。
        // （禁用代码分割在 rolldown 里的当前写法是 codeSplitting，旧的
        // inlineDynamicImports 已弃用并会打警告。）
        codeSplitting: false,
      },
    },
  },
  oxc: {
    transform: {
      target: 'es2022',
    },
  },
  build: {
    // lib 产物不需要 public 资源（favicon 等是应用 demo 用的，不进 npm 包）。
    copyPublicDir: false,
    publicDir: false,
    lib: {
      // 两个入口：公开 JS 入口，以及只用于生成 `style.css` 的样式入口。
      // 后者不导出给消费者，构建完会删掉它的 JS 产物。
      entry: {
        index: fileURLToPath(new URL('./lib/index.ts', import.meta.url)),
        style: fileURLToPath(new URL('./lib/style.ts', import.meta.url)),
      },
      name: 'vue-giant-tree',
      formats: ['es'],
      fileName: (_format, entryName) =>
        entryName === 'index' ? 'vue-giant-tree.es.js' : 'style.js',
      // 固定 CSS 文件名（默认是包名），让 package.json 的 exports 能用稳定的
      // `./style.css` 子路径导出，消费者不必关心带 hash 的产物名。
      cssFileName: 'style',
    },
    rolldownOptions: {
      external: ['vue'],
      // 显式列出两个入口；防止 buildRelease 的产物被 Vite 隐式当做额外
      // entry，产生孤儿 release chunk。
      input: {
        index: fileURLToPath(new URL('./lib/index.ts', import.meta.url)),
        style: fileURLToPath(new URL('./lib/style.ts', import.meta.url)),
      },
      output: {
        globals: {
          vue: 'Vue',
        },
        minify: true,
        // CSS 固定输出为 dist/style.css：exports 的 ./style.css 需要在安装后
        // 有稳定路径，带 hash 的文件名没法写进导出表。
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? ''
          return name.endsWith('.css')
            ? 'style.css'
            : 'assets/[name]-[hash][extname]'
        },
      },
    },
    assetsInlineLimit: 0,
    minify: true,
    cssMinify: true,
  },
}))
