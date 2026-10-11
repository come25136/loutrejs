import { spawnSync } from 'node:child_process'
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const cacheRoot = resolve(
  process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'),
)
const ancestors = []
for (let path = cacheRoot; ; path = dirname(path)) {
  try {
    const metadata = lstatSync(path)
    ancestors.push({
      path,
      mode: (metadata.mode & 0o7777).toString(8),
      uid: metadata.uid,
      gid: metadata.gid,
      symlink: metadata.isSymbolicLink(),
    })
  } catch (error) {
    ancestors.push({ path, error: error.code })
  }
  if (dirname(path) === path) break
}
console.log(
  'WORKSPACE_ENVIRONMENT',
  JSON.stringify({
    uid: process.getuid(),
    node: process.version,
    cacheRoot,
    ancestors,
  }),
)
if (process.argv.includes('--inspect')) process.exit(0)
const manifest = JSON.parse(
  readFileSync('node_modules/@swc/core/package.json', 'utf8'),
)
console.log('SWC_VERSION', manifest.version)
const secureCache = mkdtempSync(join(tmpdir(), 'loutre-swc-workspace-secure-'))
const source = `
try {
  const swc = await import('@swc/core')
  console.log(JSON.stringify({ version: swc.version, code: swc.transformSync('const n: number = 1', { jsc: { parser: { syntax: 'typescript' } } }).code }))
} catch (error) {
  const detail = value => value instanceof Error ? { name: value.name, code: value.code, message: value.message, cause: Array.isArray(value.cause) ? value.cause.map(detail) : value.cause ? detail(value.cause) : undefined } : value
  console.error(JSON.stringify(detail(error)))
  process.exit(1)
}
`
try {
  for (const [variant, environment] of [
    ['default', {}],
    ['secure-cache', { SWC_NATIVE_BINDING_CACHE: secureCache }],
  ]) {
    for (const runtime of ['bun', 'node']) {
      const args =
        runtime === 'node'
          ? ['--input-type=module', '-e', source]
          : ['-e', source]
      const result = spawnSync(runtime, args, {
        env: { ...process.env, ...environment },
        encoding: 'utf8',
      })
      console.log(
        'WORKSPACE_RESULT',
        JSON.stringify({
          variant,
          runtime,
          status: result.status,
          signal: result.signal,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
        }),
      )
    }
  }
} finally {
  rmSync(secureCache, { recursive: true, force: true })
}
