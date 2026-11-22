import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { contractNameViolations } from './contract-names.mjs'

const root = resolve(import.meta.dirname, '..')
const publicNames = new Map([
  ['@loutrejs/loutre', ['application', 'module', 'env', 'args', 'domainError']],
  ['@loutrejs/loutre/http', ['http']],
  ['@loutrejs/loutre/tasks', ['task', 'queue', 'trigger']],
  ['@loutrejs/mcp', ['mcp']],
])

// Markdown のコード例と、テストが文字列から生成するソースにも同じ規約を適用する。
const namedImport =
  /\bimport\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^{}]*)\}\s*from\s*['"]([^'"\s]+)['"]/g
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
).split('\0')

for (const file of files) {
  if (!/\.(?:[cm]?[jt]sx?|mdx?)$/.test(file)) continue
  const path = resolve(root, file)
  if (!existsSync(path)) continue
  const source = readFileSync(path, 'utf8')
  for (const { name, offset } of contractNameViolations(source, file)) {
    const line = source.slice(0, offset).split('\n').length
    console.error(
      `${file}:${line}  契約全体を表す ${name} は contract または対象名に Contract を付けた名前にしてください。`,
    )
    process.exitCode = 1
  }
  for (const match of source.matchAll(namedImport)) {
    const [, specifiers, from] = match
    const entry = from.replace(
      /^(?:\.\.\/)+packages\/(loutre|mcp)\/src(\/(?:tasks|http))?\/index\.[jt]s$/,
      '@loutrejs/$1$2',
    )
    const names = publicNames.get(entry)
    if (!names) continue
    const bindings = specifiers.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')
    for (const [, name, alias] of bindings.matchAll(
      /\b([\w$]+)\s+as\s+([\w$]+)/g,
    )) {
      if (!names.includes(name) || alias === name) continue
      // この入力は、利用者が別名で import しても計装できることを検証する。
      if (
        file === 'tests/source-instrumentation.test.ts' &&
        name === 'module' &&
        alias === 'dm'
      )
        continue
      const line = source.slice(0, match.index).split('\n').length
      console.error(
        `${file}:${line}  ${from} の公開 API は ${name} として import してください（現在の別名: ${alias}）。`,
      )
      process.exitCode = 1
    }
  }
}
