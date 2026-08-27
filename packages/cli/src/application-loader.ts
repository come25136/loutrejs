import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  ApplicationDefinition,
  BaseApplication,
  HttpApplicationCapability,
} from '@loutrejs/application'
import { bootstrap } from '@loutrejs/application/host'
import {
  assertValidCompilation,
  compileApplication,
  type ApplicationGraphIR,
} from '@loutrejs/graph'
import { build as buildWithEsbuild } from 'esbuild'

export type HostedHttpApplication = BaseApplication<ApplicationDefinition> &
  HttpApplicationCapability

export interface LoadedApplication {
  readonly application: HostedHttpApplication
  readonly sourceFiles: readonly string[]
}

export interface EmitApplicationOptions {
  readonly nodeCompatibility?: boolean
}

export async function emitApplication(
  entry: string,
  output: string,
  options: EmitApplicationOptions = {},
): Promise<readonly string[]> {
  await mkdir(dirname(output), { recursive: true })
  const workingDirectory = dirname(entry)
  const result = await buildWithEsbuild({
    absWorkingDir: workingDirectory,
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: options.nodeCompatibility ? 'node' : 'neutral',
    target: 'es2024',
    conditions: [],
    mainFields: ['module', 'main'],
    external: options.nodeCompatibility
      ? ['node:*', ...builtinModules]
      : ['node:*'],
    ...(options.nodeCompatibility
      ? {
          banner: {
            js: "import { createRequire as __loutreCreateRequire } from 'node:module'; import { dirname as __loutreDirname } from 'node:path'; import { fileURLToPath as __loutreFileURLToPath } from 'node:url'; const require = __loutreCreateRequire(import.meta.url); const __filename = __loutreFileURLToPath(import.meta.url); const __dirname = __loutreDirname(__filename);",
          },
        }
      : {}),
    sourcemap: 'inline',
    metafile: true,
  })
  return Object.keys(result.metafile.inputs).map((path) =>
    resolve(workingDirectory, path),
  )
}

export async function importHttpApplication(
  output: string,
): Promise<HostedHttpApplication> {
  const definition = await importApplicationDefinition(output)
  const graph = compileDefinition(definition)
  if (
    !graph.executions.some(
      (execution) =>
        execution.kind === 'protocol' && execution.protocol === 'http',
    )
  ) {
    throw new Error(
      'LUTRE_CLI_HTTP_REQUIRED: dev/startにはHTTP executionを持つApplicationが必要です。',
    )
  }
  return bootstrap(definition) as unknown as HostedHttpApplication
}

async function importApplicationDefinition(
  output: string,
): Promise<ApplicationDefinition> {
  const module = await import(`${pathToFileURL(output).href}?loutre=${Date.now()}`)
  const application = module.default ?? module.application
  if (!application || application.kind !== 'application-definition') {
    throw new Error(
      'Application entryはdefaultまたはapplication named exportとしてApplicationDefinitionを公開する必要があります。',
    )
  }
  return application as ApplicationDefinition
}

function compileDefinition(definition: ApplicationDefinition): ApplicationGraphIR {
  return assertValidCompilation(
    compileApplication({
      modules: definition.modules,
      entrypoints: definition.entrypoints,
      schedules: definition.schedules,
      queues: definition.queues,
      consumers: definition.consumers,
    }),
  )
}

export async function loadApplicationDefinition(
  entry: string,
): Promise<ApplicationDefinition> {
  const directory = await mkdtemp(join(tmpdir(), 'loutre-definition-'))
  const output = join(directory, 'application.mjs')
  try {
    await emitApplication(entry, output, { nodeCompatibility: true })
    return await importApplicationDefinition(output)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function loadHttpApplication(entry: string): Promise<LoadedApplication> {
  const directory = await mkdtemp(join(tmpdir(), 'loutre-application-'))
  const output = join(directory, 'application.mjs')
  try {
    const sourceFiles = await emitApplication(entry, output, {
      nodeCompatibility: true,
    })
    const application = await importHttpApplication(output)
    return { application, sourceFiles }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function loadApplicationGraph(entry: string): Promise<ApplicationGraphIR> {
  const directory = await mkdtemp(join(tmpdir(), 'loutre-graph-'))
  const output = join(directory, 'application.mjs')
  try {
    await emitApplication(entry, output, { nodeCompatibility: true })
    return compileDefinition(await importApplicationDefinition(output))
  } catch (error) {
    const graph = (error as { readonly graph?: unknown })?.graph
    if (graph && typeof graph === 'object' && 'version' in graph) {
      return graph as ApplicationGraphIR
    }
    throw error
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
