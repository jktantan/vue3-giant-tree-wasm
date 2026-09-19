import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const steps = [
  ['node tests', 'pnpm', ['run', 'test']],
  ['library build', 'pnpm', ['run', 'lib:build']],
  ['100k capacity', process.execPath, ['--expose-gc', 'scripts/benchmark-capacity.mjs', '--single', '100000']],
  ['deep 512', process.execPath, ['--expose-gc', 'scripts/benchmark-capacity.mjs', '--deep', '512', '2']],
  ['deep 1024', process.execPath, ['--expose-gc', 'scripts/benchmark-capacity.mjs', '--deep', '1024', '2']],
  ['compact/legacy 1M', 'pnpm', ['run', 'benchmark:capacity:compact-ab']],
  ['browser report', 'pnpm', ['run', 'report:browser']],
  ['browser 100k report', 'pnpm', ['run', 'report:browser:100k']],
]

const results = []
for (const [name, command, args] of steps) {
  const started = performance.now()
  console.log(`\n=== ${name} ===`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    // pnpm is a shell shim on Windows; the Node executable must be invoked
    // directly because its path commonly contains spaces (for example
    // `C:\\Program Files\\nodejs\\node.exe`).
    shell: process.platform === 'win32' && command !== process.execPath,
    env: process.env,
  })
  const durationMs = Number((performance.now() - started).toFixed(1))
  const passed = result.status === 0
  results.push({ name, passed, durationMs })
  if (!passed) {
    console.error(`phase gate stopped at ${name}`)
    console.log(JSON.stringify({ results }, null, 2))
    process.exit(result.status ?? 1)
  }
}

console.log('\n=== phase 3/4 gate summary ===')
console.log(JSON.stringify({ passed: true, results }, null, 2))
