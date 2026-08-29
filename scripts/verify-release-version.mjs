import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')
const packagesDirectory = resolve(repository, 'packages')
const rootManifest = JSON.parse(
  await readFile(resolve(repository, 'package.json'), 'utf8'),
)
const publicPackages = []

for (const directory of await readdir(packagesDirectory)) {
  const manifest = JSON.parse(
    await readFile(
      resolve(packagesDirectory, directory, 'package.json'),
      'utf8',
    ),
  )
  if (manifest.private === true) continue
  publicPackages.push(manifest)
}

const versions = new Set(publicPackages.map(({ version }) => version))
if (versions.size !== 1) {
  throw new Error(
    `公開packageのversionが一致していません: ${publicPackages
      .map(({ name, version }) => `${name}@${version}`)
      .join(', ')}`,
  )
}

const [version] = versions
if (rootManifest.version !== version) {
  throw new Error(
    `root version ${rootManifest.version} と公開package version ${version} が一致していません`,
  )
}

for (const manifest of publicPackages) {
  const dependencyGroups = [manifest.dependencies, manifest.devDependencies]
  for (const dependencies of dependencyGroups) {
    if (!dependencies) continue
    for (const [name, range] of Object.entries(dependencies)) {
      if (!name.startsWith('@loutrejs/')) continue
      if (range !== `^${version}`) {
        throw new Error(
          `${manifest.name}の${name} dependency ${range} がrelease version ^${version} と一致していません`,
        )
      }
    }
  }
}

console.log(`release version ${version}: 一致`)
