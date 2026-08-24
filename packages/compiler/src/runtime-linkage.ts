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
}

export interface RuntimeLinkageFragmentPlan {
  readonly file: string
  readonly exportName: string
  readonly bindings: readonly RuntimeLinkageBindingPlan[]
}

export interface RuntimeLinkagePlan {
  readonly manifest: SourceApplicationManifest
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
  for (const constructor of manifest.constructors) {
    const current = constructorsByName.get(constructor.className) ?? []
    current.push(constructor)
    constructorsByName.set(constructor.className, current)
  }

  const managedNames = new Set<string>()
  for (const implementation of manifest.implementations) {
    if (isIdentifier(implementation.implementation)) {
      managedNames.add(implementation.implementation)
    }
  }
  for (const provider of manifest.providers) {
    if (isIdentifier(provider)) managedNames.add(provider)
    for (const name of readManagedProviderClasses(provider)) managedNames.add(name)
  }

  const selected = new Map<string, SourceConstructorIR>()
  const select = (name: string) => {
    if (selected.has(name)) return
    const matches = constructorsByName.get(name) ?? []
    if (matches.length === 0) return
    if (matches.length > 1) {
      throw new Error(
        `${name}のconstructor declarationが複数あり、Runtime linkageを一意に生成できません`,
      )
    }
    const constructor = matches[0]!
    selected.set(name, constructor)
    for (const dependency of constructor.dependencies) {
      if (isIdentifier(dependency.reference)) select(dependency.reference)
    }
  }
  for (const name of managedNames) select(name)

  const byFile = new Map<string, RuntimeLinkageBindingPlan[]>()
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
    current.push({
      target: constructor.className,
      dependencies: constructor.dependencies.map(({ reference }) => reference),
    })
    byFile.set(file, current)
  }

  const fingerprint = createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex')
  const fragments = [...byFile.entries()].map(([file, bindings]) => ({
    file,
    exportName: `__loutre_runtime_linkage_${createHash('sha256').update(file).digest('hex').slice(0, 12)}`,
    bindings,
  }))
  return { manifest, fingerprint, entry, fragments }
}

export function transformSourceForRuntimeLinkage(
  source: string,
  plan: RuntimeLinkageFragmentPlan,
): string {
  const runtimeReferences = new Set(
    plan.bindings.flatMap((binding) => [
      binding.target,
      ...binding.dependencies.flatMap(firstIdentifier),
    ]),
  )
  const transformed = makeRuntimeImportsAvailable(source, runtimeReferences)
  const bindings = plan.bindings
    .map(
      ({ target, dependencies }) =>
        `[${target}, [${dependencies.join(', ')}]]`,
    )
    .join(', ')
  return `${transformed}\nexport const ${plan.exportName} = { bindings: [${bindings}] } as const\n`
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
import { linkApplication as __loutreLinkApplication } from '@loutrefw/runtime/internal'
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

function makeRuntimeImportsAvailable(
  source: string,
  references: ReadonlySet<string>,
): string {
  return source
    .replace(
      /import\s+type\s*\{([^}]+)\}\s+from\s+(['"][^'"]+['"])/g,
      (statement, members: string, moduleName: string) => {
        const parsed = members.split(',').map((member) => member.trim()).filter(Boolean)
        const runtime = parsed.filter((member) =>
          references.has(member.split(/\s+as\s+/).at(-1) ?? member),
        )
        if (runtime.length === 0) return statement
        const typeOnly = parsed.filter((member) => !runtime.includes(member))
        return [
          typeOnly.length > 0
            ? `import type { ${typeOnly.join(', ')} } from ${moduleName}`
            : '',
          `import { ${runtime.join(', ')} } from ${moduleName}`,
        ]
          .filter(Boolean)
          .join('\n')
      },
    )
    .replace(
      /import\s*\{([^}]+)\}\s+from\s+(['"][^'"]+['"])/g,
      (statement, members: string, moduleName: string) => {
        const parsed = members.split(',').map((member) => member.trim()).filter(Boolean)
        let changed = false
        const updated = parsed.map((member) => {
          const value = member.replace(/^type\s+/, '')
          const localName = value.split(/\s+as\s+/).at(-1) ?? value
          if (value !== member && references.has(localName)) {
            changed = true
            return value
          }
          return member
        })
        return changed
          ? `import { ${updated.join(', ')} } from ${moduleName}`
          : statement
      },
    )
    .replace(
      /import\s+type\s+([A-Za-z_$][\w$]*)\s+from\s+(['"][^'"]+['"])/g,
      (statement, name: string, moduleName: string) =>
        references.has(name) ? `import ${name} from ${moduleName}` : statement,
    )
    .replace(
      /import\s+type\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(['"][^'"]+['"])/g,
      (statement, name: string, moduleName: string) =>
        references.has(name)
          ? `import * as ${name} from ${moduleName}`
          : statement,
    )
}

function firstIdentifier(reference: string): string[] {
  const match = /^[A-Za-z_$][\w$]*/.exec(reference.trim())
  return match ? [match[0]] : []
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value)
}

function readManagedProviderClasses(source: string): string[] {
  const classes: string[] = []
  for (const match of source.matchAll(/\.useClass\(\s*([A-Za-z_$][\w$]*)/g)) {
    if (match[1]) classes.push(match[1])
  }
  const mapping = /\.select\([\s\S]*?\{([\s\S]*?)\}\s*\)/.exec(source)?.[1]
  if (mapping) {
    for (const match of mapping.matchAll(/:\s*([A-Za-z_$][\w$]*)/g)) {
      if (match[1]) classes.push(match[1])
    }
  }
  return classes
}
