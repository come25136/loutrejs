import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const repository = resolve(import.meta.dirname, '..')
const report = z.object({
  summary: z.object({
    violations: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        rule: z.object({ name: z.string() }),
      }),
    ),
  }),
})

describe('protocol内の責務境界', () => {
  it.each(['http', 'websocket', 'tasks', 'message-port', 'graphql', 'mcp'])(
    '%sの契約・compiler・Runtimeからの逆依存を拒否する',
    async (protocol) => {
      const directory = await mkdtemp(join(tmpdir(), 'loutre-protocol-layers-'))
      const standalone = protocol === 'graphql' || protocol === 'mcp'
      const root = standalone
        ? `packages/${protocol}/src`
        : `packages/loutre/src/${protocol}`
      const files = {
        'package.json': '{"type":"module"}',
        'tsconfig.json':
          '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext"}}',
        [`${root}/index.ts`]: 'export {}',
        [`${root}/extension.ts`]: 'export {}',
        [`${root}/declaration.ts`]: 'export {}',
        [`${root}/contract.ts`]:
          "import './runtime/dispatch.js'; import './index.js'" +
          (standalone ? "; import '../../loutre/src/http/index.js'" : ''),
        [`${root}/compiled.ts`]: "import './declaration.js'",
        [`${root}/compiler.ts`]:
          "import './declaration.js'; import './compiled.js'; import './index.js'" +
          (standalone ? "; import '../../loutre/src/http/index.js'" : ''),
        [`${root}/runtime/dispatch.ts`]: "import '../compiled.js'",
        [`${root}/runtime/invalid.ts`]:
          "import '../extension.js'; import '../index.js'",
        ...(standalone
          ? {
              'packages/loutre/src/http/index.ts': 'export {}',
            }
          : {}),
      }
      try {
        await Promise.all(
          Object.entries(files).map(async ([path, contents]) => {
            const target = join(directory, path)
            await mkdir(dirname(target), { recursive: true })
            await writeFile(target, contents)
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
        const violations = report.parse(JSON.parse(result.stdout)).summary
          .violations
        expect(violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              from: `${root}/contract.ts`,
              to: `${root}/runtime/dispatch.ts`,
              rule: expect.objectContaining({
                name: 'protocolの契約を実行実装と宣言APIから分離する',
              }),
            }),
            expect.objectContaining({
              from: `${root}/contract.ts`,
              to: `${root}/index.ts`,
              rule: expect.objectContaining({
                name: expect.stringContaining(
                  'protocolの契約を自身の公開facadeから分離する:',
                ),
              }),
            }),
            expect.objectContaining({
              from: `${root}/compiled.ts`,
              to: `${root}/declaration.ts`,
              rule: expect.objectContaining({
                name: 'protocolの契約を実行実装と宣言APIから分離する',
              }),
            }),
            expect.objectContaining({
              from: `${root}/compiler.ts`,
              to: `${root}/declaration.ts`,
              rule: expect.objectContaining({
                name: 'protocolのcompileを宣言APIと実行状態から分離する',
              }),
            }),
            expect.objectContaining({
              from: `${root}/runtime/invalid.ts`,
              to: `${root}/extension.ts`,
              rule: expect.objectContaining({
                name: expect.stringContaining(
                  'protocolのRuntimeを登録と公開facadeから分離する:',
                ),
              }),
            }),
            expect.objectContaining({
              from: `${root}/compiler.ts`,
              to: `${root}/index.ts`,
              rule: expect.objectContaining({
                name: expect.stringContaining(
                  'protocolのcompileを自身の公開facadeから分離する:',
                ),
              }),
            }),
            expect.objectContaining({
              from: `${root}/runtime/invalid.ts`,
              to: `${root}/index.ts`,
              rule: expect.objectContaining({
                name: expect.stringContaining(
                  'protocolのRuntimeを登録と公開facadeから分離する:',
                ),
              }),
            }),
          ]),
        )
        expect(
          violations.some(
            ({ from, to }) =>
              from === `${root}/runtime/dispatch.ts` &&
              to === `${root}/compiled.ts`,
          ),
        ).toBe(false)
        expect(
          violations.some(
            ({ from, to }) =>
              from === `${root}/compiler.ts` && to === `${root}/compiled.ts`,
          ),
        ).toBe(false)
        if (standalone)
          expect(
            violations.some(
              ({ from, to }) =>
                [`${root}/contract.ts`, `${root}/compiler.ts`].includes(from) &&
                to === 'packages/loutre/src/http/index.ts',
            ),
          ).toBe(false)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )
})
