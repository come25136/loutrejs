import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileTypeScriptSource } from '@loutrefw/compiler'
import { checkCapabilities, type RuntimeCapabilities } from '@loutrefw/runtime'
import { bunRuntime } from '@loutrefw/runtime-bun'
import { denoRuntime } from '@loutrefw/runtime-deno'
import { electronRuntime } from '@loutrefw/runtime-electron'
import { lambdaRuntime } from '@loutrefw/runtime-lambda'
import { nodeRuntime } from '@loutrefw/runtime-node'
import { createNodeHttpServer } from '@loutrefw/runtime-node'
import type { HttpApplication } from '@loutrefw/http'
import { workerdRuntime } from '@loutrefw/runtime-workerd'

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
  const [command, subject, target] = args
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
      const result = manifest()
      if (result.diagnostics.length > 0) {
        for (const diagnostic of result.diagnostics) io.stderr(diagnostic.message)
        return 1
      }
      const output = resolve(io.cwd, subject ?? 'dist/loutre.manifest.json')
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
      io.stdout(`Manifestを出力しました: ${output}`)
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
      const application = await loadHttpApplication(resolve(io.cwd, subject))
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

async function loadHttpApplication(entry: string): Promise<HttpApplication> {
  const module = await import(`${pathToFileURL(entry).href}?loutre=${Date.now()}`)
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
    '  loutre build [manifest出力先]',
    '  loutre dev <明示entry> [--port <port>]',
    '  loutre start <明示entry> [--port <port>]',
  ].join('\n')
}
