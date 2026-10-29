import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import loadVersion from 'vite-plugin-package-version'
import { fileURLToPath, URL } from 'node:url'
import assemblyscriptPlugin from './vite-plugin-assemblyscript.ts'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isDev = command === 'serve'

  return {
    plugins: [vue(), vueJsx(), loadVersion(), assemblyscriptPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@lib': fileURLToPath(new URL('./lib', import.meta.url)),
        '@assemblybuild': fileURLToPath(new URL('./build', import.meta.url)),
        ...(isDev
          ? {
              '../build/release': fileURLToPath(
                new URL('./build/debug', import.meta.url)
              ),
              // 分组后 lib/components、lib/core 里的引用比 lib 根深一层，
              // alias 是前缀匹配，必须单独登记，否则 dev 下解析到不存在的路径。
              '../../build/release': fileURLToPath(
                new URL('./build/debug', import.meta.url)
              ),
            }
          : {}),
      },
    },
    worker: {
      format: 'es',
    },
  }
})
