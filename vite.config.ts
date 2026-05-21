import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import loadVersion from 'vite-plugin-package-version'
import { fileURLToPath, URL } from 'node:url'
import assemblyscriptPlugin from './vite-plugin-assemblyscript'

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
            }
          : {}),
      },
    },
  }
})
