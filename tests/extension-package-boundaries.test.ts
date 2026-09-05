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

describe('Execution Extension package境界', () => {
  it.each(extensionPackages)(
    '@loutrejs/%sはCoreの公開rootだけに依存する',
    async (packageName) => {
      const sourceDirectory = resolve(
        repository,
        'packages',
        packageName,
        'src',
      )
      const sources = await readTypeScriptSources(sourceDirectory)

      for (const [path, source] of sources) {
        expect(source, path).not.toMatch(
          /(?:from\s+|import\s*\()['"]@loutrejs\/loutre\//u,
        )
      }
    },
  )

  it('@loutrejs/nodeはlegacy HTTP subpathへ依存しない', async () => {
    const sources = await readTypeScriptSources(
      resolve(repository, 'packages', 'node', 'src'),
    )

    for (const [path, source] of sources) {
      expect(source, path).not.toMatch(
        /(?:from\s+|import\s*\()['"]@loutrejs\/loutre\/http['"]/u,
      )
    }
  })

  it('examplesはlegacy HTTP / MessagePort subpathを使わない', async () => {
    const sources = await readTypeScriptSources(resolve(repository, 'examples'))

    for (const [path, source] of sources) {
      expect(source, path).not.toMatch(
        /(?:from\s+|import\s*\()['"]@loutrejs\/loutre\/(?:http|message-port)(?:\/[^'"]+)?['"]/u,
      )
    }
  })

  it('Core packageはExecution Extension packageへ依存しない', async () => {
    const manifest = JSON.parse(
      await readFile(
        resolve(repository, 'packages/loutre/package.json'),
        'utf8',
      ),
    ) as {
      readonly dependencies?: Readonly<Record<string, string>>
      readonly peerDependencies?: Readonly<Record<string, string>>
    }
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    }

    for (const packageName of extensionPackageNames) {
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
