import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')
const packagesDirectory = resolve(repository, 'packages')
const failures = []

for (const directory of await readdir(packagesDirectory)) {
  const packageDirectory = resolve(packagesDirectory, directory)
  const manifest = JSON.parse(
    await readFile(resolve(packageDirectory, 'package.json'), 'utf8'),
  )
  if (manifest.private === true) continue
  const result = JSON.parse(execFileSync(
    'npm',
    ['pack', packageDirectory, '--dry-run', '--json'],
    { cwd: repository, encoding: 'utf8' },
  ))[0]
  const files = new Set(result.files.map(({ path }) => path))
  for (const required of ['dist/index.js', 'dist/index.d.ts', 'package.json']) {
    if (!files.has(required)) failures.push(`${manifest.name}: ${required}がありません`)
  }
  for (const file of files) {
    if (
      file.startsWith('src/') ||
      file.endsWith('.tsbuildinfo') ||
      file.endsWith('.map')
    ) {
      failures.push(`${manifest.name}: 公開不要な${file}が含まれています`)
    }
  }
}

if (failures.length > 0) {
  throw new Error(`package検証に失敗しました\n${failures.join('\n')}`)
}
console.log('全公開packageのtarball検証: 成功')
