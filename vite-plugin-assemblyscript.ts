import { execSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

interface AssemblyScriptPluginOptions {
  /** assembly 源码目录（相对项目根） */
  srcDir?: string
  /** asconfig.json 路径（相对项目根） */
  configFile?: string
}

/** 缓存跳过：编译产物比源文件新就不重跑 */
function isCompileCacheFresh(
  projectRoot: string,
  srcDir: string,
  wasmPath: string,
  jsPath: string
): boolean {
  if (!existsSync(wasmPath) || !existsSync(jsPath)) return false
  const wasmMtime = statSync(wasmPath).mtimeMs
  const jsMtime = statSync(jsPath).mtimeMs
  // 任一产物比源文件旧 -> 缓存失效
  const entry = resolve(projectRoot, srcDir, 'index.ts')
  if (!existsSync(entry)) return false
  const entryMtime = statSync(entry).mtimeMs
  return entryMtime <= wasmMtime && entryMtime <= jsMtime
}

export default function assemblyscriptPlugin(
  options: AssemblyScriptPluginOptions = {}
): Plugin {
  const { srcDir = 'assembly', configFile = 'asconfig.json' } = options
  let projectRoot = ''
  let isDev = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function compile(target: 'debug' | 'release'): boolean {
    // 缓存跳过：编译产物比源文件新就不重跑 asc。
    // 比对 src/index.ts 与 build/release.{js,wasm} 的 mtime。
    const wasmPath = resolve(projectRoot, 'build/release.wasm')
    const jsPath = resolve(projectRoot, 'build/release.js')
    if (
      target === 'release' &&
      existsSync(wasmPath) &&
      existsSync(jsPath) &&
      isCompileCacheFresh(projectRoot, srcDir, wasmPath, jsPath)
    ) {
      console.log(`\x1b[36m[AS]\x1b[0m Cached (${target})`)
      return true
    }
    const cmd = `npx asc ${srcDir}/index.ts --config ${configFile} --target ${target}`
    try {
      execSync(cmd, { cwd: projectRoot, stdio: 'pipe' })
      console.log(`\x1b[36m[AS]\x1b[0m Compiled (${target})`)
      return true
    } catch (e: unknown) {
      const msg =
        e instanceof Error && 'stderr' in e
          ? (e as { stderr: Buffer }).stderr?.toString()
          : String(e)
      console.error(`\x1b[31m[AS]\x1b[0m Compile failed:\n${msg}`)
      return false
    }
  }

  return {
    name: 'vite-plugin-assemblyscript',
    enforce: 'pre',

    configResolved(config) {
      projectRoot = config.root
      isDev = config.command === 'serve'
      if (isDev) {
        compile('debug')
      }
    },

    configureServer(server: ViteDevServer) {
      const watchDir = resolve(projectRoot, srcDir)
      server.watcher.add(`${watchDir}/**/*.ts`)

      server.watcher.on('change', (file: string) => {
        if (!file.startsWith(watchDir) || !file.endsWith('.ts')) return

        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          console.log(
            `\x1b[36m[AS]\x1b[0m File changed: ${file.replace(projectRoot + '/', '')}`
          )
          if (compile('debug')) {
            server.ws.send({ type: 'full-reload' })
          }
        }, 500)
      })
    },

    buildStart() {
      if (!isDev) {
        compile('release')
      }
    },

    // 接管 `'../build/release'` 模块：返回 virtual id，让后续 load 完全控制产物。
    // lib/ 下的代码用 `from '../build/release'` 引用 AS 编译产物，
    // 我们在这里把它劫持掉，避免 Vite 把整个 loader 当 entry 二次 bundle 时
    // 把 wasm 自动 inline 进去。
    //
    // 同时在磁盘上拦截 `build/release.js` / `build/release.wasm`：
    // 任何 plugin（如 Vite 内部 wasm 处理插件）尝试独立处理它们时，
    // 也都重定向到同一个 virtual 模块，避免产生孤儿 entry chunk。
    resolveId(source, importer) {
      // TypeScript 类型收集阶段：`from '../build/release'` 会被 dts 工具链
      // 自动改写为 `from '../build/release.d.ts'`；拦截后交给 load 返回
      // build/release.d.ts 的原文内容，让 dts 能正确产出 CheckType 等枚举类型。
      if (
        source === '../build/release.d.ts' ||
        source.endsWith('/build/release.d.ts') ||
        source.endsWith('\\build/release.d.ts')
      ) {
        return VIRTUAL_RELEASE_DTS_ID
      }
      if (
        source === '../build/release' ||
        source === '../build/release.wasm'
      ) {
        return VIRTUAL_RELEASE_ID
      }
      // build 模式下才拦截磁盘绝对路径；dev 模式下让 Vite 正常提供源文件。
      if (!isDev) {
        const absJs = resolve(projectRoot, 'build/release.js')
        const absWasm = resolve(projectRoot, 'build/release.wasm')
        if (source === absJs || source === absWasm) {
          return VIRTUAL_RELEASE_ID
        }
        // 通过 importer 反推出来的相对路径（兜底）。
        if (
          importer &&
          (source.endsWith('/build/release.js') ||
            source.endsWith('\\build/release.js') ||
            source.endsWith('/build/release.wasm') ||
            source.endsWith('\\build/release.wasm'))
        ) {
          return VIRTUAL_RELEASE_ID
        }
      }
      // 兼容 `${prefix}/build/release` 这种已经被解析的相对路径形式。
      void importer
      return null
    },

    // 读 AS 编译产物的 loader 源码，原样保留（导出、IIFE、instantiate 等），
    // 只把末尾 `)(new URL("release.wasm", import.meta.url));` 这一行替换为对
    // 显式 emit 的 release.wasm asset URL 的引用，让 wasm 单独 emit 不再内联。
    //
    // 同时为 TypeScript 类型收集（`vite-plugin-dts`）返回一份同源 `.d.ts`：
    // 它调用 readFile(build/release.d.ts) 原样返回，让 dts 能正确产出类型。
    load(id) {
      if (id === VIRTUAL_RELEASE_DTS_ID) {
        const dtsPath = resolve(projectRoot, 'build/release.d.ts')
        if (!existsSync(dtsPath)) {
          throw new Error(
            `[vite-plugin-assemblyscript] missing ${dtsPath}; run \`asc --target release\`.`
          )
        }
        return readFileSync(dtsPath, 'utf8')
      }
      if (id !== VIRTUAL_RELEASE_ID) return null
      const srcPath = resolve(projectRoot, 'build/release.js')
      if (!existsSync(srcPath)) {
        throw new Error(
          `[vite-plugin-assemblyscript] missing ${srcPath}; run \`asc --target release\`.`
        )
      }
      const source = readFileSync(srcPath, 'utf8')
      // 精确匹配 AS loader 末尾那行 IIFE 调用：
      //   ))(new URL("release.wasm", import.meta.url));
      // 把它替换成对下方 `__releaseWasmUrl` 的引用，asset 通过 generateBundle 注入。
      if (
        !source.includes(
          '))(new URL("release.wasm", import.meta.url));'
        )
      ) {
        throw new Error(
          `[vite-plugin-assemblyscript] unexpected loader footer; please regenerate build/release.js`
        )
      }
      // 在模块顶部声明一个变量持有 wasm URL；
      // 用 `new URL(相对路径, import.meta.url)` 让运行时按【当前 chunk】的真实
      // 位置解析地址：import.meta.url 在 worker 里同样有效，且下游打包器
      // （Vite/webpack）能识别这种静态形式并把 wasm 一起带走。
      // 注意：占位符必须是【带引号的字符串字面量】，才能被下面 generateBundle 的
      // /"__VITE_ASM_WASM_URL__"/g 替换为最终 asset 文件名。写成裸标识符会让替换
      // 静默落空，产物里留下未定义变量，下游一 import 就 ReferenceError。
      const header =
        'const __releaseWasmUrl = new URL("__VITE_ASM_WASM_URL__", import.meta.url).href;\n'
      const replaced = source.replace(
        '))(new URL("release.wasm", import.meta.url));',
        '))(__releaseWasmUrl);'
      )
      return header + replaced
    },

    // generateBundle 时机把 loader 里的占位符替换成内联的 wasm data URL。
    //
    // 为什么内联、而不是 emit 成独立文件：独立文件要求「引用它的代码」与「wasm 文件」
    // 的相对位置在【使用者自己的打包器】里依然成立。实测 Vite 不会处理 worker 内来自
    // node_modules 的 `new URL(asset, import.meta.url)`（原样保留），worker 于是去取一个
    // 不存在的文件名而 404，再静默回退到主线程。data URL 是绝对地址、不做任何路径推导，
    // 因此任何打包器、零配置都能用 —— 代价是包体积（gzip 约 +25KB）。
    generateBundle(_options, bundle_) {
      const wasmAbsPath = resolve(projectRoot, 'build/release.wasm')
      if (!existsSync(wasmAbsPath)) {
        console.warn(
          `\x1b[33m[AS]\x1b[0m release.wasm not found at ${wasmAbsPath}; wasm will not be inlined.`
        )
        return
      }
      const wasmBytes = readFileSync(wasmAbsPath)
      const wasmDataUrl = `data:application/wasm;base64,${wasmBytes.toString('base64')}`
      for (const fileName of Object.keys(bundle_)) {
        const chunk = bundle_[fileName]
        if (chunk.type !== 'chunk') continue
        if (!chunk.code || !chunk.code.includes('__VITE_ASM_WASM_URL__')) continue
        // 产物里该字面量的形态可能是 "…" / '…' / `…`（rolldown 常把普通字符串
        // 输出成模板字符串），这里同时容忍三种引号，避免再次静默漏替换。
        chunk.code = chunk.code.replace(
          /["'`]?__VITE_ASM_WASM_URL__["'`]?/g,
          JSON.stringify(wasmDataUrl)
        )
        if (chunk.code.includes('__VITE_ASM_WASM_URL__')) {
          this.warn(
            `[vite-plugin-assemblyscript] 占位符未能完全替换（${fileName}）：` +
              `load() 的 header 必须与这里 /"__VITE_ASM_WASM_URL__"/g 的匹配形式一致。`
          )
        }
      }
    },

    // writeBundle 在产物写入磁盘之后调用。
    // 1) 把 AssemblyScript 编译器直接生成的 release.d.ts 复制到 dist/types/
    //    和 dist/lib/ 下，重命名为 wasm.d.ts（对外语义化），下游 consumer
    //    看到的是 "wasm runtime 的 TypeScript 绑定" 而不是底层产物名；
    // 2) closeBundle 阶段再重写产物 .d.ts 里的 import 路径为 './wasm'。
    writeBundle(_options) {
      const dtsSrc = resolve(projectRoot, 'build/release.d.ts')
      if (!existsSync(dtsSrc)) {
        console.warn(
          `\x1b[33m[AS]\x1b[0m release.d.ts not found at ${dtsSrc}; skipping d.ts copy.`
        )
        return
      }
      const outDir = resolve(projectRoot, 'dist')
      const targets = [
        resolve(outDir, 'types/wasm.d.ts'),
        resolve(outDir, 'lib/wasm.d.ts'),
      ]
      for (const target of targets) {
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(dtsSrc, target)
        console.log(`\x1b[36m[AS]\x1b[0m Emitted ${target}`)
      }
    },

    // closeBundle 在 Vite 写完所有产物到磁盘之后调用，
    // 此时 `dist/lib/` 已经存在；用它来重写产物 .d.ts 里的 import 路径，
    // 改为 `from './wasm'`，让下游 consumer 在 node_modules 里能解析到
    // CheckType / SelectType / DisplayType / CheckedOutputMode 等枚举。
    closeBundle() {
      const outDir = resolve(projectRoot, 'dist')
      const libDir = resolve(outDir, 'lib')
      if (!existsSync(libDir)) return
      let rewroteCount = 0
      for (const fileName of readdirSync(libDir)) {
        if (!fileName.endsWith('.d.ts')) continue
        const p = resolve(libDir, fileName)
        const content = readFileSync(p, 'utf8')
        if (!content.includes("'../build/release'")) continue
        const rewritten = content.replace(
          /from\s+['"]\.\.\/build\/release['"]/g,
          "from './wasm'"
        )
        writeFileSync(p, rewritten, 'utf8')
        rewroteCount++
        console.log(`\x1b[36m[AS]\x1b[0m Rewrote import in ${p}`)
      }
      if (rewroteCount === 0) {
        console.warn(
          `\x1b[33m[AS]\x1b[0m closeBundle: no ../build/release import found in dist/lib/*.d.ts`
        )
      }
    },
  }
}

const VIRTUAL_RELEASE_ID = 'virtual:assemblyscript-release'
const VIRTUAL_RELEASE_DTS_ID = 'virtual:assemblyscript-wasm.d.ts'
