import { execFileSync } from 'node:child_process'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')
const packagesDirectory = resolve(repository, 'packages')
const outputDirectory = resolve(repository, 'dist', 'package-tarballs')

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })

const packed = []
for (const directory of await readdir(packagesDirectory)) {
  const packageDirectory = resolve(packagesDirectory, directory)
  const manifest = JSON.parse(
    await readFile(resolve(packageDirectory, 'package.json'), 'utf8'),
  )
  if (manifest.private === true) continue

  const result = JSON.parse(
    execFileSync(
      'npm',
      [
        'pack',
        `./packages/${directory}`,
        '--pack-destination',
        outputDirectory,
        '--json',
      ],
      { cwd: repository, encoding: 'utf8' },
    ),
  )[0]
  packed.push(`${manifest.name} -> ${result.filename}`)
}

console.log(`公開package tarballを生成しました:\n${packed.join('\n')}`)
