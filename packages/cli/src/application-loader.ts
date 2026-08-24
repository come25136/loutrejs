import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ApplicationGraphIR } from '@loutrejs/graph'
import type { HttpApplication } from '@loutrejs/http'
import { build as buildWithEsbuild } from 'esbuild'

export interface LoadedApplication {
  readonly application: HttpApplication
  readonly sourceFiles: readonly string[]
}

interface FrameworkApplication {
  readonly graph: ApplicationGraphIR
  initialize(): Promise<void>
  shutdown(signal?: string): Promise<void>
}

export async function emitApplication(
  entry: string,
  output: string,
): Promise<readonly string[]> {
  await mkdir(dirname(output), { recursive: true })
  const workingDirectory = dirname(entry)
  const result = await buildWithEsbuild({
    absWorkingDir: workingDirectory,
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2024',
    conditions: [],
    mainFields: ['module', 'main'],
    sourcemap: 'inline',
    metafile: true,
  })
  return Object.keys(result.metafile.inputs).map((path) =>
    resolve(workingDirectory, path),
  )
}

export async function importHttpApplication(
  output: string,
): Promise<HttpApplication> {
  const application = await importApplication(output)
  if (
    typeof (application as Partial<HttpApplication>).onServerListening !== 'function' ||
    typeof (application as Partial<HttpApplication>).handle !== 'function'
  ) {
    throw new Error(
      'Application entryはdefaultまたはapplication named exportとしてHttpApplicationを公開する必要があります。',
    )
  }
  return application as HttpApplication
}

async function importApplication(output: string): Promise<FrameworkApplication> {
  const module = await import(`${pathToFileURL(output).href}?loutre=${Date.now()}`)
  const application = module.default ?? module.application
  if (
    !application ||
    typeof application.initialize !== 'function' ||
    typeof application.shutdown !== 'function' ||
    !application.graph
  ) {
    throw new Error(
      'Application entryはdefaultまたはapplication named exportとしてLoutre Applicationを公開する必要があります。',
    )
  }
  return application as FrameworkApplication
}

export async function loadHttpApplication(entry: string): Promise<LoadedApplication> {
  const directory = await mkdtemp(join(tmpdir(), 'loutre-application-'))
  const output = join(directory, 'application.mjs')
  try {
    const sourceFiles = await emitApplication(entry, output)
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
    await emitApplication(entry, output)
    return (await importApplication(output)).graph
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
