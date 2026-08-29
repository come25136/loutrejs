import { spawn } from 'node:child_process'
import { relative } from 'node:path'
import { isCancel, select, text } from '@clack/prompts'
import { Command, CommanderError, Option } from 'commander'
import { bootstrap } from '@loutrejs/loutre/host'
import application, { createProject } from './app.js'
import {
  installCommand,
  type PackageManager,
  packageManagerLabels,
  packageManagers,
  type ProjectTarget,
  projectTargets,
  runScriptCommand,
  targetLabels,
} from './options.js'

interface SelectOption {
  readonly value: string
  readonly label: string
}

export interface CreateLoutreCliIO {
  readonly cwd: string
  readonly detectedPackageManager?: PackageManager
  readonly prompt?: (
    message: string,
    initialValue: string,
  ) => Promise<string | undefined>
  readonly select?: (
    message: string,
    options: readonly SelectOption[],
    initialValue: string,
  ) => Promise<string | undefined>
  readonly install: (
    directory: string,
    packageManager: PackageManager,
  ) => Promise<number>
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

  const directory = await resolveDirectory(parsed.directory, parsed.yes, io)
  if (!directory) return 2
  const target = await resolveTarget(parsed.target, parsed.yes, io)
  if (!target) return 2
  const packageManager = await resolvePackageManager(
    parsed.packageManager,
    parsed.yes,
    io,
  )
  if (!packageManager) return 2

  const app = bootstrap({ application })
  try {
    const result = await app.run(createProject, {
      cwd: io.cwd,
      directory,
      packageManager,
      target,
    })
    io.stdout(`Loutre Applicationを作成しました: ${result.targetDirectory}`)
    io.stdout(`Target: ${targetLabels[target]}`)
    io.stdout(`Package manager: ${packageManagerLabels[packageManager]}`)

    if (parsed.install) {
      io.stdout('依存関係をインストールします。')
      const installCode = await io.install(
        result.targetDirectory,
        packageManager,
      )
      if (installCode !== 0) {
        io.stderr(
          `${installCommand(packageManager)}に失敗しました。生成したファイルは残しています。`,
        )
        return installCode
      }
    }

    const nextDirectory = relative(io.cwd, result.targetDirectory)
    io.stdout('')
    io.stdout('次のコマンド:')
    if (nextDirectory && nextDirectory !== '.') {
      io.stdout(`  cd ${quoteShellArgument(nextDirectory)}`)
    }
    if (!parsed.install) io.stdout(`  ${installCommand(packageManager)}`)
    io.stdout(`  ${nextCommand(packageManager, target)}`)
    return 0
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error))
    return 1
  } finally {
    await app.close('create-loutre-complete')
  }
}

interface ParsedArgs {
  readonly directory?: string
  readonly target?: ProjectTarget
  readonly packageManager?: PackageManager
  readonly help: boolean
  readonly yes: boolean
  readonly install: boolean
}

function parseArgs(
  args: readonly string[],
): ParsedArgs | { readonly error: string } {
  const command = new Command()
    .name('create-loutre')
    .helpOption(false)
    .exitOverride()
    .configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
    })
    .argument('[directory]')
    .addOption(new Option('--target <target>').choices([...projectTargets]))
    .addOption(
      new Option('--package-manager <package-manager>').choices([
        ...packageManagers,
      ]),
    )
    .option('-y, --yes', '未指定の選択肢に既定値を使用する')
    .option('--no-install', '依存関係をinstallしない')
    .option('-h, --help', 'helpを表示する')
    .allowExcessArguments(false)

  try {
    command.parse(
      args.filter((value) => value !== '--'),
      { from: 'user' },
    )
  } catch (error) {
    if (error instanceof CommanderError) return { error: error.message }
    throw error
  }

  const options = command.opts<{
    readonly target?: ProjectTarget
    readonly packageManager?: PackageManager
    readonly yes?: boolean
    readonly install: boolean
    readonly help?: boolean
  }>()
  const directory = command.processedArgs[0] as string | undefined

  return {
    ...(directory === undefined ? {} : { directory }),
    ...(options.target === undefined ? {} : { target: options.target }),
    ...(options.packageManager === undefined
      ? {}
      : { packageManager: options.packageManager }),
    help: options.help ?? false,
    yes: options.yes ?? false,
    install: options.install,
  }
}

