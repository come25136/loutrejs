import { runCli } from '@loutrejs/cli'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  emitEntry,
  loadEntryWithFiles,
} from '../packages/cli/src/entry-loader.js'

describe('Node互換entry loader', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'loutre-native-entry-'))
    const dependency = join(directory, 'node_modules', 'native-codec')
    await mkdir(dependency, { recursive: true })
    await writeFile(
      join(dependency, 'package.json'),
      JSON.stringify({
        name: 'native-codec',
        exports: { import: './import.cjs', require: './require.cjs' },
      }),
    )
    await writeFile(join(dependency, 'marker.json'), JSON.stringify('native'))
    const swc = fileURLToPath(import.meta.resolve('@swc/core'))
    for (const branch of ['import', 'require']) {
      await writeFile(
        join(dependency, `${branch}.cjs`),
        [
          `const { transformSync } = require(${JSON.stringify(swc)})`,
          "const marker = require('./marker.json')",
          `exports.branch = ${JSON.stringify(branch)}`,
          'exports.compile = (source) => ({',
          "  code: transformSync(source, { jsc: { parser: { syntax: 'typescript' } } }).code,",
          '  marker,',
          '})',
        ].join('\n'),
      )
    }
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it.each(['import', 'require'])(
    '%s条件のnative依存を元の配置から読み込みローカルTypeScriptをbundleする',
    async (branch) => {
      const entry = join(directory, 'app.ts')
      const local = join(directory, 'source.ts')
      await writeFile(
        local,
        "export const source: string = 'const answer: number = 42'\n",
      )
      await writeFile(
        entry,
        [
          branch === 'import'
            ? "import { compile, branch } from 'native-codec'"
            : "const { compile, branch } = require('native-codec')",
          "import { source } from './source.js'",
          'export default { ...compile(source), branch }',
        ].join('\n'),
      )

      const loaded = await loadEntryWithFiles(entry, { projectRoot: directory })

      expect(loaded.value).toMatchObject({ marker: 'native', branch })
      expect(loaded.value).toHaveProperty('code', expect.stringContaining('42'))
      expect(loaded.value).toHaveProperty(
        'code',
        expect.not.stringContaining(': number'),
      )
      expect(loaded.files).toEqual(expect.arrayContaining([entry, local]))
    },
  )

  it('checkはnative addonを使うproviderを含むApplication Graphを検証できる', async () => {
    const entry = join(directory, 'app.ts')
    await writeFile(
      entry,
      [
        `import { defineApplication, defineModule, provide } from ${JSON.stringify(resolve('packages/loutre/src/index.ts'))}`,
        "import { compile } from 'native-codec'",
        'class Codec { compile = compile }',
        "const CodecModule = defineModule(() => ({ name: 'Codec', providers: [provide(Codec).useFactory(() => new Codec())] }))()",
        'export default defineApplication({ modules: [CodecModule] })',
      ].join('\n'),
    )
    const stdout: string[] = []
    const stderr: string[] = []

    expect(
      await runCli(['check', '--entry', entry], {
        cwd: directory,
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      }),
    ).toBe(0)
    expect(stderr).toEqual([])
    expect(stdout.join('\n')).toContain('Loutre Application Model is valid.')
  })

  it('Node向け依存はmodule fieldではなくmain fieldから読み込む', async () => {
    const dependency = join(directory, 'node_modules', 'native-codec')
    await writeFile(
      join(dependency, 'package.json'),
      JSON.stringify({
        name: 'native-codec',
        main: './import.cjs',
        module: './unsupported.mjs',
      }),
    )
    await writeFile(
      join(dependency, 'unsupported.mjs'),
      "throw new Error('Nodeでは読み込まないmodule field')",
    )
    const entry = join(directory, 'app.ts')
    await writeFile(
      entry,
      "import { compile } from 'native-codec'; export default compile('const answer: number = 42')",
    )

    const loaded = await loadEntryWithFiles(entry)

    expect(loaded.value).toMatchObject({ marker: 'native' })
    expect(loaded.value).toHaveProperty('code', expect.stringContaining('42'))
  })

  it('空白と#を含む依存パスでも生成したentryをNodeで読み込める', async () => {
    const renamedDirectory = `${directory} # project`
    await rename(directory, renamedDirectory)
    directory = renamedDirectory
    const entry = join(directory, 'app.ts')
    const output = join(directory, 'output', 'entry.mjs')
    await writeFile(
      entry,
      "import { compile } from 'native-codec'; export default compile('const answer: number = 42')",
    )
    await emitEntry(entry, output, { nodeCompatibility: true })

    const result = await promisify(execFile)(process.execPath, [
      '--input-type=module',
      '--eval',
      `const { default: value } = await import(${JSON.stringify(pathToFileURL(output).href)}); console.log(JSON.stringify(value))`,
    ])

    expect(JSON.parse(result.stdout)).toMatchObject({
      marker: 'native',
      code: expect.stringContaining('42'),
    })
  })
})
