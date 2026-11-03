import { absoluteFsPath, fileUrl, type AbsoluteFsPath } from './paths.js'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build as buildWithEsbuild, type Loader, type Plugin } from 'esbuild'
import { match } from 'ts-pattern'
import { instrumentSourceLocations } from './source-instrumentation.js'

export interface EmitEntryOptions {
  readonly nodeCompatibility?: boolean
  readonly projectRoot?: string
  readonly sourceLocations?: boolean
}

export interface LoadEntryOptions {
  readonly projectRoot?: string
  readonly sourceLocations?: boolean
}

export interface LoadedEntry {
  readonly value: unknown
  readonly files: readonly AbsoluteFsPath[]
}

export async function emitEntry(
  entryInput: string,
  outputInput: string,
  options: EmitEntryOptions = {},
): Promise<readonly AbsoluteFsPath[]> {
  const entry = absoluteFsPath(entryInput)
  const output = absoluteFsPath(outputInput)
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
    mainFields: options.nodeCompatibility ? ['main'] : ['module', 'main'],
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
    plugins: [
      ...(options.nodeCompatibility ? [nodeDependencyPlugin()] : []),
      ...(options.sourceLocations === true
        ? [sourceLocationPlugin(projectRoot)]
        : []),
    ],
  })
  return Object.keys(result.metafile.inputs).map((path) =>
    absoluteFsPath(workingDirectory, path),
  )
}

async function importEntry(output: AbsoluteFsPath): Promise<unknown> {
  const module = await import(`${fileUrl(output)}?loutre=${Date.now()}`)
  if (!('default' in module) || module.default === undefined) {
    throw new Error('Loutre entry must have a default export.')
  }
  return module.default
}

export async function loadEntryWithFiles(
  entry: string,
  options: LoadEntryOptions = {},
): Promise<LoadedEntry> {
  const directory = await mkdtemp(join(tmpdir(), 'loutre-entry-'))
  const output = absoluteFsPath(directory, 'entry.mjs')
  try {
    const files = await emitEntry(entry, output, {
      nodeCompatibility: true,
      ...options,
    })
    return {
      value: await importEntry(output),
      files,
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function loadEntry(
  entry: string,
  options: LoadEntryOptions = {},
): Promise<unknown> {
  return (await loadEntryWithFiles(entry, options)).value
}

const loutrePackageRoots = [
  resolve(
    dirname(fileURLToPath(import.meta.resolve('@loutrejs/loutre'))),
    '..',
  ),
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'loutre'),
] as const

function nodeDependencyPlugin(): Plugin {
  const resolving = Symbol('loutre-node-dependency')
  return {
    name: 'loutre-node-dependencies',
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.kind === 'entry-point' || args.pluginData === resolving) {
          return undefined
        }
        const result = await build.resolve(args.path, {
          importer: args.importer,
          resolveDir: args.resolveDir,
          kind: args.kind,
          pluginData: resolving,
        })
        if (
          result.external ||
          !result.path.split(sep).includes('node_modules')
        ) {
          return undefined
        }
        // bare specifierは一時出力先から解決できず、bundleするとnative addonの配置を失う。
        const path =
          args.kind === 'require-call' || args.kind === 'require-resolve'
            ? result.path
            : pathToFileURL(result.path).href
        return { path, external: true }
      })
    },
  }
}

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
  return match(extname(file))
    .with('.ts', '.mts', '.cts', () => 'ts' as const)
    .with('.tsx', () => 'tsx' as const)
    .with('.js', '.mjs', '.cjs', () => 'js' as const)
    .with('.jsx', () => 'jsx' as const)
    .otherwise(() => undefined)
}

function isWithin(file: string, directory: string): boolean {
  const normalized = resolve(file)
  const root = `${resolve(directory)}${sep}`
  return normalized === resolve(directory) || normalized.startsWith(root)
}