async function resolveDirectory(
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
  const answer = await io.prompt('Project name', 'loutre-app')
  if (answer === undefined) return undefined
  return answer.trim() || 'loutre-app'
}

async function resolveTarget(
  requested: ProjectTarget | undefined,
  yes: boolean,
  io: CreateLoutreCliIO,
): Promise<ProjectTarget | undefined> {
  if (requested) return requested
  if (yes || !io.select) return 'node'
  const selected = await io.select(
    'Target',
    projectTargets.map((value) => ({ value, label: targetLabels[value] })),
    'node',
  )
  return projectTargets.find((target) => target === selected)
}

async function resolvePackageManager(
  requested: PackageManager | undefined,
  yes: boolean,
  io: CreateLoutreCliIO,
): Promise<PackageManager | undefined> {
  if (requested) return requested
  const initialValue = io.detectedPackageManager ?? 'npm'
  if (yes || !io.select) return initialValue
  const selected = await io.select(
    'Package manager',
    packageManagers.map((value) => ({
      value,
      label: packageManagerLabels[value],
    })),
    initialValue,
  )
  return packageManagers.find((packageManager) => packageManager === selected)
}

function createProcessIO(): CreateLoutreCliIO {
  const interactive = process.stdin.isTTY && process.stdout.isTTY
  return {
    cwd: process.cwd(),
    detectedPackageManager: detectPackageManager(
      process.env.npm_config_user_agent,
      globalThis,
    ),
    ...(interactive ? { prompt: terminalPrompt, select: terminalSelect } : {}),
    install: installDependencies,
    stdout: (value) => process.stdout.write(`${value}\n`),
    stderr: (value) => process.stderr.write(`${value}\n`),
  }
}

async function terminalPrompt(
  message: string,
  initialValue: string,
): Promise<string | undefined> {
  const result = await text({ message, defaultValue: initialValue })
  return isCancel(result) ? undefined : result
}

async function terminalSelect(
  message: string,
  options: readonly SelectOption[],
  initialValue: string,
): Promise<string | undefined> {
  const result = await select({ message, options: [...options], initialValue })
  return isCancel(result) ? undefined : result
}

function installDependencies(
  directory: string,
  packageManager: PackageManager,
): Promise<number> {
  const command = executableFor(packageManager)
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

function executableFor(packageManager: PackageManager): string {
  if (process.platform !== 'win32') return packageManager
  return packageManager === 'npm' ||
    packageManager === 'pnpm' ||
    packageManager === 'yarn'
    ? `${packageManager}.cmd`
    : packageManager
}

function detectPackageManager(
  userAgent: string | undefined,
  runtime: typeof globalThis,
): PackageManager {
  const globals = runtime as typeof globalThis & {
    readonly Bun?: unknown
    readonly Deno?: unknown
  }
  if (globals.Bun !== undefined) return 'bun'
  if (globals.Deno !== undefined) return 'deno'

  const name = userAgent?.split('/')[0]
  return (
    packageManagers.find((packageManager) => packageManager === name) ?? 'npm'
  )
}

function nextCommand(
  packageManager: PackageManager,
  target: ProjectTarget,
): string {
  return runScriptCommand(
    packageManager,
    target === 'aws-lambda' ? 'build' : 'dev',
  )
}

function quoteShellArgument(value: string): string {
  return /^[A-Za-z0-9_./-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`
}

function helpText(): string {
  return [
    'Usage: create-loutre [directory] [options]',
    '',
    'Options:',
    '  --target <target>                    node | bun | deno | cloudflare-workers | aws-lambda',
    '  --package-manager <package-manager>  npm | pnpm | yarn | bun | deno',
    '  -y, --yes                            未指定の選択肢に既定値を使用する',
    '  --no-install                         依存関係をinstallしない',
    '  -h, --help                           helpを表示する',
  ].join('\n')
}
