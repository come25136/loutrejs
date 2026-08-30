import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'

interface ExampleProcess {
  readonly output: () => string
  readonly stop: () => Promise<void>
}

export function runWorkspaceCommand(
  workspace: string,
  script: string,
  args: readonly string[] = [],
  env: NodeJS.ProcessEnv = {},
) {
  return spawnSync(
    'npm',
    [
      'run',
      script,
      '--workspace',
      workspace,
      ...(args.length ? ['--', ...args] : []),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ...env },
    },
  )
}

export function startWorkspace(
  workspace: string,
  script = 'start',
  env: NodeJS.ProcessEnv = {},
): ExampleProcess {
  const child = spawn('npm', ['run', script, '--workspace', workspace], {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout?.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    output += String(chunk)
  })

  return {
    output: () => output,
    stop: () => stopProcess(child),
  }
}

export async function waitForPort(port: number, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await canConnect(port)) return
    await delay(100)
  }
  throw new Error(
    `Port ${port} did not become available within ${timeoutMs} ms`,
  )
}

export async function waitForOutput(
  process: ExampleProcess,
  expected: string,
  timeoutMs = 15_000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (process.output().includes(expected)) return
    await delay(100)
  }
  throw new Error(
    `Process did not output ${JSON.stringify(expected)} within ${timeoutMs} ms.\n${process.output()}`,
  )
}

async function canConnect(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return

  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
  })

  if (process.platform === 'win32' || child.pid === undefined) {
    child.kill('SIGTERM')
  } else {
    process.kill(-child.pid, 'SIGTERM')
  }

  await Promise.race([exited, delay(1_000)])

  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32' || child.pid === undefined) {
      child.kill('SIGKILL')
    } else {
      process.kill(-child.pid, 'SIGKILL')
    }
    await Promise.race([exited, delay(1_000)])
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
