import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const nativeCiFiles = [
  '.github/actions/setup-bun-workspace/action.yml',
  '.github/actions/setup-deno-workspace/action.yml',
  '.github/workflows/ci-bun.yml',
  '.github/workflows/ci-deno.yml',
  '.github/workflows/ci-initializer-bun.yml',
  '.github/workflows/ci-initializer-deno.yml',
] as const

describe('native runtime CI isolation', () => {
  it.each(nativeCiFiles)(
    '%sはNode.js setupやNode/npm commandへ依存しない',
    async (file) => {
      const source = await readFile(file, 'utf8')

      expect(source).not.toContain('actions/setup-node')
      expect(source).not.toContain('setup-node-workspace')
      expect(source).not.toMatch(/^\s*(?:node|npm|npx)\s+/gmu)
      expect(source).not.toMatch(/^\s*run:\s*(?:node|npm|npx)\s+/gmu)
    },
  )

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
