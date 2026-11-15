import {
  readFile,
  readdir,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'

const repository = resolve(import.meta.dirname, '..')
const publicPackageNames = [
  '@loutrejs/loutre',
  '@loutrejs/node',
  '@loutrejs/graphql',
  '@loutrejs/mcp',
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
  it.each(['graphql', 'mcp'])(
    '%sの逆依存・runtime固有依存を実際の依存検査で拒否する',
    async (protocol) => {
      const directory = await mkdtemp(
        join(tmpdir(), 'loutre-protocol-boundary-'),
      )
      const sdk =
        protocol === 'graphql' ? 'graphql' : '@modelcontextprotocol/server'
      const files = {
        'package.json': JSON.stringify({
          type: 'module',
          dependencies: { [sdk]: '0.0.0' },
        }),
        'tsconfig.json': JSON.stringify({
          compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext' },
        }),
        'packages/loutre/src/index.ts': 'export {}',
        'packages/node/src/index.ts': 'export {}',
        'packages/node/src/protocol.ts': `import '../../${protocol}/src/index.js'`,
        'packages/loutre/src/core/protocol.ts': `import '../../../${protocol}/src/index.js'`,
        'packages/loutre/src/core/sdk.ts': `import '${sdk}'`,
        [`packages/${protocol}/src/index.ts`]: 'export {}',
        [`packages/${protocol}/src/native.ts`]: "import 'node:fs'",
        [`packages/${protocol}/src/runtime.ts`]:
          "import '../../node/src/index.js'",
        [`packages/${protocol}/src/allowed.ts`]:
          "import '../../loutre/src/index.js'",
        [`node_modules/${sdk}/package.json`]: JSON.stringify({
          name: sdk,
          version: '0.0.0',
          type: 'module',
          exports: './index.js',
        }),
        [`node_modules/${sdk}/index.js`]: 'export {}',
      }
      try {
        await Promise.all(
          Object.entries(files).map(async ([name, content]) => {
            const path = join(directory, name)
            await mkdir(dirname(path), { recursive: true })
            await writeFile(path, content)
          }),
        )
        const result = spawnSync(
          process.execPath,
          [
            resolve(
              repository,
              'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs',
            ),
            '--config',
            resolve(repository, '.dependency-cruiser.cjs'),
            '--output-type',
            'json',
            'packages',
          ],
          { cwd: directory, encoding: 'utf8', timeout: 10_000 },
        )
        expect(result.error).toBeUndefined()
        const parsed = z
          .object({
            summary: z.object({
              violations: z.array(
                z.object({ from: z.string(), to: z.string() }),
              ),
            }),
          })
          .parse(JSON.parse(result.stdout))
        const violations = parsed.summary.violations
        expect(violations).toEqual(
          expect.arrayContaining([
            {
              from: 'packages/node/src/protocol.ts',
              to: `packages/${protocol}/src/index.ts`,
            },
            {
              from: 'packages/loutre/src/core/protocol.ts',
              to: `packages/${protocol}/src/index.ts`,
            },
            {
              from: 'packages/loutre/src/core/sdk.ts',
              to: `node_modules/${sdk}/index.js`,
            },
            { from: `packages/${protocol}/src/native.ts`, to: 'fs' },
            {
              from: `packages/${protocol}/src/runtime.ts`,
              to: 'packages/node/src/index.ts',
            },
          ]),
        )
        expect(
          violations.some(
            (violation) =>
              violation.from === `packages/${protocol}/src/allowed.ts`,
          ),
        ).toBe(false)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it('公開対象が配布するpackageの一覧と一致する', async () => {
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

  it('Core値を共有するlibrary packageだけがmain packageをpeerとして要求する', async () => {
    const loutre = await readPackageManifest('loutre')
    const compatibleRange = `^${loutre.version}`
    const node = await readPackageManifest('node')
    const bullmq = await readPackageManifest('bullmq')

    const graphql = await readPackageManifest('graphql')
    const mcp = await readPackageManifest('mcp')
    for (const manifest of [node, bullmq, graphql, mcp]) {
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
  })

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

async function readPackageManifest(
  directory: string,
): Promise<PackageManifest> {
  return JSON.parse(
    await readFile(
      resolve(repository, 'packages', directory, 'package.json'),
      'utf8',
    ),
  ) as PackageManifest
}
