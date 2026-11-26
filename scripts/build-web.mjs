import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const cli = fileURLToPath(new URL('node_modules/@rspack/cli/bin/rspack.js', root))
const build = spawnSync(process.execPath, [cli, 'build', '-c', 'rspack.config.ts'], {
  cwd: fileURLToPath(root),
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
})
if (build.error) throw build.error
process.exitCode = build.status ?? 1
