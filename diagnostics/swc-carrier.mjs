import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  statSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'loutre-swc-diagnostic-'))
const secureCache = mkdtempSync(join(tmpdir(), 'loutre-swc-secure-'))
const insecureCache = mkdtempSync(join(tmpdir(), 'loutre-swc-insecure-'))
chmodSync(insecureCache, 0o777)
const cacheRoot = resolve(
  process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'),
)
const ancestors = []
for (let path = cacheRoot; ; path = dirname(path)) {
  try {
    const metadata = statSync(path)
    ancestors.push({
      path,
      mode: (metadata.mode & 0o7777).toString(8),
      uid: metadata.uid,
      gid: metadata.gid,
    })
  } catch (error) {
    ancestors.push({ path, error: error.code })
  }
  if (dirname(path) === path) break
}
console.log(
  'ENVIRONMENT',
  JSON.stringify({
    uid: process.getuid(),
    cacheRoot,
    ancestors,
    node: process.version,
  }),
)
writeFileSync(
  join(directory, 'package.json'),
  JSON.stringify({
    private: true,
    dependencies: { '@swc/core': process.env.DIAGNOSTIC_SWC_VERSION },
  }),
)
const installation = spawnSync('bun', ['install', '--no-save'], {
  cwd: directory,
  encoding: 'utf8',
})
console.log(installation.stdout, installation.stderr)
if (installation.status !== 0) process.exit(installation.status ?? 1)
const source = `
try {
  const swc = require('@swc/core')
  const code = swc.transformSync('const n: number = 1', { jsc: { parser: { syntax: 'typescript' } } }).code
  console.log(JSON.stringify({ version: swc.version, code }))
} catch (error) {
  const detail = value => value instanceof Error ? { name: value.name, code: value.code, message: value.message, cause: Array.isArray(value.cause) ? value.cause.map(detail) : value.cause ? detail(value.cause) : undefined } : value
  console.error(JSON.stringify(detail(error)))
  process.exit(1)
}
`
const variants = [
  ['default', {}],
  ['secure-cache', { SWC_NATIVE_BINDING_CACHE: secureCache }],
  ['secure-xdg', { XDG_CACHE_HOME: secureCache }],
  [
    'insecure-cache',
    { SWC_NATIVE_BINDING_CACHE: insecureCache, XDG_CACHE_HOME: insecureCache },
  ],
]
try {
  for (const [variant, environment] of variants) {
    for (const runtime of ['bun', 'node']) {
      const result = spawnSync(runtime, ['-e', source], {
        cwd: directory,
        env: { ...process.env, ...environment },
        encoding: 'utf8',
      })
      console.log(
        'RESULT',
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
  for (const path of [directory, secureCache, insecureCache])
    rmSync(path, { recursive: true, force: true })
}
