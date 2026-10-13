import { fileURLToPath, URL } from 'node:url'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import loadVersion from 'vite-plugin-package-version'
import assemblyscriptPlugin from './vite-plugin-assemblyscript.ts'

// https://vitejs.dev/config/
export default defineConfig(() => ({
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
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    assetsInlineLimit: 0,
    minify: true,
    cssMinify: true,
  },
}))
