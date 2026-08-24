#!/usr/bin/env node
let cli
try {
  cli = await import('../dist/index.js')
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
  await import('tsx/esm')
  cli = await import('../src/index.ts')
}
const { detectStartupBannerTerminal, runCli } = cli
const code = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (value) => process.stdout.write(`${value}\n`),
  stderr: (value) => process.stderr.write(`${value}\n`),
  terminal: detectStartupBannerTerminal(process.stdout, process.env),
})
process.exitCode = code
