#!/usr/bin/env node
import { runCli } from './index.js'

const code = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (value) => process.stdout.write(`${value}\n`),
  stderr: (value) => process.stderr.write(`${value}\n`),
})
process.exitCode = code
