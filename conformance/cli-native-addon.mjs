import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = await mkdtemp(join(tmpdir(), 'loutre-native-cli-'))
const entry = join(directory, 'app.ts')
const cli = resolve('packages/cli/bin/loutre.js')
const loutre = resolve('packages/loutre/src/index.ts')
const swc = fileURLToPath(import.meta.resolve('@swc/core'))

try {
  await writeFile(
    entry,
    [
      `import { defineApplication, defineModule, provide } from ${JSON.stringify(loutre)}`,
      `import { transformSync } from ${JSON.stringify(swc)}`,
      "const result = transformSync('const answer: number = 42', { jsc: { parser: { syntax: 'typescript' } } })",
      "if (!result.code.includes('42') || result.code.includes(': number')) throw new Error('native addonの実行結果が不正です')",
      'class Codec { transform = transformSync }',
      "const CodecModule = defineModule(() => ({ name: 'Codec', providers: [provide(Codec).useFactory(() => new Codec())] }))()",
      'export default defineApplication({ modules: [CodecModule] })',
    ].join('\n'),
    'utf8',
  )

  const result = spawnSync(process.execPath, [cli, 'check', '--entry', entry], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (
    result.status !== 0 ||
    !result.stdout.includes('Loutre Application Model is valid.')
  ) {
    throw new Error(
      `native addonを含むentryのcheckに失敗しました: ${result.error ?? result.status}\n${result.stdout}\n${result.stderr}`,
    )
  }
  const runtime = globalThis.Bun?.version
    ? `Bun ${globalThis.Bun.version}`
    : `Node.js ${process.versions.node}`
  console.log(`${runtime} CLI native addon conformance: passed`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
