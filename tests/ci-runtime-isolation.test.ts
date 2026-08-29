import { readFile, readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const nativeSetupFiles = [
  '.github/actions/setup-bun-workspace/action.yml',
  '.github/actions/setup-deno-workspace/action.yml',
] as const

const nativeCiJobs = [
  'bun-conformance',
  'deno-conformance',
  'bun-initializer',
  'deno-initializer',
  'bun-package-consumer',
  'deno-package-consumer',
] as const

const packedConsumerJobs = [
  'node-package-consumer',
  'bun-package-consumer',
  'deno-package-consumer',
] as const

async function readCiJob(jobId: string): Promise<string> {
  const source = await readFile('.github/workflows/ci.yml', 'utf8')
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line === `  ${jobId}:`)

  if (start < 0) {
    throw new Error(`CI jobが見つかりません: ${jobId}`)
  }

  const end = lines.findIndex(
    (line, index) => index > start && /^  [a-z0-9-]+:$/u.test(line),
  )

  return lines.slice(start, end < 0 ? undefined : end).join('\n')
}

describe('native runtime CI isolation', () => {
  it.each(nativeSetupFiles)(
    '%sはNode.js setupやNode/npm commandへ依存しない',
    async (file) => {
      const source = await readFile(file, 'utf8')

      expect(source).not.toContain('actions/setup-node')
      expect(source).not.toContain('setup-node-workspace')
      expect(source).not.toMatch(/^\s*(?:node|npm|npx)\s+/gmu)
      expect(source).not.toMatch(/^\s*run:\s*(?:node|npm|npx)\s+/gmu)
    },
  )

  it.each(nativeCiJobs)(
    '%s jobはNode.js setupやNode/npm commandへ依存しない',
    async (jobId) => {
      const source = await readCiJob(jobId)

      expect(source).not.toContain('actions/setup-node')
      expect(source).not.toContain('setup-node-workspace')
      expect(source).not.toMatch(/^\s*(?:node|npm|npx)\s+/gmu)
      expect(source).not.toMatch(/^\s*run:\s*(?:node|npm|npx)\s+/gmu)
    },
  )

  it.each(packedConsumerJobs)(
    '%s jobはrepository sourceをcheckoutせずtarball artifactだけを使う',
    async (jobId) => {
      const source = await readCiJob(jobId)

      expect(source).not.toContain('actions/checkout')
      expect(source).toContain('actions/download-artifact')
      expect(source).toContain('loutre-package-tarballs')
    },
  )

  it('CI内部処理を個別workflowとして再導入しない', async () => {
    const workflowFiles = await readdir('.github/workflows')

    expect(workflowFiles.filter((file) => /^ci-.+\.yml$/u.test(file))).toEqual(
      [],
    )
  })

  it.each(['test:bun', 'test:deno'] as const)(
    '%sはNode/npm commandへ依存しない',
    async (script) => {
      const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
        readonly scripts: Readonly<Record<string, string>>
      }

      expect(manifest.scripts[script]).not.toMatch(/\b(?:node|npm|npx)\b/u)
    },
  )
})
