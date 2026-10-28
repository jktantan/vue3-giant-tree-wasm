/**
 * 发布前预检：不发布到 npmjs，也能验证「消费者从 npm 装这个包能不能用」。
 *
 * 为什么可以不用发布：`npm publish` 本质就是 `npm pack` + 上传，两者打出的 tarball
 * 逐字节相同。所以
 *     npm pack → 仓库外的独立消费者项目 npm install <tarball> → 用自己的 Vite 构建
 *     → 真浏览器打开
 * 就是「消费者装包」这条路径的等价物（唯一要手工补的是 prepublishOnly 里的 lib:build，
 * 因为 `npm pack` 不会触发 prepublishOnly）。
 *
 * 断言分两级，因为它们对消费者的后果不同：
 *   1. 致命（fatal）——页面直接打不开：消费者产物里有悬空 import / 缺失资源 /
 *      未替换的占位符，或 tarball 缺了 package.json 声称的文件。
 *   2. Worker（worker）——页面能开，但 Worker 模式静默失效并回退主线程：worker 自己的
 *      chunk 引用了消费者产物里不存在的文件（典型是 rolldown 的共享 runtime chunk）。
 *      这一级只有真浏览器里看得出来，静态看主入口是"自包含"的。
 *
 * 用法：
 *   node scripts/verify-npm-consumer.mjs              # 全量（含浏览器）
 *   node scripts/verify-npm-consumer.mjs --no-browser # 只做静态断言，跳过浏览器
 *   node scripts/verify-npm-consumer.mjs --clean      # 删掉 .verify-consumer 缓存后退出
 *
 * 消费者项目固定落在 .verify-consumer/（已 gitignore）：node_modules 会留着复用，
 * 只有 tarball 内容变了才重装本包，所以第二次之后很快。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const IS_WINDOWS = process.platform === 'win32'
const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const flags = new Set(process.argv.slice(2))
const skipBrowser = flags.has('--no-browser')
const shouldClean = flags.has('--clean')

const TAG = '[verify-consumer]'
const red = text => `\x1b[31m${text}\x1b[0m`
const green = text => `\x1b[32m${text}\x1b[0m`
const yellow = text => `\x1b[33m${text}\x1b[0m`

const workDir = join(repoRoot, '.verify-consumer')
const pkgDir = join(workDir, 'pkg')
const appDir = join(workDir, 'app')

const fatal = []
const workerProblems = []
const notes = []

/**
 * Windows 上的两个坑要同时躲开：
 *   - npm 实际是 npm.cmd，execFile 直接跑会被 Node 拒（CVE-2024-27980 之后），必须经 shell；
 *   - node.exe 这种绝对路径的可执行文件经 shell 反而会被路径里的空格拆坏
 *     （`D:\Program Files\nodejs\node.exe` 会被拆成命令 `D:\Program`）。
 */
const run = (command, commandArgs, options = {}) =>
  spawnSync(command, commandArgs, {
    encoding: 'utf8',
    shell: IS_WINDOWS && !command.endsWith('.exe'),
    stdio: 'pipe',
    ...options,
  })

/**
 * npm 优先走随 node 分发的 JS 入口（`node npm-cli.js`）：既绕开 `.cmd` 必须经 shell 的限制，
 * 也避开 `shell: true` 传参数时的 DEP0190 告警。找不到才退回 shell 调 npm。
 */
const npmCli = [
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  join(
    dirname(process.execPath),
    'lib',
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js'
  ),
].find(existsSync)

const runNpm = (npmArgs, cwd) =>
  npmCli
    ? run(process.execPath, [npmCli, ...npmArgs], { cwd })
    : run('npm', npmArgs, { cwd })

function walkFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else out.push(full)
  }
  return out
}

const exitWithReport = () => {
  if (notes.length > 0) {
    console.log(`\n${yellow(TAG)} 提示：`)
    for (const note of notes) console.log(`  - ${note}`)
  }
  if (workerProblems.length > 0) {
    console.error(
      `\n${yellow(TAG)} Worker 模式在消费者项目里不可用（页面会静默回退主线程，性能收益拿不到）：`
    )
    for (const problem of workerProblems) console.error(`  - ${problem}`)
  }
  if (fatal.length > 0) {
    console.error(`\n${red(TAG)} 消费者运行时会直接失败：`)
    for (const problem of fatal) console.error(`  - ${problem}`)
  }
  if (fatal.length > 0 || workerProblems.length > 0) {
    console.error(
      `\n${red(`${TAG} FAILED`)} —— 这个状态不能发布。消费者项目留在 ${workDir}，可进去手工排查。\n`
    )
    process.exit(1)
  }
  console.log(
    `\n${green(`${TAG} OK`)} —— tarball 安装进独立消费者项目后：产物自包含、页面可渲染${
      skipBrowser ? '（本次跳过了浏览器验证）' : '、Worker 模式 boot 成功'
    }。\n`
  )
  process.exit(0)
}

