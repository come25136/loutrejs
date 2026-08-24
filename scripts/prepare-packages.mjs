import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')
const packagesDirectory = resolve(repository, 'packages')

for (const name of await readdir(packagesDirectory)) {
  const source = resolve(repository, 'dist', 'packages', name, 'src')
  const destination = resolve(packagesDirectory, name, 'dist')
  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  await cp(source, destination, { recursive: true })
  for (const file of await readdir(destination)) {
    const path = resolve(destination, file)
    if (file.endsWith('.map')) {
      await rm(path)
      continue
    }
    if (file.endsWith('.js') || file.endsWith('.d.ts')) {
      const content = await readFile(path, 'utf8')
      await writeFile(
        path,
        content.replace(/^\/\/[#@] sourceMappingURL=.*(?:\r?\n)?/gmu, ''),
        'utf8',
      )
    }
  }
}
