import { spawn } from 'node:child_process'
import { relative } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { bootstrap } from '@loutrejs/loutre/host'
import application, { createProject } from './app.js'

export interface CreateLoutreCliIO {
  readonly cwd: string
  readonly prompt?: (message: string) => Promise<string>
  readonly install: (directory: string) => Promise<number>
  readonly stdout: (value: string) => void
  readonly stderr: (value: string) => void
}

export async function runCreateLoutre(
  args: readonly string[],
  io: CreateLoutreCliIO = createProcessIO(),
): Promise<number> {
  const parsed = parseArgs(args)
  if ('error' in parsed) {
    io.stderr(parsed.error)
    io.stderr(helpText())
    return 2
  }
  if (parsed.help) {
    io.stdout(helpText())
    return 0
  }

  const target = await resolveTarget(parsed.target, parsed.yes, io)
  if (!target) return 2

  const app = bootstrap({ application })
  try {
    const result = await app.run(createProject, { cwd: io.cwd, target })
    io.stdout(`Loutre Applicationを作成しました: ${result.targetDirectory}`)

    if (parsed.install) {
      io.stdout('依存関係をインストールします。')
      const installCode = await io.install(result.targetDirectory)
      if (installCode !== 0) {
        io.stderr('npm installに失敗しました。生成したファイルは残しています。')
        return installCode
      }
    }

    const nextDirectory = relative(io.cwd, result.targetDirectory)
    io.stdout('')
    io.stdout('次のコマンド:')
    if (nextDirectory && nextDirectory !== '.') {
      io.stdout(`  cd ${quoteShellArgument(nextDirectory)}`)
    }
    if (!parsed.install) io.stdout('  npm install')
    io.stdout('  npm run dev')
    return 0
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error))
    return 1
  } finally {
    await app.close('create-loutre-complete')
  }
}

interface ParsedArgs {
  readonly target?: string
  readonly help: boolean
  readonly yes: boolean
  readonly install: boolean
}

function parseArgs(
  args: readonly string[],
): ParsedArgs | { readonly error: string } {
  let target: string | undefined
  let help = false
  let yes = false
  let install = true

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      help = true
      continue
    }
    if (arg === '--yes' || arg === '-y') {
      yes = true
      continue
    }
    if (arg === '--no-install') {
      install = false
      continue
    }
    if (arg.startsWith('-')) return { error: `不明なoptionです: ${arg}` }
    if (target) return { error: '生成先は1つだけ指定できます。' }
    target = arg
  }

  return {
    ...(target === undefined ? {} : { target }),
    help,
    yes,
    install,
  }
}

async function resolveTarget(
  requested: string | undefined,
  yes: boolean,
  io: CreateLoutreCliIO,
): Promise<string | undefined> {
  if (requested) return requested
  if (yes) return 'loutre-app'
  if (!io.prompt) {
    io.stderr('生成先を指定してください。例: npm create loutre@latest my-app')
    return undefined
  }
  const answer = (await io.prompt('Project name (loutre-app): ')).trim()
  return answer || 'loutre-app'
}

function createProcessIO(): CreateLoutreCliIO {
  const prompt =
    process.stdin.isTTY && process.stdout.isTTY ? terminalPrompt : undefined
  return {
    cwd: process.cwd(),
    ...(prompt === undefined ? {} : { prompt }),
    install: installDependencies,
    stdout: (value) => process.stdout.write(`${value}\n`),
    stderr: (value) => process.stderr.write(`${value}\n`),
  }
}

async function terminalPrompt(message: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    return await readline.question(message)
  } finally {
    readline.close()
  }
}

function installDependencies(directory: string): Promise<number> {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, ['install'], {
      cwd: directory,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      resolvePromise(code ?? (signal ? 1 : 0))
    })
  })
}

function quoteShellArgument(value: string): string {
  return /^[A-Za-z0-9_./-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`
}

function helpText(): string {
  return [
    'Usage: npm create loutre@latest [directory] [-- --no-install]',
    '',
    'Options:',
    '  -y, --yes      生成先未指定時にloutre-appを使用する',
    '  --no-install   npm installを実行しない',
    '  -h, --help     helpを表示する',
  ].join('\n')
}
