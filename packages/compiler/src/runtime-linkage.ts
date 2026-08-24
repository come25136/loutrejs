import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import {
  compileTypeScriptSource,
  type SourceApplicationManifest,
  type SourceCompilerOptions,
  type SourceCompilerSession,
  type SourceConstructorIR,
} from './source-compiler.js'

export interface RuntimeLinkageBindingPlan {
  readonly target: string
  readonly dependencies: readonly string[]
  readonly runtimeDependencies?: readonly string[]
}

export interface RuntimeLinkageImportPlan {
  readonly module: string
  readonly kind: 'named' | 'default' | 'namespace'
  readonly alias: string
  readonly imported?: string
}

export interface RuntimeLinkageFragmentPlan {
  readonly file: string
  readonly exportName: string
  readonly bindings: readonly RuntimeLinkageBindingPlan[]
  readonly imports: readonly RuntimeLinkageImportPlan[]
}

export interface RuntimeLinkagePlan {
  readonly manifest: SourceApplicationManifest
  readonly graphManifest: Readonly<Record<string, unknown>>
  readonly fingerprint: string
  readonly entry: string
  readonly fragments: readonly RuntimeLinkageFragmentPlan[]
}

export function createRuntimeLinkagePlan(
  options: SourceCompilerOptions & { readonly entry: string },
  compiler?: Pick<SourceCompilerSession, 'compile'>,
): RuntimeLinkagePlan {
  const entry = resolve(options.entry)
  const manifest = compiler
    ? compiler.compile({ ...options, entry })
    : compileTypeScriptSource({ ...options, entry })
  if (manifest.diagnostics.length > 0) {
    throw new Error(
      manifest.diagnostics
        .map((diagnostic) => `${diagnostic.code} ${diagnostic.path}\n${diagnostic.message}`)
        .join('\n'),
    )
  }

  const constructorsByName = new Map<string, SourceConstructorIR[]>()
  const constructorsBySymbol = new Map<number, SourceConstructorIR>()
  for (const constructor of manifest.constructors) {
    const current = constructorsByName.get(constructor.className) ?? []
    current.push(constructor)
    constructorsByName.set(constructor.className, current)
    if (constructor.symbol !== undefined) {
      constructorsBySymbol.set(constructor.symbol, constructor)
    }
  }

  const managedSymbols = new Set<number>()
  const managedNames = new Set<string>()
  for (const implementation of manifest.implementations) {
    if (implementation.implementationSymbol !== undefined) {
      managedSymbols.add(implementation.implementationSymbol)
    } else {
      managedNames.add(implementation.implementation)
    }
  }
  for (const provider of manifest.managedProviders) {
    managedSymbols.add(provider.symbol)
  }

  const selected = new Map<string, SourceConstructorIR>()
  const selectConstructor = (constructor: SourceConstructorIR | undefined) => {
    if (!constructor) return
    const key = `${constructor.location.file}:${constructor.location.line}:${constructor.location.column}`
    if (selected.has(key)) return
    selected.set(key, constructor)
    for (const dependency of constructor.dependencies) {
      if (dependency.symbol !== undefined) {
        selectConstructor(constructorsBySymbol.get(dependency.symbol))
      }
    }
  }
  const selectName = (name: string) => {
    const matches = constructorsByName.get(name) ?? []
    if (matches.length === 0) return
    if (matches.length > 1) {
      throw new Error(
        `${name}のconstructor declarationが複数あり、Runtime linkageを一意に生成できません`,
      )
    }
    selectConstructor(matches[0])
  }
  for (const symbol of managedSymbols) {
    selectConstructor(constructorsBySymbol.get(symbol))
  }
  for (const name of managedNames) selectName(name)

  const byFile = new Map<string, RuntimeLinkageBindingPlan[]>()
  const importsByFile = new Map<string, RuntimeLinkageImportPlan[]>()
  for (const constructor of selected.values()) {
    if (constructor.dependencies.length === 0) continue
    const indices = constructor.dependencies.map(({ index }) => index)
    if (indices.some((index, position) => index !== position)) {
      throw new Error(
        `${constructor.className}のconstructor dependencyは省略せず先頭から連続して宣言してください`,
      )
    }
    const file = resolve(constructor.location.file)
    const current = byFile.get(file) ?? []
    const runtimeImports = importsByFile.get(file) ?? []
    const runtimeDependencies = constructor.dependencies.map((dependency) =>
      runtimeReference(
        dependency.reference,
        dependency.rootReference,
        file,
        manifest.runtimeImports,
        runtimeImports,
      ),
    )
    current.push({
      target: constructor.className,
      dependencies: constructor.dependencies.map(({ reference }) => reference),
      ...(runtimeDependencies.every(
        (dependency, index) =>
          dependency === constructor.dependencies[index]?.reference,
      )
        ? {}
        : { runtimeDependencies }),
    })
    byFile.set(file, current)
    importsByFile.set(file, runtimeImports)
  }

  const graphManifest = createGraphManifest(manifest)
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(graphManifest))
    .digest('hex')
  const fragments = [...byFile.entries()].map(([file, bindings]) => ({
    file,
    exportName: `__loutre_runtime_linkage_${createHash('sha256').update(file).digest('hex').slice(0, 12)}`,
    bindings,
    imports: importsByFile.get(file) ?? [],
  }))
  return { manifest, graphManifest, fingerprint, entry, fragments }
}

