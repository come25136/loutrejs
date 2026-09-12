import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repository = resolve(import.meta.dirname, '..')
const externalExtensionPackages = [
  'websocket',
  'tasks',
  'message-port',
] as const
const externalExtensionPackageNames = externalExtensionPackages.map(
  (name) => `@loutrejs/${name}`,
)

function packageImportPattern(specifier: string): RegExp {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(?:from\\s*|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)['"]${escaped}`,
    'u',
  )
}

describe('Execution Extension package境界', () => {
  it('HTTPは独立packageを作らず@loutrejs/loutre/http subpathとして公開する', async () => {
    const packages = await readdir(resolve(repository, 'packages'))
    expect(packages).not.toContain('http')

    const manifest = JSON.parse(
      await readFile(
        resolve(repository, 'packages/loutre/package.json'),
        'utf8',
      ),
    ) as {
      readonly exports?: Readonly<Record<string, unknown>>
    }
    expect(Object.keys(manifest.exports ?? {}).toSorted()).toEqual(
      [
        '.',
        './graph',
        './http',
        './http/openapi',
        './presentation',
        './runtime',
        './runtime/aws-lambda',
        './runtime/bun',
        './runtime/cloudflare-workers',
        './runtime/deno',
        './runtime/electron',
      ].toSorted(),
    )
  })

  it.each(['tasks', 'message-port'] as const)(
    '@loutrejs/%sはCoreの公開rootだけに依存する',
    async (packageName) => {
      const sources = await readTypeScriptSources(
        resolve(repository, 'packages', packageName, 'src'),
      )
      const forbidden = packageImportPattern('@loutrejs/loutre/')

      for (const [path, source] of sources) {
        expect(source, path).not.toMatch(forbidden)
      }
    },
  )

  it('@loutrejs/websocketはHTTP integration以外のCore subpathへ依存しない', async () => {
    const sources = await readTypeScriptSources(
      resolve(repository, 'packages/websocket/src'),
    )
    const subpathImport =
      /(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)['"](@loutrejs\/loutre\/[^'"]+)/gu

    for (const [path, source] of sources) {
      const imports = [...source.matchAll(subpathImport)].map(
        (match) => match[1],
      )
      expect(imports, path).toEqual(
        imports.filter((specifier) => specifier === '@loutrejs/loutre/http'),
      )
    }
  })

  it.each(externalExtensionPackages)(
    '@loutrejs/%sは他の独立Execution Extension packageへ依存しない',
    async (packageName) => {
      const sources = await readTypeScriptSources(
        resolve(repository, 'packages', packageName, 'src'),
      )
      for (const dependency of externalExtensionPackages) {
        if (dependency === packageName) continue
        const forbidden = packageImportPattern(`@loutrejs/${dependency}`)
        for (const [path, source] of sources) {
          expect(source, path).not.toMatch(forbidden)
        }
      }
    },
  )

  it('@loutrejs/nodeは新HTTP subpathをruntime bindingとして利用する', async () => {
    const source = await readFile(
      resolve(repository, 'packages/node/src/index.ts'),
      'utf8',
    )
    expect(source).toMatch(packageImportPattern('@loutrejs/loutre/http'))
    expect(source).not.toMatch(packageImportPattern('@loutrejs/http'))
  })

  it('examplesはHTTPをmain package subpathから利用する', async () => {
    const sources = await readTypeScriptSources(resolve(repository, 'examples'))
    const standaloneHttp = packageImportPattern('@loutrejs/http')

    for (const [path, source] of sources) {
      expect(source, path).not.toMatch(standaloneHttp)
    }
  })

  it('Core package manifestは独立Execution Extension packageへ依存しない', async () => {
    const manifest = JSON.parse(
      await readFile(
        resolve(repository, 'packages/loutre/package.json'),
        'utf8',
      ),
    ) as {
      readonly dependencies?: Readonly<Record<string, string>>
      readonly peerDependencies?: Readonly<Record<string, string>>
      readonly devDependencies?: Readonly<Record<string, string>>
    }
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
    }

    expect(dependencies).not.toHaveProperty('@loutrejs/http')
    for (const packageName of externalExtensionPackageNames) {
      expect(dependencies, packageName).not.toHaveProperty(packageName)
    }
  })
})

async function readTypeScriptSources(
  directory: string,
): Promise<ReadonlyMap<string, string>> {
  const sources = new Map<string, string>()
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      for (const [childPath, source] of await readTypeScriptSources(path)) {
        sources.set(childPath, source)
      }
      continue
    }
    if (entry.name.endsWith('.ts')) {
      sources.set(path, await readFile(path, 'utf8'))
    }
  }
  return sources
}
