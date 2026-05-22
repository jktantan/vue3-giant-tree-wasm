import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@lib': fileURLToPath(new URL('./lib', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    server: {
      deps: {
        inline: [/\.vue$/],
        external: [/\/build\/release/],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.{ts,vue}'],
      exclude: ['build/**', 'node_modules/**'],
    },
  },
})
