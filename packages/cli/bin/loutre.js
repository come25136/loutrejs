#!/usr/bin/env node
import 'tsx/esm'

const { runCli } = await import('../src/index.ts')
const code = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (value) => process.stdout.write(`${value}\n`),
  stderr: (value) => process.stderr.write(`${value}\n`),
})
process.exitCode = code
