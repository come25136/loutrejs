import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  compileTypeScriptSource,
  createRuntimeLinkageBootstrap,
  createRuntimeLinkagePlan,
  transformSourceForRuntimeLinkage,
  type RuntimeLinkagePlan,
} from '@loutrefw/compiler'
import { checkCapabilities, type RuntimeCapabilities } from '@loutrefw/runtime'
import { bunRuntime } from '@loutrefw/runtime-bun'
import { denoRuntime } from '@loutrefw/runtime-deno'
import { electronRuntime } from '@loutrefw/runtime-electron'
import { lambdaRuntime } from '@loutrefw/runtime-lambda'
import { nodeRuntime } from '@loutrefw/runtime-node'
import { createNodeHttpServer } from '@loutrefw/runtime-node'
import type { HttpApplication } from '@loutrefw/http'
import { workerdRuntime } from '@loutrefw/runtime-workerd'
import { build as buildWithEsbuild, type Loader, type Plugin } from 'esbuild'

export interface CliIO {
  readonly cwd: string
  readonly stdout: (value: string) => void
  readonly stderr: (value: string) => void
}

const runtimes: Readonly<Record<string, RuntimeCapabilities>> = {
  node: nodeRuntime,
  deno: denoRuntime,
  bun: bunRuntime,
  workerd: workerdRuntime,
  electron: electronRuntime,
  lambda: lambdaRuntime,
}

export async function runCli(
  args: readonly string[],
  io: CliIO,
): Promise<number> {
  const [command, subject] = args
  if (!command || command === 'help' || command === '--help') {
    io.stdout(helpText())
    return 0
  }

  const manifest = () =>
    compileTypeScriptSource({
      tsconfigPath: resolve(io.cwd, 'tsconfig.json'),
    })

  switch (command) {
    case 'check': {
      const result = manifest()
      if (result.diagnostics.length === 0) {
        io.stdout('Loutre Application Graphは有効です。')
        return 0
      }
      for (const diagnostic of result.diagnostics) {
        io.stderr(`${diagnostic.code} ${diagnostic.path}\n${diagnostic.message}`)
      }
      return 1
    }
    case 'doctor': {
      const runtimeName = subject ?? 'node'
      const runtime = runtimes[runtimeName]
      if (!runtime) {
        io.stderr(`未定義のRuntimeです: ${runtimeName}`)
        return 2
      }
      const result = manifest()
      const required = requiredCapabilities(result)
      const check = checkCapabilities(required, runtime)
      io.stdout(`Runtime: ${runtime.runtime}`)
      io.stdout(`Required: ${check.required.join(', ') || '(なし)'}`)
      io.stdout(`Missing: ${check.missing.join(', ') || '(なし)'}`)
      return check.ok ? 0 : 1
    }
    case 'graph': {
      const result = manifest()
      switch (subject) {
        case 'modules':
          for (const module of result.modules) {
            io.stdout(`${module.name}\n  imports: ${module.imports.join(', ') || '(なし)'}`)
            io.stdout(`  providers: ${module.providers.join(', ') || '(なし)'}`)
            io.stdout(`  exports: ${module.exports.join(', ') || '(なし)'}`)
            io.stdout(`  lifecycle: ${module.lifecycle.join(', ') || '(なし)'}`)
            io.stdout(`  requires: ${module.requires.join(', ') || '(なし)'}`)
          }
          return 0
        case 'di':
          for (const constructor of result.constructors) {
            io.stdout(
              `${constructor.className}\n  inject: ${constructor.dependencies.map(({ reference }) => reference).join(', ') || '(なし)'}`,
            )
          }
          return 0
        case 'contracts':
          for (const pipeline of result.pipelines) {
            io.stdout(`${pipeline.contract}.${pipeline.procedure} [${pipeline.protocol}]`)
            for (const layer of pipeline.layers) {
              io.stdout(`  ${layer.index + 1} ${layer.name} ${layer.role}`)
              if (layer.requires.length > 0) {
                io.stdout(`    requires: ${layer.requires.join(', ')}`)
              }
              if (layer.provides.length > 0) {
                io.stdout(`    provides: ${layer.provides.join(', ')}`)
              }
              if (layer.requiresValidated.length > 0) {
                io.stdout(
                  `    requires validated: ${layer.requiresValidated.join(', ')}`,
                )
              }
            }
          }
          return 0
        case 'runtime':
          for (const capability of requiredCapabilities(result)) {
            io.stdout(capability)
          }
          return 0
        default:
          io.stderr('graphにはmodules、di、contracts、runtimeのいずれかが必要です。')
          return 2
      }
    }
    case 'explain': {
      if (!subject) {
        io.stderr('explainには対象が必要です。')
        return 2
      }
      const result = manifest()
      const pipelines = result.pipelines.filter(
        (pipeline) =>
          `${pipeline.contract}.${pipeline.procedure}` === subject ||
          pipeline.contract === subject,
      )
      const constructor = result.constructors.find(
        ({ className }) => className === subject,
      )
      if (pipelines.length === 0 && !constructor) {
        io.stderr(`対象が見つかりません: ${subject}`)
        return 1
      }
      for (const pipeline of pipelines) {
        io.stdout(`${pipeline.contract}.${pipeline.procedure} [${pipeline.protocol}]`)
        for (const layer of pipeline.layers) {
          io.stdout(`${layer.index + 1}. ${layer.name} (${layer.role})`)
        }
      }
      if (constructor) {
        io.stdout(`${constructor.className} constructor`)
        for (const dependency of constructor.dependencies) {
          io.stdout(
            `${dependency.index}. ${dependency.parameter} <- ${dependency.reference}`,
          )
        }
      }
      return 0
    }
    case 'build': {
      if (!subject) {
        io.stderr('buildには明示的なApplication entryが必要です。')
        return 2
      }
      const outputDirectory = resolve(
        io.cwd,
        readOption(args, '--out-dir') ?? 'dist/loutre',
      )
      const plan = createRuntimeLinkagePlan({
        tsconfigPath: resolve(io.cwd, 'tsconfig.json'),
        entry: resolve(io.cwd, subject),
      })
      await mkdir(outputDirectory, { recursive: true })
      const entryOutput = join(outputDirectory, 'application.mjs')
      await emitLinkedApplication(plan, entryOutput)
      const manifestOutput = join(outputDirectory, 'loutre.manifest.json')
      await writeFile(
        manifestOutput,
        `${JSON.stringify({ ...plan.manifest, fingerprint: plan.fingerprint }, null, 2)}\n`,
        'utf8',
      )
      io.stdout(`Applicationを出力しました: ${entryOutput}`)
      io.stdout(`Graph Manifestを出力しました: ${manifestOutput}`)
      return 0
    }
    case 'dev':
    case 'start': {
      if (!subject) {
        io.stderr(
          `${command}には明示的なApplication entryが必要です。filesystem discoveryは行いません。`,
        )
        return 2
      }
      const port = readPort(args)
      const application = await loadLinkedHttpApplication(
        resolve(io.cwd, subject),
        resolve(io.cwd, 'tsconfig.json'),
      )
      await application.initialize()
      const server = createNodeHttpServer(application)
      server.listen(port, '127.0.0.1')
      await new Promise<void>((resolveListening, reject) => {
        server.once('listening', resolveListening)
        server.once('error', reject)
      })
      const address = server.address()
      const actualPort =
        typeof address === 'object' && address ? address.port : port
      io.stdout(
        `${command === 'dev' ? 'Development' : 'Application'} server: http://127.0.0.1:${actualPort}`,
      )
      const shutdown = async (signal: string) => {
        server.close()
        await application.shutdown(signal)
      }
      process.once('SIGINT', () => void shutdown('SIGINT'))
      process.once('SIGTERM', () => void shutdown('SIGTERM'))
      return 0
    }
    default:
      io.stderr(`不明なcommandです: ${command}`)
      return 2
  }
}

