import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')
const packagesDirectory = resolve(repository, 'packages')
const failures = []
const repositoryUrl = 'https://github.com/come25136/loutrejs'

for (const directory of await readdir(packagesDirectory)) {
  const packageDirectory = resolve(packagesDirectory, directory)
  const manifest = JSON.parse(
    await readFile(resolve(packageDirectory, 'package.json'), 'utf8'),
  )
  if (manifest.private === true) continue
  if (manifest.repository?.url !== repositoryUrl) {
    failures.push(`${manifest.name}: repository.url must be ${repositoryUrl}`)
  }
  const result = JSON.parse(
    execFileSync('npm', ['pack', packageDirectory, '--dry-run', '--json'], {
      cwd: repository,
      encoding: 'utf8',
    }),
  )[0]
  const files = new Set(result.files.map(({ path }) => path))
  const required = new Set(['package.json', 'README.md'])
  if (manifest.types) required.add(normalizeTarget(manifest.types))
  collectExportTargets(manifest.exports, required)
  validateBinTargets(manifest.name, manifest.bin)
  collectBinTargets(manifest.bin, required)
  for (const path of required) {
    if (!files.has(path)) failures.push(`${manifest.name}: missing ${path}`)
  }
  for (const file of files) {
    if (
      file.startsWith('src/') ||
      file.endsWith('.tsbuildinfo') ||
      file.endsWith('.map')
    ) {
      failures.push(`${manifest.name}: contains unpublished file ${file}`)
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Package verification failed\n${failures.join('\n')}`)
}
console.log('Published package tarball verification: passed')

function validateBinTargets(packageName, value) {
  const targets =
    typeof value === 'string'
      ? [value]
      : value && typeof value === 'object'
        ? Object.values(value)
        : []
  for (const target of targets) {
    if (typeof target === 'string' && target.startsWith('./')) {
      failures.push(`${packageName}: bin path ${target} must not start with ./`)
    }
  }
}

function collectBinTargets(value, targets) {
  if (typeof value === 'string') {
    targets.add(normalizeTarget(value))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const target of Object.values(value))
    targets.add(normalizeTarget(target))
}

function collectExportTargets(value, targets) {
  if (typeof value === 'string') {
    targets.add(normalizeTarget(value))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const child of Object.values(value)) collectExportTargets(child, targets)
}

function normalizeTarget(value) {
  return value.startsWith('./') ? value.slice(2) : value
}
