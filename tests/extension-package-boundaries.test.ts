import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repository = resolve(import.meta.dirname, '..')
const publicPackageNames = [
  '@loutrejs/loutre',
  '@loutrejs/node',
  '@loutrejs/bullmq',
  '@loutrejs/cli',
  'create-loutre',
]

type PackageManifest = {
  readonly name: string
  readonly version: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
}

describe('npm package境界', () => {
  it('公開対象を5packageに限定する', async () => {
    const packageDirectories = await readdir(resolve(repository, 'packages'))
    const manifests = await Promise.all(
      packageDirectories.map(async (directory) =>
        JSON.parse(
          await readFile(
            resolve(repository, 'packages', directory, 'package.json'),
            'utf8',
          ),
        ),
      ),
    )

    expect(
      manifests
        .filter((manifest) => manifest.private !== true)
        .map((manifest) => manifest.name)
        .toSorted(),
    ).toEqual(publicPackageNames.toSorted())
  })

  it('protocol extensionをmain packageのsubpathとして公開する', async () => {
    const manifest = JSON.parse(
      await readFile(
        resolve(repository, 'packages/loutre/package.json'),
        'utf8',
      ),
    ) as {
      readonly engines?: Readonly<Record<string, string>>
      readonly exports?: Readonly<Record<string, unknown>>
    }

    expect(manifest.engines).toBeUndefined()
    expect(manifest.exports).toMatchObject({
      './tasks': expect.any(Object),
      './message-port': expect.any(Object),
      './websocket': expect.any(Object),
    })
  })

  it('Node adapterだけがNode minimumをpackage metadataで宣言する', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(repository, 'packages/node/package.json'), 'utf8'),
    ) as { readonly engines?: Readonly<Record<string, string>> }

    expect(manifest.engines?.node).toBe('>=22')
  })

  it(
    'Core値を共有するlibrary packageだけがmain packageをpeerとして要求する',
    async () => {
      const loutre = await readPackageManifest('loutre')
      const compatibleRange = loutreCompatibilityRange(loutre.version)
      const node = await readPackageManifest('node')
      const bullmq = await readPackageManifest('bullmq')

      for (const manifest of [node, bullmq]) {
        expect(manifest.dependencies?.['@loutrejs/loutre']).toBeUndefined()
        expect(manifest.peerDependencies?.['@loutrejs/loutre']).toBe(
          compatibleRange,
        )
      }

      for (const directory of ['cli', 'create-loutre']) {
        const manifest = await readPackageManifest(directory)
        expect(manifest.dependencies?.['@loutrejs/loutre']).toBeDefined()
        expect(manifest.peerDependencies?.['@loutrejs/loutre']).toBeUndefined()
      }
    },
  )

  it('protocol extensionのruntime identityをnpm package名から独立させる', async () => {
    const identities = await Promise.all(
      ['http', 'tasks', 'message-port', 'websocket'].map(async (name) => {
        const path =
          name === 'http'
            ? resolve(repository, 'packages/loutre/src/http/extension.ts')
            : resolve(repository, 'packages/loutre/src', name, 'extension.ts')
        const source = await readFile(path, 'utf8')
        return source.match(/name: '(loutre:[^']+)'/u)?.[1]
      }),
    )

    expect(identities).toEqual([
      'loutre:http',
      'loutre:tasks',
      'loutre:message-port',
      'loutre:websocket',
    ])
  })

  it('package consumer CIがmain packageのsubpathだけを検証する', async () => {
    const workflow = await readFile(
      resolve(repository, '.github/workflows/ci.yml'),
      'utf8',
    )

    expect(workflow).not.toMatch(/loutrejs-(?:tasks|message-port|websocket)-/u)
    expect(workflow).not.toMatch(/@loutrejs\/(?:tasks|message-port|websocket)/u)
    expect(workflow).toContain('@loutrejs/loutre/tasks')
  })
})

async function readPackageManifest(directory: string): Promise<PackageManifest> {
  return JSON.parse(
    await readFile(
      resolve(repository, 'packages', directory, 'package.json'),
      'utf8',
    ),
  ) as PackageManifest
}

function loutreCompatibilityRange(version: string): string {
  const [majorText, minorText] = version.split('.')
  const major = Number(majorText)
  const minor = Number(minorText)
  if (!Number.isInteger(major) || !Number.isInteger(minor)) {
    throw new Error(`Invalid Loutre version: ${version}`)
  }
  return major === 0 ? `^0.${minor}.0` : `^${major}.0.0`
}
