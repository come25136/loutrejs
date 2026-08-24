import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), 'loutre-electron-'))
const entry = join(directory, 'electron.cjs')
await build({
  entryPoints: [resolve('conformance/electron-entry.ts')],
  outfile: entry,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node24',
  external: ['electron'],
})
await writeFile(
  join(directory, 'package.json'),
  JSON.stringify({ main: 'electron.cjs' }),
  'utf8',
)

const child = spawn(resolve('node_modules/.bin/electron'), [directory], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => {
  stdout += chunk
})
child.stderr.on('data', (chunk) => {
  stderr += chunk
})
const code = await new Promise((resolveExit) => child.on('exit', resolveExit))
if (code !== 0 || !stdout.includes('conformance: 成功')) {
  throw new Error(`Electron conformanceに失敗しました。\n${stdout}\n${stderr}`)
}
process.stdout.write(stdout)