if (shouldClean) {
  rmSync(workDir, { recursive: true, force: true })
  console.log(`${TAG} 已删除 ${workDir}`)
  process.exit(0)
}

// ── 0. 前置：dist/ 必须是最新构建 ──────────────────────────────────────────────
const pkgJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const pkgName = pkgJson.name
const distEntry = join(repoRoot, 'dist', 'vue-giant-tree.es.js')

if (!existsSync(distEntry)) {
  console.error(
    `\n${red(TAG)} 找不到 ${distEntry}。先跑 \`pnpm lib:build\` 再执行本脚本。\n`
  )
  process.exit(1)
}

const sourceFiles = [
  ...walkFiles(join(repoRoot, 'lib')),
  join(repoRoot, 'vite-plugin-assemblyscript.ts'),
  join(repoRoot, 'vite.config.lib.ts'),
].filter(existsSync)
const newestSourceMs = Math.max(
  ...sourceFiles.map(file => statSync(file).mtimeMs)
)
if (statSync(distEntry).mtimeMs < newestSourceMs) {
  notes.push(
    'dist/ 比 lib/ 里的源码旧，正在验证的是过期产物；先跑 `pnpm lib:build` 再重跑本脚本。'
  )
}

// ── 1. npm pack：产物与 npm publish 上传的完全一致 ─────────────────────────────
rmSync(pkgDir, { recursive: true, force: true })
mkdirSync(pkgDir, { recursive: true })

const packResult = runNpm(
  ['pack', '--json', '--pack-destination', pkgDir],
  repoRoot
)
if (packResult.status !== 0) {
  console.error(
    `\n${red(TAG)} npm pack 失败：\n${packResult.stdout ?? ''}${packResult.stderr ?? ''}\n`
  )
  process.exit(1)
}

const packed = JSON.parse(packResult.stdout.trim())[0]
const tarball = join(pkgDir, packed.filename)
const packedPaths = new Set(
  packed.files.map(file => file.path.replaceAll('\\', '/'))
)

console.log(
  `${TAG} npm pack → ${packed.filename}（${(packed.size / 1024).toFixed(1)} KB，${packed.files.length} 个文件）`
)

// 1a. tarball 必须含有 package.json 里对外声称的每个入口文件
const declaredSpecs = new Set()
for (const value of Object.values(pkgJson.exports ?? {})) {
  if (typeof value === 'string') declaredSpecs.add(value)
  else {
    for (const spec of Object.values(value ?? {})) {
      if (typeof spec === 'string') declaredSpecs.add(spec)
    }
  }
}
for (const field of ['main', 'module', 'types']) {
  if (typeof pkgJson[field] === 'string') declaredSpecs.add(pkgJson[field])
}
for (const spec of declaredSpecs) {
  if (!spec.startsWith('./')) continue
  const relative = spec.slice(2)
  // 通配导出（例如 "./scss/*": "./scss/*"）不能按单个文件检查，
  // 只要求它指向的目录在 tarball 里真实存在。
  if (relative.includes('*')) {
    const prefix = relative.split('*')[0].replace(/\/$/, '')
    const hasMatch = [...packedPaths].some(
      path => path === prefix || path.startsWith(`${prefix}/`)
    )
    if (!hasMatch) {
      fatal.push(
        `tarball 里没有 ${spec} 能匹配到的文件（检查 files / exports 配置）`
      )
    }
    continue
  }
  if (!packedPaths.has(relative)) {
    fatal.push(
      `tarball 里没有 package.json 声称的文件 ${spec}（检查 files / exports 配置）`
    )
  }
}

// ── 2. 仓库外的独立消费者项目（真装依赖，不借仓库的 node_modules）──────────────
mkdirSync(join(appDir, 'src'), { recursive: true })

writeFileSync(
  join(appDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'verify-consumer-app',
      private: true,
      type: 'module',
      dependencies: { [pkgName]: `file:../pkg/${packed.filename}` },
      devDependencies: {
        vite: pkgJson.devDependencies.vite,
        '@vitejs/plugin-vue': pkgJson.devDependencies['@vitejs/plugin-vue'],
        vue: pkgJson.devDependencies.vue,
      },
    },
    null,
    2
  )}\n`
)

writeFileSync(
  join(appDir, 'vite.config.mjs'),
  `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 故意「零配置」：消费者按文档装完包直接构建，不该需要任何额外设置。
