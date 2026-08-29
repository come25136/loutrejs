import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')
const manifestPath = resolve(repository, 'packages/loutre/package.json')
const outputPath = resolve(
  repository,
  'packages/loutre/src/generated/version.ts',
)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const source = `// package manifestとのずれを避けるため、scripts/generate-version.mjsがbuild前に更新する。\nexport const LOUTRE_VERSION = '${manifest.version}'\n`

await writeFile(outputPath, source, 'utf8')
