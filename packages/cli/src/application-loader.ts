import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ApplicationDefinition } from '@loutrejs/loutre'
import {
  assertValidCompilation,
  compileApplication,
  type ApplicationGraphIR,
} from '@loutrejs/loutre/graph'
import { build as buildWithEsbuild, type Plugin } from 'esbuild'

export interface EmitApplicationOptions {
  readonly nodeCompatibility?: boolean
  readonly externalizeLoutre?: boolean
}

const externalLoutreRuntime: Plugin = {
  name: 'external-loutre-runtime',
  setup(build) {
    build.onResolve({ filter: /^@loutrejs\// }, ({ path }) => ({
      path: fileURLToPath(import.meta.resolve(path)),
      external: true,
    }))
  },
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
    plugins: options.externalizeLoutre ? [externalLoutreRuntime] : [],
  })
  return Object.keys(result.metafile.inputs).map((path) =>
    resolve(workingDirectory, path),
  )
}

async function importApplicationDefinition(
  output: string,
): Promise<ApplicationDefinition> {
  const module = await import(
    `${pathToFileURL(output).href}?loutre=${Date.now()}`
  )
  const application = module.default ?? module.application
  if (!application || application.kind !== 'application-definition') {
    throw new Error(
      'Application entry must export an ApplicationDefinition as default or as the named export application.',
    )
  }
  return application as ApplicationDefinition
}

function compileDefinition(
  definition: ApplicationDefinition,
): ApplicationGraphIR {
  return assertValidCompilation(
    compileApplication({
      modules: definition.modules,
      ...(definition.arguments === undefined
        ? {}
        : { arguments: definition.arguments }),
      tasks: definition.tasks,
      triggers: definition.triggers,
    }),
  )
}

export async function loadApplicationDefinition(
  entry: string,
): Promise<ApplicationDefinition> {
  const directory = await mkdtemp(join(tmpdir(), 'loutre-definition-'))
  const output = join(directory, 'application.mjs')
  try {
    await emitApplication(entry, output, {
      nodeCompatibility: true,
      externalizeLoutre: true,
    })
    return await importApplicationDefinition(output)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function loadApplicationGraph(
  entry: string,
): Promise<ApplicationGraphIR> {
  const directory = await mkdtemp(join(tmpdir(), 'loutre-graph-'))
  const output = join(directory, 'application.mjs')
  try {
    await emitApplication(entry, output, {
      nodeCompatibility: true,
      externalizeLoutre: true,
    })
    return compileDefinition(await importApplicationDefinition(output))
  } catch (error) {
    const graph = (error as { readonly graph?: unknown })?.graph
    if (
      graph &&
      typeof graph === 'object' &&
      'diagnostics' in graph &&
      'nodes' in graph &&
      'edges' in graph
    ) {
      return graph as ApplicationGraphIR
    }
    throw error
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
