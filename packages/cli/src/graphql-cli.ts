import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { watch } from 'chokidar'
import glob from 'fast-glob'
import type { CliIO } from './cli-io.js'
import { graphQLCodegenConfig } from './graphql-config.js'
import { compareSchemas, generate, loadSchema } from './graphql-codegen.js'

const help = [
  '  loutre graphql generate --config <file> [--target <name>] [--watch | --check]',
  '  loutre graphql validate --schema <file-or-glob> [--schema <file-or-glob>]',
  '  loutre graphql diff --before <file-or-glob> --after <file-or-glob> [--json]',
].join('\n')

function parseArguments(args: readonly string[]) {
  const values = new Map<string, string[]>()
  const flags = new Set<string>()
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (['--check', '--watch', '--json', '--help'].includes(arg)) {
      if (flags.has(arg)) throw new Error(`optionが重複しています: ${arg}`)
      flags.add(arg)
    } else if (
      ['--config', '--target', '--schema', '--before', '--after'].includes(arg)
    ) {
      const value = args[++index]
      if (!value || value.startsWith('--'))
        throw new Error(`${arg}に値が必要です。`)
      if (arg !== '--schema' && values.has(arg))
        throw new Error(`optionが重複しています: ${arg}`)
      values.set(arg, [...(values.get(arg) ?? []), value])
    } else throw new Error(`不明な引数です: ${arg}`)
  }
  return { values, flags }
}

export async function runGraphQLCli(
  args: readonly string[],
  io: CliIO,
): Promise<number> {
  const [command, ...rest] = args
  if (!command || command === '--help' || command === 'help') {
    io.stdout(help)
    return 0
  }
  let options: ReturnType<typeof parseArguments>
  try {
    options = parseArguments(rest)
    if (options.flags.has('--help')) {
      io.stdout(help)
      return 0
    }
    const allowed =
      command === 'generate'
        ? ['--config', '--target', '--watch', '--check']
        : command === 'validate'
          ? ['--schema']
          : command === 'diff'
            ? ['--before', '--after', '--json']
            : []
    if (!allowed.length)
      throw new Error(`不明なGraphQL commandです: ${command}`)
    for (const key of [...options.values.keys(), ...options.flags])
      if (!allowed.includes(key))
        throw new Error(`${command}で${key}は使用できません。`)
    const required =
      command === 'generate'
        ? ['--config']
        : command === 'validate'
          ? ['--schema']
          : ['--before', '--after']
    for (const key of required)
      if (!options.values.has(key)) throw new Error(`${key}が必要です。`)
    if (options.flags.has('--watch') && options.flags.has('--check'))
      throw new Error('--watchと--checkは同時に指定できません。')
  } catch (error) {
    io.stderr(message(error))
    return 2
  }
  try {
    if (command === 'validate') {
      await loadSchema(options.values.get('--schema')!, io.cwd)
      io.stdout('GraphQL schemaは有効です。')
      return 0
    }
    if (command === 'diff') {
      const result = await compareSchemas(
        options.values.get('--before')![0]!,
        options.values.get('--after')![0]!,
        io.cwd,
      )
      if (options.flags.has('--json')) io.stdout(JSON.stringify(result))
      else {
        for (const change of result.breaking)
          io.stdout(`破壊的変更: ${change.description}`)
        for (const change of result.dangerous)
          io.stdout(`要確認: ${change.description}`)
        if (!result.breaking.length && !result.dangerous.length)
          io.stdout('互換性に影響するschema変更はありません。')
      }
      return result.breaking.length ? 1 : 0
    }
    const config = resolve(io.cwd, options.values.get('--config')![0]!)
    const target = options.values.get('--target')?.[0]
    if (options.flags.has('--watch'))
      return await watchGeneration(config, target, io)
    return await generateOnce(config, target, options.flags.has('--check'), io)
  } catch (error) {
    io.stderr(message(error))
    return 1
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function generateOnce(
  config: string,
  target: string | undefined,
  check: boolean,
  io: CliIO,
) {
  const result = await generate(config, target, check)
  if (check && result.changed.length) {
    for (const file of result.changed)
      io.stderr(`生成物の更新が必要です: ${file}`)
    return 1
  }
  for (const output of result.outputs)
    io.stdout(
      `${output.name}: ${check ? '生成物は最新です' : '生成しました'} ${output.path}`,
    )
  return 0
}

function patternRoot(pattern: string, cwd: string) {
  const wildcard = pattern.search(/[?*[\]{}()!]/)
  if (wildcard < 0) return dirname(resolve(cwd, pattern))
  const prefix = pattern.slice(0, wildcard)
  return resolve(cwd, prefix.slice(0, prefix.lastIndexOf('/') + 1) || '.')
}

async function watchGeneration(
  config: string,
  selected: string | undefined,
  io: CliIO,
) {
  const watcher = watch([config], { ignoreInitial: true })
  const roots = new Set<string>()
  let outputs = new Set<string>()
  let patterns: string[] = []
  let inputs = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let queued = false
  let stopped = false
  let active: Promise<void> = Promise.resolve()
  const refresh = async () => {
    if (stopped) return
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      const parsed = graphQLCodegenConfig.parse(
        JSON.parse(await readFile(config, 'utf8')),
      )
      const targets = Object.entries(parsed.targets)
        .filter(([name]) => selected === undefined || selected === name)
        .map(([, target]) => target)
      patterns = targets.flatMap((target) => [
        ...target.schema,
        ...(target.kind === 'client' ? target.documents : []),
      ])
      inputs = new Set(
        await glob(patterns, {
          cwd: dirname(config),
          absolute: true,
          onlyFiles: true,
        }),
      )
      const nextRoots = new Set(
        targets
          .flatMap((target) => [
            ...target.schema,
            ...(target.kind === 'client' ? target.documents : []),
          ])
          .map((pattern) => patternRoot(pattern, dirname(config))),
      )
      outputs = new Set(
        targets.map((target) => resolve(dirname(config), target.output)),
      )
      for (const root of roots)
        if (!nextRoots.has(root)) await watcher.unwatch(root)
      for (const root of nextRoots) if (!roots.has(root)) watcher.add(root)
      roots.clear()
      for (const root of nextRoots) roots.add(root)
      await generateOnce(config, selected, false, io)
    } catch (error) {
      io.stderr(message(error))
    } finally {
      running = false
      if (queued && !stopped) {
        queued = false
        active = refresh()
        await active
      }
    }
  }
  const ready = new Promise<void>((resolveReady, reject) => {
    watcher.once('ready', resolveReady)
    watcher.once('error', reject)
  })
  watcher.on('all', async (_event, path) => {
    if (stopped || outputs.has(resolve(path)) || /\.[\da-f-]+\.tmp$/.test(path))
      return
    if (resolve(path) !== config && !inputs.has(resolve(path))) {
      const current = await glob(patterns, {
        cwd: dirname(config),
        absolute: true,
        onlyFiles: true,
      })
      if (stopped || !current.includes(resolve(path))) return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      active = refresh()
    }, 50)
  })
  await ready
  active = refresh()
  await active
  io.stdout('GraphQL SDL / operation / configの変更を監視しています。')
  return await new Promise<number>((resolveStopped) => {
    const stop = () => {
      if (stopped) return
      stopped = true
      if (timer) clearTimeout(timer)
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      void Promise.all([active, watcher.close()]).then(() => resolveStopped(0))
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    watcher.on('error', (error) => {
      io.stderr(message(error))
      stop()
    })
  })
}
