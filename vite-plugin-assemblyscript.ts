import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

interface AssemblyScriptPluginOptions {
  /** assembly 源码目录（相对项目根） */
  srcDir?: string
  /** asconfig.json 路径（相对项目根） */
  configFile?: string
}

export default function assemblyscriptPlugin(
  options: AssemblyScriptPluginOptions = {}
): Plugin {
  const { srcDir = 'assembly', configFile = 'asconfig.json' } = options
  let projectRoot = ''
  let isDev = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function compile(target: 'debug' | 'release'): boolean {
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
  }
}
