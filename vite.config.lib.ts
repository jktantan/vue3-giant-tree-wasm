import { fileURLToPath, URL } from 'node:url'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import loadVersion from 'vite-plugin-package-version'

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [
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
  oxc: {
    transform: {
      target: 'es2022',
    },
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./lib/index.ts', import.meta.url)),
      name: 'vue-giant-tree',
      formats: ['es'],
      fileName: () => 'vue-giant-tree.es.js',
    },
    rolldownOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue',
        },
        minify: true,
      },
    },
    minify: true,
    cssMinify: true,
  },
}))
