import { fileURLToPath, URL } from 'node:url'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import loadVersion from 'vite-plugin-package-version'
import assemblyscriptPlugin from './vite-plugin-assemblyscript.ts'

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
      entry: fileURLToPath(new URL('./lib/index.ts', import.meta.url)),
      name: 'vue-giant-tree',
      formats: ['es'],
      fileName: () => 'vue-giant-tree.es.js',
      // 固定 CSS 文件名（默认是包名），让 package.json 的 exports 能用稳定的
      // `./style.css` 子路径导出，消费者不必关心带 hash 的产物名。
      cssFileName: 'style',
    },
    rolldownOptions: {
      external: ['vue'],
      // 显式只把 lib/index.ts 作为入口；防止 buildRelease 的产物被
      // Vite 隐式当做额外 entry，产生孤儿 release chunk。
      input: fileURLToPath(new URL('./lib/index.ts', import.meta.url)),
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
