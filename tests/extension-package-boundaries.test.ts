import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repository = resolve(import.meta.dirname, '..')
const extensionPackages = [
  'http',
  'websocket',
  'tasks',
  'message-port',
] as const
const extensionPackageNames = extensionPackages.map(
  (name) => `@loutrejs/${name}`,
)
const allowedExtensionDependencies: Readonly<
  Record<(typeof extensionPackages)[number], ReadonlySet<string>>
> = {
  http: new Set(),
  websocket: new Set(['http']),
  tasks: new Set(),
  'message-port': new Set(),
}

function packageImportPattern(specifier: string): RegExp {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(?:from\\s*|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)['"]${escaped}`,
    'u',
  )
}

describe('Execution Extension package境界', () => {
  it.each(extensionPackages)(
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

  it.each(extensionPackages)(
    '@loutrejs/%sのExtension間依存は明示allowlistに従う',
    async (packageName) => {
      const sources = await readTypeScriptSources(
        resolve(repository, 'packages', packageName, 'src'),
      )
      for (const dependency of extensionPackages) {
        if (dependency === packageName) continue
        if (allowedExtensionDependencies[packageName].has(dependency)) continue
        const forbidden = packageImportPattern(`@loutrejs/${dependency}`)
        for (const [path, source] of sources) {
          expect(source, path).not.toMatch(forbidden)
        }
      }
    },
  )

  it('@loutrejs/nodeはlegacy HTTP subpathへ依存しない', async () => {
    const sources = await readTypeScriptSources(
      resolve(repository, 'packages', 'node', 'src'),
    )
    const forbidden = packageImportPattern('@loutrejs/loutre/http')

    for (const [path, source] of sources) {
      expect(source, path).not.toMatch(forbidden)
    }
  })

  it('examplesはlegacy HTTP / MessagePort subpathを使わない', async () => {
    const sources = await readTypeScriptSources(resolve(repository, 'examples'))
    const http = packageImportPattern('@loutrejs/loutre/http')
    const messagePort = packageImportPattern('@loutrejs/loutre/message-port')

    for (const [path, source] of sources) {
      expect(source, path).not.toMatch(http)
      expect(source, path).not.toMatch(messagePort)
    }
  })

  it('Core packageはmanifestとsourceの両方でExecution Extensionへ依存しない', async () => {
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
    const sources = await readTypeScriptSources(
      resolve(repository, 'packages', 'loutre', 'src'),
    )

    for (const packageName of extensionPackageNames) {
      expect(dependencies, packageName).not.toHaveProperty(packageName)
      const forbidden = packageImportPattern(packageName)
      for (const [path, source] of sources) {
        expect(source, path).not.toMatch(forbidden)
      }
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
