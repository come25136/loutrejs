import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repository = resolve(import.meta.dirname, '..')
const packagesDirectory = resolve(repository, 'packages')
const rootManifest = JSON.parse(
  await readFile(resolve(repository, 'package.json'), 'utf8'),
)
const publicPackages = new Map()

for (const directory of await readdir(packagesDirectory)) {
  const manifest = JSON.parse(
    await readFile(
      resolve(packagesDirectory, directory, 'package.json'),
      'utf8',
    ),
  )
  if (manifest.private === true) continue
  publicPackages.set(manifest.name, manifest)
}

const core = requirePublicPackage('@loutrejs/loutre')
const coreVersion = core.version
const synchronizedPackages = [
  '@loutrejs/loutre',
  '@loutrejs/node',
  '@loutrejs/bullmq',
]

for (const packageName of synchronizedPackages) {
  const manifest = requirePublicPackage(packageName)
  if (manifest.version !== coreVersion) {
    throw new Error(
      `${packageName}@${manifest.version} must match @loutrejs/loutre@${coreVersion}`,
    )
  }
}

if (rootManifest.version !== coreVersion) {
  throw new Error(
    `Root version ${rootManifest.version} does not match @loutrejs/loutre@${coreVersion}`,
  )
}

const presentation = await import(
  pathToFileURL(resolve(packagesDirectory, 'loutre', 'dist', 'presentation.js'))
    .href
)
if (presentation.LOUTRE_VERSION !== coreVersion) {
  throw new Error(
    `Published LOUTRE_VERSION ${presentation.LOUTRE_VERSION} does not match @loutrejs/loutre@${coreVersion}`,
  )
}

const expectedCoreRange = compatibilityRange(coreVersion)
const coreConsumers = [
  ['@loutrejs/node', 'peerDependencies'],
  ['@loutrejs/bullmq', 'peerDependencies'],
  ['@loutrejs/cli', 'dependencies'],
  ['create-loutre', 'dependencies'],
]

for (const [packageName, dependencyGroup] of coreConsumers) {
  const manifest = requirePublicPackage(packageName)
  const range = manifest[dependencyGroup]?.['@loutrejs/loutre']
  if (range !== expectedCoreRange) {
    throw new Error(
      `${packageName} @loutrejs/loutre ${dependencyGroup} range ${range ?? '<missing>'} must be ${expectedCoreRange}`,
    )
  }
}

console.log(
  `release compatibility: core ${coreVersion}, tooling versions ${requirePublicPackage('@loutrejs/cli').version} / ${requirePublicPackage('create-loutre').version}`,
)

function requirePublicPackage(name) {
  const manifest = publicPackages.get(name)
  if (!manifest) throw new Error(`Missing public package ${name}`)
  return manifest
}

function compatibilityRange(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Unsupported release version ${version}`)
  const major = Number(match[1])
  const minor = Number(match[2])
  return major === 0 ? `^0.${minor}.0` : `^${major}.0.0`
}