export default defineConfig({ plugins: [vue()] })
`
)

writeFileSync(
  join(appDir, 'index.html'),
  `<!doctype html>
<html>
  <body>
    <div id="app-worker"></div>
    <div id="app-main"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`
)

writeFileSync(
  join(appDir, 'src', 'main.js'),
  `import { createApp, h } from 'vue'
import { VueGiantTree } from '${pkgName}'
import '${pkgName}/style.css'

// 探针：库内部创建的 Worker（可能是 blob: / 独立 chunk）抓出来，判断它能不能 boot。
// Worker 起不来时库会静默回退主线程，只看页面是看不出来的。
const NativeWorker = window.Worker
window.__probe = { workers: [], errors: [], messages: [] }
window.Worker = class ProbedWorker extends NativeWorker {
  constructor(...args) {
    super(...args)
    window.__probe.workers.push({
      url: typeof args[0] === 'string' ? args[0].slice(0, 120) : String(args[0]),
      type: args[1]?.type,
    })
    this.addEventListener('error', event => {
      window.__probe.errors.push({
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
      })
    })
    this.addEventListener('message', event => {
      window.__probe.messages.push(event.data?.type ?? typeof event.data)
    })
  }
}

// 两条路径都要验：workerMode 是消费者可选的能力，默认 false 走主线程。
// 两个实例各拿一份数据，免得共享同一个数组互相干扰。
const makeTree = () => [
  { id: '1', name: 'root', parentId: 'root' },
  { id: '2', name: 'child-a', parentId: '1' },
  { id: '3', name: 'child-b', parentId: '1' },
]
const mount = (selector, workerMode) =>
  createApp({
    setup() {
      const tree = makeTree()
      return () => h(VueGiantTree, { tree, root: 'root', workerMode })
    },
  }).mount(selector)

mount('#app-worker', true)
mount('#app-main', false)
`
)

// 2a. 安装：node_modules 留着复用，只有 tarball 内容变了才动它。
// 只删本包 + lock（而不是整个 node_modules）：整删重装要两分钟，且装到一半被打断时
// npm 会把 rolldown 的 native binding 留成半成品（optional deps 的已知问题）。
const tarballHash = createHash('sha256')
  .update(readFileSync(tarball))
  .digest('hex')
const hashFile = join(appDir, '.pkg-hash')
const previousHash = existsSync(hashFile)
  ? readFileSync(hashFile, 'utf8').trim()
  : ''
const hasModules = existsSync(join(appDir, 'node_modules'))
const needsInstall = !hasModules || previousHash !== tarballHash

if (needsInstall && hasModules) {
  rmSync(join(appDir, 'node_modules', pkgName), {
    recursive: true,
    force: true,
  })
  rmSync(join(appDir, 'package-lock.json'), { force: true })
}

if (needsInstall) {
  console.log(`${TAG} 安装消费者依赖（首次会慢，之后走缓存）…`)
  const installResult = runNpm(['install', '--no-audit', '--no-fund'], appDir)
  if (installResult.status !== 0) {
    console.error(
      `\n${red(TAG)} 消费者 npm install 失败：\n${installResult.stdout ?? ''}${installResult.stderr ?? ''}\n`
    )
    process.exit(1)
  }
  writeFileSync(hashFile, tarballHash)
}

// ── 3. 用消费者自己的 Vite 构建 ───────────────────────────────────────────────
const viteBin = join(appDir, 'node_modules', 'vite', 'bin', 'vite.js')
if (!existsSync(viteBin)) {
  console.error(
    `\n${red(TAG)} 消费者项目里没有 vite（${viteBin}），npm install 不完整。\n`
  )
  process.exit(1)
}

const outDir = join(appDir, 'dist')
rmSync(outDir, { recursive: true, force: true })

const buildResult = run(process.execPath, [viteBin, 'build', '--base', './'], {
  cwd: appDir,
})
if (buildResult.status !== 0) {
  console.error(
    `\n${red(TAG)} 消费者构建失败：\n${buildResult.stdout ?? ''}${buildResult.stderr ?? ''}\n`
  )
  process.exit(1)
}

console.log(`${TAG} 消费者构建通过 → ${walkFiles(outDir).length} 个产物文件`)

// ── 4. 静态断言：消费者产物必须自包含 ─────────────────────────────────────────
const jsFiles = walkFiles(outDir).filter(file => file.endsWith('.js'))
const codeCache = new Map(
  jsFiles.map(file => [file, readFileSync(file, 'utf8')])
)

// 哪些 chunk 是「Worker 自己的」：主 chunk 里 new Worker(new URL(...)) 引用到的文件。
// 它们悬空只影响 worker、不影响页面，所以单列一级。
const workerBasenames = new Set()
for (const code of codeCache.values()) {
  for (const match of code.matchAll(
    /new URL\(\s*(?:`|"|')([^"'`]*worker[^"'`]*)(?:`|"|')\s*,/gi
  )) {
    workerBasenames.add(basename(match[1]))
  }
}
const isWorkerOwned = file => workerBasenames.has(basename(file))
/** worker chunk 里悬空的 import 目标名：浏览器里它们会变成 404 请求，运行时归类要用。 */
const workerMissingBasenames = new Set()

