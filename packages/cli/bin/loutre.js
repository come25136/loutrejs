#!/usr/bin/env node
import 'tsx/esm'

const { detectStartupBannerTerminal, runCli } = await import('../src/index.ts')
const code = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (value) => process.stdout.write(`${value}\n`),
  stderr: (value) => process.stderr.write(`${value}\n`),
  terminal: detectStartupBannerTerminal(process.stdout, process.env),
})
process.exitCode = code