async function loadLinkedHttpApplication(
  entry: string,
  tsconfigPath: string,
): Promise<HttpApplication> {
  const plan = createRuntimeLinkagePlan({ tsconfigPath, entry })
  const directory = await mkdtemp(join(tmpdir(), 'loutre-bootstrap-'))
  const output = join(directory, 'application.mjs')
  try {
    await emitLinkedApplication(plan, output)
    const module = await import(`${pathToFileURL(output).href}?loutre=${Date.now()}`)
    const application = module.default ?? module.application
    if (
      !application ||
      typeof application.initialize !== 'function' ||
      typeof application.shutdown !== 'function' ||
      typeof application.handle !== 'function'
    ) {
      throw new Error(
        'Application entryはdefaultまたはapplication named exportとしてHttpApplicationを公開する必要があります。',
      )
    }
    return application as HttpApplication
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function emitLinkedApplication(
  plan: RuntimeLinkagePlan,
  output: string,
): Promise<void> {
  await buildWithEsbuild({
    stdin: {
      contents: createRuntimeLinkageBootstrap(plan),
      loader: 'ts',
      resolveDir: dirname(plan.entry),
      sourcefile: 'loutre-generated-bootstrap.ts',
    },
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    sourcemap: 'inline',
    plugins: [runtimeLinkagePlugin(plan)],
  })
}

function runtimeLinkagePlugin(plan: RuntimeLinkagePlan): Plugin {
  const fragments = new Map(
    plan.fragments.map((fragment) => [resolve(fragment.file), fragment]),
  )
  return {
    name: 'loutre-runtime-linkage',
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        const fragment = fragments.get(resolve(args.path))
        if (!fragment) return undefined
        const source = await readFile(args.path, 'utf8')
        return {
          contents: transformSourceForRuntimeLinkage(source, fragment),
          loader: loaderFor(args.path),
        }
      })
    },
  }
}

function loaderFor(path: string): Loader {
  switch (extname(path)) {
    case '.tsx':
      return 'tsx'
    case '.jsx':
      return 'jsx'
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'js'
    default:
      return 'ts'
  }
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

function readPort(args: readonly string[]): number {
  const index = args.indexOf('--port')
  if (index < 0) return 3000
  const port = Number(args[index + 1])
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`不正なportです: ${args[index + 1] ?? ''}`)
  }
  return port
}

function requiredCapabilities(result: ReturnType<typeof compileTypeScriptSource>) {
  const required = new Set(result.capabilities)
  if (result.pipelines.some(({ protocol }) => protocol === 'messagePort')) {
    required.add('messagePort.send')
    required.add('messagePort.receive')
  }
  if (
    result.pipelines.some(({ layers }) =>
      layers.some(({ name }) => name.includes('server-stream')),
    )
  ) {
    required.add('http.response.streaming')
  }
  return [...required]
}

function helpText(): string {
  return [
    'Loutre CLI',
    '  loutre check',
    '  loutre doctor [node|deno|bun|workerd|electron|lambda]',
    '  loutre graph modules|di|contracts|runtime',
    '  loutre explain <target>',
    '  loutre build <明示entry> [--out-dir <directory>]',
    '  loutre dev <明示entry> [--port <port>]',
    '  loutre start <明示entry> [--port <port>]',
  ].join('\n')
}
