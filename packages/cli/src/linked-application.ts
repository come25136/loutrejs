import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createRuntimeLinkageBootstrap,
  transformSourceForRuntimeLinkage,
  type RuntimeLinkagePlan,
} from '@loutrejs/compiler'
import type { HttpApplication } from '@loutrejs/http'
import { build as buildWithEsbuild, type Loader, type Plugin } from 'esbuild'

export async function emitLinkedApplication(
  plan: RuntimeLinkagePlan,
  output: string,
): Promise<readonly string[]> {
  const workingDirectory = dirname(plan.entry)
  const result = await buildWithEsbuild({
    absWorkingDir: workingDirectory,
    stdin: {
      contents: createRuntimeLinkageBootstrap(plan),
      loader: 'ts',
      resolveDir: dirname(plan.entry),
      sourcefile: 'loutre-generated-bootstrap.ts',
    },
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2024',
    conditions: [],
    mainFields: ['module', 'main'],
    sourcemap: 'inline',
    metafile: true,
    plugins: [runtimeLinkagePlugin(plan)],
  })
  return Object.keys(result.metafile.inputs)
    .filter((path) => path !== 'loutre-generated-bootstrap.ts')
    .map((path) => resolve(workingDirectory, path))
}

export async function importHttpApplication(
  output: string,
): Promise<HttpApplication> {
  const module = await import(`${pathToFileURL(output).href}?loutre=${Date.now()}`)
  const application = module.default ?? module.application
  if (
    !application ||
    typeof application.initialize !== 'function' ||
    typeof application.shutdown !== 'function' ||
    typeof application.onServerListening !== 'function' ||
    typeof application.handle !== 'function'
  ) {
    throw new Error(
      'Application entryはdefaultまたはapplication named exportとしてHttpApplicationを公開する必要があります。',
    )
  }
  return application as HttpApplication
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
