import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const examples = resolve(import.meta.dirname, '../examples')

const forbiddenLegacyHttpPatterns = [
  /validate\.(?:params|query|headers|body|cors)\b/u,
  /\bhttp\.controller\b/u,
  /\bpipeline\s*:/u,
  /\bAppContract\.http\b/u,
  /\btransaction\s*\(\s*\[/u,
  /\bapp\.run\s*\(/u,
] as const

describe('examples README migration', () => {
  it('Execution Extensionへ移行したexamplesにlegacy HTTP APIを残さない', async () => {
    const readmes = await readExampleReadmes(examples)

    for (const [path, content] of readmes) {
      for (const pattern of forbiddenLegacyHttpPatterns) {
        expect(content, `${path}: ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

async function readExampleReadmes(
  directory: string,
): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>()
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      for (const [childPath, content] of await readExampleReadmes(path)) {
        result.set(childPath, content)
      }
      continue
    }
    if (entry.name === 'README.md') {
      result.set(path, await readFile(path, 'utf8'))
    }
  }
  return result
}
