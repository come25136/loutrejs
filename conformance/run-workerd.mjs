import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), 'loutre-workerd-'))
const worker = join(directory, 'worker.js')
const config = join(directory, 'config.capnp')
await build({
  entryPoints: [resolve('conformance/workerd-entry.ts')],
  outfile: worker,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2024',
})
await writeFile(
  config,
  `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [(name = "main", worker = (
    compatibilityDate = "2026-08-24",
    modules = [(name = "worker.js", esModule = embed "worker.js")],
  ))],
  sockets = [(name = "http", address = "127.0.0.1:18787", http = (), service = "main")],
);
`,
  'utf8',
)

const child = spawn(resolve('node_modules/.bin/workerd'), ['serve', config], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk
})

try {
  let response
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      response = await fetch('http://127.0.0.1:18787/users/workerd-user')
      break
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 20))
    }
  }
  if (!response) throw new Error(`workerdを起動できませんでした: ${stderr}`)
  const body = await response.json()
  if (response.status !== 200 || body.id !== 'workerd-user') {
    throw new Error(`workerd conformanceに失敗しました: ${JSON.stringify(body)}`)
  }
  const streamed = await fetch('http://127.0.0.1:18787/events')
  if (!(await streamed.text()).includes('"sequence":3')) {
    throw new Error('workerd server-stream conformanceに失敗しました')
  }
  console.log('workerd 2026-08-24 conformance: 成功')
} finally {
  child.kill('SIGTERM')
}
