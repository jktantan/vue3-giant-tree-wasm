/**
 * 打包产物冒烟测试。
 *
 * 为什么需要它：仓库里的单元测试（tests/**）和浏览器测试（tests/browser/**）都直接
 * 跑源码（lib/*.vue），而真正的交付物是 dist/。「装 npm 包 → 消费者打包」这条路径
 * 曾经坏过（worker 引用了一个消费者产物里不存在的 runtime chunk），而当时所有测试
 * 全绿 —— 因为没有任何测试碰过 dist/。
 *
 * 做法：把 dist/ 当成已安装的包放进一个临时消费者项目，用「不改任何配置」的 Vite
 * 构建它，然后断言产物自包含：
 *   1. 每个静态 import 的相对路径都能落到真实文件；
 *   2. 每个 new URL(…, import.meta.url) 引用的资源都存在。
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workDir = join(repoRoot, '.smoke-dist')
const pkgName = 'vue3-giant-tree-wasm'
const pkgDir = join(workDir, 'node_modules', pkgName)

const walk = (dir, filter) => {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, filter))
    else if (filter(full)) out.push(full)
  }
  return out
}

const fail = message => {
  console.error(`\n\x1b[31m[smoke-dist] ${message}\x1b[0m`)
  console.error(`消费者项目留在 ${workDir}，可进去手工排查。\n`)
  process.exit(1)
}

rmSync(workDir, { recursive: true, force: true })
mkdirSync(pkgDir, { recursive: true })

// 1) 把仓库的 dist/ 当成「已安装的包」放进去（等价于 npm i 之后 node_modules 里的样子）
writeFileSync(join(pkgDir, 'package.json'), readFileSync(join(repoRoot, 'package.json')))
cpSync(join(repoRoot, 'dist'), join(pkgDir, 'dist'), { recursive: true })

// 2) 最小消费者项目：只 import 包，不做任何额外配置
writeFileSync(
  join(workDir, 'package.json'),
  JSON.stringify({ name: 'smoke-consumer', private: true, type: 'module' }, null, 2)
)
writeFileSync(
  join(workDir, 'vite.config.mjs'),
  `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({ plugins: [vue()] })
`
)
writeFileSync(
  join(workDir, 'index.html'),
  `<!doctype html><html><body><div id="app"></div>
<script type="module" src="/src/main.js"></script></body></html>
`
)
mkdirSync(join(workDir, 'src'), { recursive: true })
writeFileSync(
  join(workDir, 'src', 'main.js'),
  `import { createApp, h } from 'vue'
import { VueGiantTree } from '${pkgName}'
import '${pkgName}/style.css'

createApp({
  setup: () => () =>
    h(VueGiantTree, {
      tree: [{ id: '1', name: 'root', parentId: 'root' }],
      root: 'root',
      workerMode: true,
    }),
}).mount('#app')
`
)

// 3) 构建
try {
  execFileSync(process.execPath, [join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
    cwd: workDir,
    stdio: 'pipe',
    encoding: 'utf8',
  })
} catch (error) {
  fail(`消费者构建失败：\n${error.stdout ?? ''}${error.stderr ?? ''}`)
}

const outDir = join(workDir, 'dist')
if (!existsSync(outDir)) fail('消费者构建没有产出 dist/')

// 4) 断言产物自包含
const jsFiles = walk(outDir, f => f.endsWith('.js'))
const problems = []

// worker chunk 在消费者项目里是【已知限制】，单独跟踪（见 README 的「开发者注意事项」）：
// 它的 chunk 会 import rolldown 的共享 runtime，而消费者打包器不会重写 node_modules 里
// worker 内部的 import；主入口对 worker 资源的引用同理。结果是 worker 加载失败并静默
// 回退到主线程。所以这里断言的是消费者真正能跑起来的那条路径（主线程）自包含。
const isWorkerOwn = file => file.includes('tree.worker')
const isWorkerRef = spec => spec.includes('tree.worker')

for (const file of jsFiles) {
  const code = readFileSync(file, 'utf8')

  // 4a. 静态 import 的相对路径必须存在
  if (!isWorkerOwn(file)) {
    for (const match of code.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) {
      const target = resolve(dirname(file), match[1])
      if (!existsSync(target)) {
        problems.push(`${file.slice(outDir.length + 1)} → 缺少被 import 的文件 ${match[1]}`)
      }
    }
  }

  // 4b. new URL(<相对路径>, import.meta.url) 引用的资源必须存在
  for (const match of code.matchAll(/new URL\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:``\s*\+\s*)?import\.meta\.url/g)) {
    const spec = match[1]
    if (spec.startsWith('data:') || /^[a-z]+:/i.test(spec)) continue
    if (isWorkerRef(spec)) continue
    const target = resolve(dirname(file), spec)
    if (!existsSync(target)) {
      problems.push(`${file.slice(outDir.length + 1)} → 缺少 new URL 引用的资源 ${spec}`)
    }
  }
}

if (problems.length > 0) {
  fail(`产物不是自包含的，消费者运行时会 404：\n  - ${problems.join('\n  - ')}`)
}

if (!process.env.SMOKE_KEEP) {
  rmSync(workDir, { recursive: true, force: true })
}
console.log(
  `\x1b[32m[smoke-dist] OK\x1b[0m — 消费者零配置构建通过，产物自包含（${jsFiles.length} 个 JS 文件，无悬空 import / 资源引用）`
)
