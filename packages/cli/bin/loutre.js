#!/usr/bin/env node

const host = createCliHost()
const args = host.args

if (args[0] === 'openapi') {
  const openapi = await loadCliModule(
    '../dist/openapi-cli.js',
    '../src/openapi-cli.ts',
  )
  const code = await openapi.runOpenApiCli(args.slice(1), {
    cwd: host.cwd,
    stdout: host.stdout,
    stderr: host.stderr,
  })
  host.setExitCode(code)
} else {
  const cli = await loadCliModule('../dist/index.js', '../src/index.ts')
  const code = await cli.runCli(args, {
    cwd: host.cwd,
    stdout: host.stdout,
    stderr: host.stderr,
  })
  host.setExitCode(code)
}

async function loadCliModule(distributionPath, sourcePath) {
  try {
    return await import(distributionPath)
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    if (host.runtime === 'deno') {
      throw new Error(
        'Denoでrepository内のLoutre CLIを実行する前にpackageをbuildしてください。',
        { cause: error },
      )
    }
    if (host.runtime === 'node') await import('tsx/esm')
    return import(sourcePath)
  }
}

function createCliHost() {
  const deno = globalThis.Deno
  if (deno?.version?.deno) {
    const encoder = new TextEncoder()
    return {
      runtime: 'deno',
      args: deno.args,
      cwd: deno.cwd(),
      stdout: (value) => deno.stdout.writeSync(encoder.encode(`${value}\n`)),
      stderr: (value) => deno.stderr.writeSync(encoder.encode(`${value}\n`)),
      setExitCode: (code) => {
        deno.exitCode = code
      },
    }
  }

  const runtimeProcess = globalThis.process
  if (!runtimeProcess) {
    throw new Error('Loutre CLIを実行できるruntimeを検出できませんでした。')
  }
  return {
    runtime: globalThis.Bun?.version ? 'bun' : 'node',
    args: runtimeProcess.argv.slice(2),
    cwd: runtimeProcess.cwd(),
    stdout: (value) => runtimeProcess.stdout.write(`${value}\n`),
    stderr: (value) => runtimeProcess.stderr.write(`${value}\n`),
    setExitCode: (code) => {
      runtimeProcess.exitCode = code
    },
  }
}
