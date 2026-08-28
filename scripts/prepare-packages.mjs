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
  await cleanOutput(destination)
}

async function cleanOutput(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await cleanOutput(path)
      continue
    }
    if (entry.name.endsWith('.map')) {
      await rm(path)
      continue
    }
    if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
      const content = await readFile(path, 'utf8')
      await writeFile(
        path,
        content.replace(/^\/\/[#@] sourceMappingURL=.*(?:\r?\n)?/gmu, ''),
        'utf8',
      )
    }
  }
}
