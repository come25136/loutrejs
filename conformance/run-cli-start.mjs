import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const child = spawn(
  resolve('node_modules/.bin/loutre'),
  ['start', 'fixtures/http-crud/src/app.ts', '--port', '18788'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => {
  stdout += chunk
})
child.stderr.on('data', (chunk) => {
  stderr += chunk
})

try {
  let response
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      response = await fetch('http://127.0.0.1:18788/users/cli-user')
      break
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 20))
    }
  }
  if (!response) throw new Error(`CLI serverを起動できませんでした: ${stderr}`)
  const body = await response.json()
  if (response.status !== 200 || body.id !== 'cli-user') {
    throw new Error(
      `CLI start conformanceに失敗しました: ${JSON.stringify(body)}`,
    )
  }
  console.log('Loutre CLI start conformance: 成功')
} finally {
  child.kill('SIGTERM')
}