function createGraphManifest(
  manifest: SourceApplicationManifest,
): Readonly<Record<string, unknown>> {
  const { runtimeImports: _runtimeImports, managedProviders: _managedProviders, ...publicManifest } =
    manifest
  return JSON.parse(
    JSON.stringify(publicManifest, (key, value) =>
      key === 'symbol' || key === 'implementationSymbol' || key === 'rootReference'
        ? undefined
        : value,
    ),
  ) as Readonly<Record<string, unknown>>
}

export function transformSourceForRuntimeLinkage(
  source: string,
  plan: RuntimeLinkageFragmentPlan,
): string {
  const imports = plan.imports.map(renderRuntimeImport).join('\n')
  const bindings = plan.bindings
    .map(
      ({ target, dependencies, runtimeDependencies }) =>
        `[${target}, [${(runtimeDependencies ?? dependencies).join(', ')}]]`,
    )
    .join(', ')
  return `${source}\n${imports}${imports === '' ? '' : '\n'}export const ${plan.exportName} = { bindings: [${bindings}] } as const\n`
}

export function createRuntimeLinkageBootstrap(plan: RuntimeLinkagePlan): string {
  const fragmentImports = plan.fragments
    .map(
      (fragment, index) =>
        `import { ${fragment.exportName} as __loutreFragment${index} } from ${JSON.stringify(fragment.file)}`,
    )
    .join('\n')
  const fragmentBindings = plan.fragments
    .map((_fragment, index) => `...__loutreFragment${index}.bindings`)
    .join(', ')
  return `
import * as __loutreEntry from ${JSON.stringify(plan.entry)}
import { linkApplication as __loutreLinkApplication } from '@loutrejs/runtime/internal'
${fragmentImports}

const __loutreExports = __loutreEntry as Record<string, unknown>
const __loutreApplication = __loutreExports['default'] ?? __loutreExports['application']
if (!__loutreApplication) {
  throw new Error('Application entryはdefaultまたはapplication named exportが必要です')
}

export default __loutreLinkApplication(__loutreApplication, {
  graph: { version: 1, fingerprint: ${JSON.stringify(plan.fingerprint)} },
  linkage: {
    version: 1,
    fingerprint: ${JSON.stringify(plan.fingerprint)},
    bindings: [${fragmentBindings}],
  },
})
`
}

function runtimeReference(
  reference: string,
  rootReference: string,
  file: string,
  sourceImports: SourceApplicationManifest['runtimeImports'],
  generatedImports: RuntimeLinkageImportPlan[],
): string {
  const sourceImport = sourceImports.find(
    (candidate) =>
      resolve(candidate.file) === file &&
      candidate.local === rootReference &&
      candidate.typeOnly,
  )
  if (!sourceImport) return reference
  let generated = generatedImports.find(
    (candidate) =>
      candidate.module === sourceImport.module &&
      candidate.kind === sourceImport.kind &&
      candidate.imported === sourceImport.imported,
  )
  if (!generated) {
    generated = {
      module: sourceImport.module,
      kind: sourceImport.kind,
      alias: `__loutreRuntimeReference${generatedImports.length}`,
      ...(sourceImport.imported === undefined
        ? {}
        : { imported: sourceImport.imported }),
    }
    generatedImports.push(generated)
  }
  return `${generated.alias}${reference.slice(rootReference.length)}`
}

function renderRuntimeImport(plan: RuntimeLinkageImportPlan): string {
  const module = JSON.stringify(plan.module)
  if (plan.kind === 'default') return `import ${plan.alias} from ${module}`
  if (plan.kind === 'namespace') return `import * as ${plan.alias} from ${module}`
  return `import { ${plan.imported} as ${plan.alias} } from ${module}`
}
