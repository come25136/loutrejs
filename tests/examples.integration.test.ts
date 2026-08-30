import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'

const invalidExamples = new Map([
  ['examples/graph-probe/src/app.ts', 'LUTRE_DI_UNRESOLVED'],
])

const applicationEntries = readdirSync('examples', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const sourceDirectory = join('examples', entry.name, 'src')
    try {
      return readdirSync(sourceDirectory, { withFileTypes: true })
        .filter(
          (source) =>
            source.isFile() &&
            (source.name === 'app.ts' || source.name.endsWith('-app.ts')),
        )
        .map((source) => join(sourceDirectory, source.name))
    } catch {
      return []
    }
  })
  .map((entry) => relative('.', entry))
  .toSorted()

describe('examples', () => {
  for (const entry of applicationEntries) {
    const expectedDiagnostic = invalidExamples.get(entry)

    if (expectedDiagnostic) {
      it(`${entry} は意図したGraph診断を返す`, () => {
        const result = checkExample(entry)

        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain(expectedDiagnostic)
      })
      continue
    }

    it(`${entry} は有効なApplication Graphとして読み込める`, () => {
      const result = checkExample(entry)

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('Loutre Application Graphは有効です。')
    })
  }
})

function checkExample(entry: string) {
  return spawnSync(
    process.execPath,
    ['packages/cli/bin/loutre.js', 'check', '--entry', entry],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  )
}
