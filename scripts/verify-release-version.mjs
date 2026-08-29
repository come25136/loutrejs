import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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
    `Published package versions do not match: ${publicPackages
      .map(({ name, version }) => `${name}@${version}`)
      .join(', ')}`,
  )
}

const [version] = versions
if (rootManifest.version !== version) {
  throw new Error(
    `Root version ${rootManifest.version} does not match published package version ${version}`,
  )
}

const presentation = await import(
  pathToFileURL(resolve(packagesDirectory, 'loutre', 'dist', 'presentation.js'))
    .href
)
if (presentation.LOUTRE_VERSION !== version) {
  throw new Error(
    `Published LOUTRE_VERSION ${presentation.LOUTRE_VERSION} does not match release version ${version}`,
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
          `${manifest.name} ${name} dependency ${range} does not match release version ^${version}`,
        )
      }
    }
  }
}

console.log(`release version ${version}: matched`)
