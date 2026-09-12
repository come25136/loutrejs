import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ApplicationDefinition } from '@loutrejs/loutre'
import {
  projectApplicationModel,
  type ApplicationModelGraphIR,
} from '@loutrejs/loutre/graph'
import { build as buildWithEsbuild, type Loader, type Plugin } from 'esbuild'
import { instrumentSourceLocations } from './source-instrumentation.js'

export interface EmitApplicationOptions {
  readonly nodeCompatibility?: boolean
  readonly projectRoot?: string
  readonly sourceLocations?: boolean
}

export async function emitApplication(
  entry: string,
  output: string,
  options: EmitApplicationOptions = {},
): Promise<readonly string[]> {
  await mkdir(dirname(output), { recursive: true })
  const workingDirectory = dirname(entry)
  const projectRoot = resolve(options.projectRoot ?? process.cwd())
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
    plugins:
      options.sourceLocations === false
        ? []
        : [sourceLocationPlugin(projectRoot)],
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
  if (!application.model || application.model.kind !== 'application-model') {
    throw new Error(
      'ApplicationDefinition must contain a compiled Application Model.',
    )
  }
  return application as ApplicationDefinition
}

export async function loadApplicationDefinition(
  entry: string,
  options: Pick<EmitApplicationOptions, 'projectRoot' | 'sourceLocations'> = {},
): Promise<ApplicationDefinition> {
  const directory = await mkdtemp(join(tmpdir(), 'loutre-definition-'))
  const output = join(directory, 'application.mjs')
  try {
    await emitApplication(entry, output, {
      nodeCompatibility: true,
      ...options,
    })
    return await importApplicationDefinition(output)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function loadApplicationGraph(
  entry: string,
  options: Pick<EmitApplicationOptions, 'projectRoot' | 'sourceLocations'> = {},
): Promise<ApplicationModelGraphIR> {
  const definition = await loadApplicationDefinition(entry, options)
  return projectApplicationModel(definition.model)
}

const loutrePackageRoots = [
  resolve(
    dirname(fileURLToPath(import.meta.resolve('@loutrejs/loutre'))),
    '..',
  ),
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'loutre'),
] as const

function sourceLocationPlugin(projectRoot: string): Plugin {
  return {
    name: 'loutre-source-locations',
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        if (loutrePackageRoots.some((root) => isWithin(args.path, root))) {
          return undefined
        }
        const loader = sourceLoader(args.path)
        if (!loader) return undefined
        const source = await readFile(args.path, 'utf8')
        const contents = instrumentSourceLocations(
          source,
          args.path,
          projectRoot,
        )
        if (contents === source) return undefined
        return { contents, loader, resolveDir: dirname(args.path) }
      })
    },
  }
}

function sourceLoader(file: string): Loader | undefined {
  switch (extname(file)) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'ts'
    case '.tsx':
      return 'tsx'
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'js'
    case '.jsx':
      return 'jsx'
    default:
      return undefined
  }
}

function isWithin(file: string, directory: string): boolean {
  const normalized = resolve(file)
  const root = `${resolve(directory)}${sep}`
  return normalized === resolve(directory) || normalized.startsWith(root)
}
