#!/usr/bin/env node

const args = process.argv.slice(2)

if (args[0] === 'openapi') {
  let openapi
  try {
    openapi = await import('../dist/openapi-cli.js')
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    await import('tsx/esm')
    openapi = await import('../src/openapi-cli.ts')
  }
  const code = await openapi.runOpenApiCli(args.slice(1), {
    cwd: process.cwd(),
    stdout: (value) => process.stdout.write(`${value}\n`),
    stderr: (value) => process.stderr.write(`${value}\n`),
  })
  process.exitCode = code
} else {
  let cli
  try {
    cli = await import('../dist/index.js')
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    await import('tsx/esm')
    cli = await import('../src/index.ts')
  }
  const { detectStartupBannerTerminal, runCli } = cli
  const code = await runCli(args, {
    cwd: process.cwd(),
    stdout: (value) => process.stdout.write(`${value}\n`),
    stderr: (value) => process.stderr.write(`${value}\n`),
    terminal: detectStartupBannerTerminal(process.stdout, process.env),
  })
  process.exitCode = code
}
