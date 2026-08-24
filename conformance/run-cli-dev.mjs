import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = process.cwd()
const outputRoot = resolve('dist/conformance')
await mkdir(outputRoot, { recursive: true })
const project = await mkdtemp(join(outputRoot, 'cli-dev-'))
const sourceDirectory = join(project, 'src')
await mkdir(sourceDirectory)

const appSource = `
import { contract, defineModule, hook, implement, procedure } from '@loutrefw/core'
import { type ContextOf, type ControllerOf, createHttpApplication, http } from '@loutrefw/http'
import { z } from 'zod'
import { failInitialization, message } from './message.js'

const DevContract = contract({
  get: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/message',
        responses: {
          ok: { status: 200, body: z.object({ message: z.string() }) },
        },
        pipeline: [http.controller],
      }),
    },
  }),
})

type DevHttp = ControllerOf<typeof DevContract, 'http'>

class DevController implements DevHttp {
  get(ctx: ContextOf<DevHttp, 'get'>) {
    return ctx.response.ok({ body: { message } })
  }
}

const DevModule = defineModule(() => ({
  implementations: [implement(DevContract).for(http).with(DevController)],
  lifecycle: {
    onModuleInit: hook({
      inject: [],
      run: () => {
        if (failInitialization) throw new Error('意図した初期化失敗')
      },
    }),
  },
}))

export default createHttpApplication({
  modules: [DevModule()],
})
`

await writeFile(
  join(project, 'tsconfig.json'),
  `${JSON.stringify({
    compilerOptions: {
      target: 'ES2024',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  }, null, 2)}\n`,
  'utf8',
)
await writeFile(join(sourceDirectory, 'app.ts'), appSource, 'utf8')
const messageFile = join(sourceDirectory, 'message.ts')
await writeFile(
  messageFile,
  "export const message = '最初'\nexport const failInitialization = false\n",
  'utf8',
)

const child = spawn(
  resolve(root, 'node_modules/.bin/loutre'),
  ['dev', 'src/app.ts', '--port', '0'],
  { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] },
)
let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => {
  stdout += chunk
})
child.stderr.on('data', (chunk) => {
  stderr += chunk
})
const exited = new Promise((resolveExit) => child.once('exit', resolveExit))

async function waitFor(readValue, expected, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = await readValue()
    if (value?.includes(expected)) return value
    if (child.exitCode !== null) {
      throw new Error(`${label}の前にCLIが終了しました: ${stderr}`)
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25))
  }
  throw new Error(`${label}を確認できませんでした\nstdout:\n${stdout}\nstderr:\n${stderr}`)
}

async function waitForUnavailable(port, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/message`)
    } catch {
      return
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25))
  }
  throw new Error(`${label}でHTTP serverが停止しませんでした`)
}

try {
  const serverLine = await waitFor(
    async () =>
      stdout
        .split('\n')
        .find((line) => line.startsWith('Server:')),
    'Server: http://127.0.0.1:',
    'HTTP Application起動',
  )
  const port = Number(serverLine.match(/Server: http:\/\/127\.0\.0\.1:(\d+)/)?.[1])
  await waitFor(async () => stdout, 'Loutre 0.1.0', 'Loutre version')
  await waitFor(async () => stdout, '(cli-dev-', 'Application名')
  const readMessage = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/message`)
      return JSON.stringify(await response.json())
    } catch {
      return undefined
    }
  }

  await waitFor(readMessage, '最初', '初期Application response')
  await writeFile(
    messageFile,
    "export const message = '更新後'\nexport const failInitialization = false\n",
    'utf8',
  )
  await waitFor(readMessage, '更新後', 'watch後のApplication response')
  await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  const startsBeforeTypeError = stdout.match(/^Ready in \d+ ms$/gm)?.length ?? 0
  if (startsBeforeTypeError !== 2) {
    throw new Error(`初期起動と1回のsaveで${startsBeforeTypeError}回起動されました`)
  }
  const wordmarks = stdout.match(/██████╗/g)?.length ?? 0
  if (wordmarks !== 0) {
    throw new Error('non-TTYで巨大wordmarkが表示されました')
  }

  await writeFile(
    messageFile,
    'export const message: string = 123\nexport const failInitialization = false\n',
    'utf8',
  )
  await waitFor(async () => stderr, 'TS2322', 'TypeScript型エラー')
  await waitForUnavailable(port, '型エラー時')
  await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  const typeErrors = stderr.match(/TS2322/g)?.length ?? 0
  if (typeErrors !== 1) {
    throw new Error(`1回のsaveでTypeScript型エラーが${typeErrors}回表示されました`)
  }
  const startsAfterTypeError = stdout.match(/^Ready in \d+ ms$/gm)?.length ?? 0
  if (startsAfterTypeError !== startsBeforeTypeError) {
    throw new Error('TypeScript型エラー中にApplicationが起動されました')
  }

  await writeFile(
    messageFile,
    "export const message = '初期化失敗'\nexport const failInitialization = true\n",
    'utf8',
  )
  await waitFor(async () => stderr, '意図した初期化失敗', 'initialize失敗')
  await waitForUnavailable(port, 'initialize失敗時')

  await writeFile(messageFile, 'export const message =\n', 'utf8')
  await waitFor(async () => stderr, 'TS1109', 'compile失敗')
  await waitForUnavailable(port, 'compile失敗時')

  await writeFile(
    messageFile,
    "export const message = '復旧後'\nexport const failInitialization = false\n",
    'utf8',
  )
  await waitFor(readMessage, '復旧後', 'compile復旧後のApplication response')
  const startsAfterRecovery = stdout.match(/^Ready in \d+ ms$/gm)?.length ?? 0
  if (startsAfterRecovery !== 3) {
    throw new Error(`復旧までにApplicationが${startsAfterRecovery}回起動されました`)
  }
  console.log('Loutre CLI dev incremental/watch conformance: 成功')
} finally {
  if (child.exitCode === null) child.kill('SIGTERM')
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolveWait) => setTimeout(() => resolveWait(false), 5_000)),
  ])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
  await rm(project, { recursive: true, force: true })
}
