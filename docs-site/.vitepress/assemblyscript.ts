import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 站点专用的 AssemblyScript 装载插件。
 *
 * 为什么不能直接复用仓库根的 `vite-plugin-assemblyscript.ts`：
 * 它把 wasm 地址拼成 `document.baseURI + 文件名`，而 `document.baseURI` 是「当前页面 URL」。
 * 站点部署在 `/vue3-giant-tree-wasm/` 子路径、页面又位于 `/guide/…` 这类二级路径，
 * 拼出来的相对地址会指向错误目录 → 404。
 *
 * 这里改为把 wasm 交给 Vite 的 `?url` 资源机制：产出的 URL 自动带上站点 `base`，
 * 因此任意深度的页面都能取到正确地址，且 wasm 作为独立 asset 输出、不被内联。
 */

/** 与 `lib/` 内 `from '../build/release'` 对应的约定说明符。 */
const RELEASE_SPECIFIER = '../build/release'
const VIRTUAL_ID = 'virtual:site-assemblyscript-release'

/** 仓库根：本文件位于 `docs-site/.vitepress/`。 */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

export default function assemblyscriptSite(): Plugin {
  let isDev = false

  return {
    name: 'vitepress-site-assemblyscript',
    enforce: 'pre',

    configResolved(config) {
      isDev = config.command === 'serve'
    },

    resolveId(source) {
      if (source === RELEASE_SPECIFIER) return VIRTUAL_ID
      return null
    },

    load(id) {
      if (id !== VIRTUAL_ID) return null

      const target = isDev ? 'debug' : 'release'
      const jsPath = resolve(repoRoot, `build/${target}.js`)
      const wasmPath = resolve(repoRoot, `build/${target}.wasm`)
      if (!existsSync(jsPath) || !existsSync(wasmPath)) {
        throw new Error(
          `[vitepress-site-assemblyscript] 缺少 ${jsPath} 或 ${wasmPath}；先运行 \`pnpm asbuild\` 生成产物。`
        )
      }

      const source = readFileSync(jsPath, 'utf8')
      const footer = `))(new URL("${target}.wasm", import.meta.url));`
      if (!source.includes(footer)) {
        throw new Error(
          `[vitepress-site-assemblyscript] ${jsPath} 的 loader 结尾与预期不符；重新运行 \`pnpm asbuild\`。`
        )
      }

      const header = `import __wasmUrl from ${JSON.stringify(`${wasmPath}?url`)};\n`
      return header + source.replace(footer, '))(__wasmUrl);')
    },
  }
}
