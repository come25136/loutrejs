import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '..')
const rootManifestPath = resolve(repository, 'package.json')
const coreManifestPath = resolve(repository, 'packages/loutre/package.json')
const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8'))
const coreManifest = JSON.parse(await readFile(coreManifestPath, 'utf8'))

rootManifest.version = coreManifest.version
await writeFile(rootManifestPath, `${JSON.stringify(rootManifest, null, 2)}\n`)
