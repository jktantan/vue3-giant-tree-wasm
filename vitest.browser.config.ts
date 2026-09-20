import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { existsSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const systemChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const executablePath =
  process.env.PLAYWRIGHT_CHROME_EXECUTABLE ??
  (existsSync(systemChrome) ? systemChrome : undefined)

// AssemblyScript's ESM glue exports an awaited destructuring declaration. Node
// accepts it, while Rolldown currently reports every destructured name twice.
const assemblyScriptBindingsWorkaround = {
  name: 'assemblyscript-bindings-workaround',
  transform(code: string, id: string) {
    if (!id.replace(/\\/g, '/').endsWith('/build/release.js')) return null
    const match = /export const \{([\s\S]*?)\} = await/.exec(code)
    if (!match) return null
    return `${code.replace('export const {', 'const {')}\nexport {${match[1]}}\n`
  },
}

export default defineConfig({
  plugins: [vue(), assemblyScriptBindingsWorkaround],
  resolve: {
    alias: {
      '@lib': fileURLToPath(new URL('./lib', import.meta.url)),
      '../build/release': fileURLToPath(
        new URL('./build/release', import.meta.url)
      ),
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/browser/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(
        executablePath ? { launchOptions: { executablePath } } : {}
      ),
      instances: [{ browser: 'chromium' }],
    },
  },
})
