import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
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

describe('外部protocolの契約を所有するmodule', () => {
  it.each(['graphql', 'mcp'])(
    '%sのtypes.tsからの逆依存を拒否する',
    async (protocol) => {
      const root = `packages/${protocol}/src`
      await expect(
        readFile(resolve(repository, root, 'types.ts'), 'utf8'),
      ).resolves.toContain('export ')
      const directory = await mkdtemp(join(tmpdir(), 'loutre-contract-owners-'))
      const targets = ['runtime/endpoint.ts', 'extension.ts', 'index.ts']
      const files = {
        'package.json': '{"type":"module"}',
        'tsconfig.json':
          '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext"}}',
        [`${root}/types.ts`]:
          targets
            .map((target) => `import './${target.replace(/\.ts$/, '.js')}'`)
            .join('\n') + "; import '../../loutre/src/http/index.js'",
        ...Object.fromEntries(
          targets.map((target) => [`${root}/${target}`, 'export {}']),
        ),
        'packages/loutre/src/http/index.ts': 'export {}',
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
        for (const target of targets) {
          expect(violations).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                from: `${root}/types.ts`,
                to: `${root}/${target}`,
              }),
            ]),
          )
        }
        expect(
          violations.some(
            ({ to }) => to === 'packages/loutre/src/http/index.ts',
          ),
        ).toBe(false)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )
})