for (const file of jsFiles) {
  const code = codeCache.get(file)
  const relativeFile = file.slice(outDir.length + 1)
  const bucket = isWorkerOwned(file) ? workerProblems : fatal

  // 4a. 静态 import 的相对路径必须落到真实文件
  for (const match of code.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) {
    if (existsSync(resolve(dirname(file), match[1]))) continue
    bucket.push(`${relativeFile} → 缺少被 import 的文件 ${match[1]}`)
    if (bucket === workerProblems)
      workerMissingBasenames.add(basename(match[1]))
  }

  // 4b. new URL(<相对路径>, import.meta.url) 引用的资源必须存在
  for (const match of code.matchAll(
    /new URL\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:``\s*\+\s*)?import\.meta\.url/g
  )) {
    const spec = match[1]
    if (spec.startsWith('data:') || /^[a-z][a-z0-9+.-]*:/i.test(spec)) continue
    const target = resolve(dirname(file), spec)
    if (existsSync(target)) continue
    const belongsToWorker =
      isWorkerOwned(target) || basename(spec).includes('worker')
    ;(belongsToWorker ? workerProblems : fatal).push(
      `${relativeFile} → 缺少 new URL 引用的资源 ${spec}`
    )
  }

  // 4c. AS 插件的占位符必须已经被替换掉
  if (code.includes('__VITE_ASM_WASM_URL__')) {
    bucket.push(
      `${relativeFile} → 占位符 __VITE_ASM_WASM_URL__ 没有被替换成实际 wasm 地址`
    )
  }
}

// ── 5. 运行时断言：真浏览器里的页面与 Worker ──────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
}

const startStaticServer = root =>
  new Promise((resolvePromise, rejectPromise) => {
    const rootAbs = resolve(root)
    const server = createServer((request, response) => {
      const pathname = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname
      )
      let target = resolve(rootAbs, `.${pathname}`)
      if (!target.startsWith(rootAbs)) {
        response.writeHead(403).end('forbidden')
        return
      }
      if (existsSync(target) && statSync(target).isDirectory())
        target = join(target, 'index.html')
      if (!existsSync(target)) {
        response.writeHead(404).end('not found')
        return
      }
      response.writeHead(200, {
        'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      })
      response.end(readFileSync(target))
    })
    server.on('error', rejectPromise)
    server.listen(0, '127.0.0.1', () => resolvePromise(server))
  })

/**
 * 起一个 chromium。仓库里 playwright 要的 revision 可能与本机已下载的不一致
 * （报 `chromium_headless_shell-1243` 不存在、机器上只有 `-1208`），这时退回到扫描
 * ms-playwright 下已存在的完整 chromium。缺浏览器不该让发布预检失败：上面的静态断言
 * 已经能把「装包后能不能用」的关键问题挡住，这里只影响能否额外验证 worker 运行时。
 */
const playwrightBrowserRoots = () =>
  [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    IS_WINDOWS && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'ms-playwright')
      : undefined,
    !IS_WINDOWS ? join(homedir(), '.cache', 'ms-playwright') : undefined,
  ].filter(Boolean)

const localChromiumExecutables = () => {
  const layouts =
    {
      win32: [
        ['chrome-win64', 'chrome.exe'],
        ['chrome-win', 'chrome.exe'],
      ],
      darwin: [['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']],
      linux: [
        ['chrome-linux64', 'chrome'],
        ['chrome-linux', 'chrome'],
      ],
    }[process.platform] ?? []
  const found = []
  for (const root of playwrightBrowserRoots()) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith('chromium') || entry.includes('headless')) continue
      for (const layout of layouts) found.push(join(root, entry, ...layout))
    }
  }
  return found
}

const launchChromium = async chromium => {
  try {
    return { browser: await chromium.launch({ headless: true }) }
  } catch (error) {
    const executablePath = localChromiumExecutables().find(existsSync)
    if (executablePath) {
      try {
        return {
          browser: await chromium.launch({ headless: true, executablePath }),
        }
      } catch {
        /* 落到下面的 error */
      }
    }
    return { error }
  }
}

if (!skipBrowser) {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    notes.push(
      '装不了 playwright，已跳过浏览器验证；必要时自行 `pnpm add -D playwright`。'
    )
  }

  const launched = chromium ? await launchChromium(chromium) : undefined

  if (launched?.error) {
    notes.push(
      `playwright 起不了浏览器，已跳过运行时验证（${String(launched.error.message).split('\n')[0]}）；` +
        '`npx playwright install chromium` 之后重跑本脚本。'
    )
  }

  if (launched?.browser) {
    const browser = launched.browser
    const server = await startStaticServer(outDir)
    const port = server.address().port
    try {
      const page = await browser.newPage()
      const pageErrors = []
      const consoleErrors = []
      const failedRequests = []

      page.on('pageerror', error => pageErrors.push(String(error)))
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      page.on('requestfailed', request =>
        failedRequests.push({
          url: request.url(),
          detail: request.failure()?.errorText ?? '',
        })
      )
      page.on('response', response => {
        if (response.status() >= 400) {
          failedRequests.push({
            url: response.url(),
            detail: `HTTP ${response.status()}`,
          })
        }
      })

      await page.goto(`http://127.0.0.1:${port}/index.html`, {
        waitUntil: 'load',
      })
      await page
        .waitForFunction(
          () => window.__probe && window.__probe.messages.length > 0,
          null,
          {
            timeout: 6000,
          }
        )
        .catch(() => {})

      const probe = await page.evaluate(() => window.__probe ?? null)
      const mounted = await page.evaluate(() => ({
        worker: Boolean(document.querySelector('#app-worker .giant-tree')),
        main: Boolean(document.querySelector('#app-main .giant-tree')),
      }))

      notes.push(
        `页面渲染：workerMode=true ${mounted.worker ? '✓' : '✗'}，workerMode=false ${mounted.main ? '✓' : '✗'}`
      )

      if (probe) {
        notes.push(
          `浏览器探针：Worker 实例 ${probe.workers.length} 个，URL = ${
            probe.workers[0]?.url ?? '(未创建)'
          }，收到的消息 = ${JSON.stringify(probe.messages)}`
        )
      }

      for (const error of pageErrors) fatal.push(`页面抛错：${error}`)
      if (!mounted.worker) fatal.push('workerMode: true 的实例没有渲染出树')
      if (!mounted.main)
        fatal.push('workerMode: false 的实例没有渲染出树（主线程路径）')
      // 失败的资源请求要分清是谁引起的：worker 自己的 chunk / 由它引发的那条 404，
      // 页面照样能渲染（回退主线程），不该报成"消费者运行时会直接失败"。
      for (const { url, detail } of failedRequests) {
        const failedBase = basename(new URL(url).pathname)
        const belongsToWorker =
          workerBasenames.has(failedBase) ||
          workerMissingBasenames.has(failedBase) ||
          failedBase.includes('worker')
        ;(belongsToWorker ? workerProblems : fatal).push(
          `资源请求失败：${url} ${detail}`
        )
      }

      if (!probe || probe.workers.length === 0) {
        workerProblems.push('workerMode 为 true，但库没有创建 Worker')
      } else {
        // 只有 workerMode: true 的那个实例该建 Worker；多出来说明开关没生效。
        if (probe.workers.length > 1) {
          workerProblems.push(
            `workerMode: false 的实例也创建了 Worker（共 ${probe.workers.length} 个），模式开关没生效`
          )
        }
        if (probe.errors.length > 0) {
          workerProblems.push(
            `Worker 加载/求值失败：onerror 触发，但 event 里没有可用信息（${JSON.stringify(probe.errors[0])}）`
          )
        }
        if (!probe.messages.includes('ready')) {
          workerProblems.push(
            `Worker 没有发出 ready（收到的消息：${JSON.stringify(probe.messages)}）`
          )
        }
      }
      for (const error of consoleErrors) {
        if (/worker/i.test(error)) workerProblems.push(`console 报错：${error}`)
      }
    } finally {
      await browser.close()
      server.close()
    }
  }
}

exitWithReport()
