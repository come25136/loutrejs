import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { generateOpenApi } from '@loutrejs/loutre/openapi'
import { loadApplicationDefinition } from './application-loader.js'

export interface OpenApiCliIO {
  readonly cwd: string
  readonly stdout: (value: string) => void
  readonly stderr: (value: string) => void
}

export async function runOpenApiCli(
  args: readonly string[],
  io: OpenApiCliIO,
): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    io.stdout(openApiHelpText())
    return 0
  }

  const entry = readOption(args, '--entry')
  if (!entry) {
    io.stderr('openapiには--entry <明示entry>が必要です。')
    return 2
  }

  const packageInfo = await readPackageInfo(io.cwd)
  const title = readOption(args, '--title') ?? packageInfo.name ?? 'Loutre API'
  const version =
    readOption(args, '--api-version') ?? packageInfo.version ?? '0.0.0'
  const output = readOption(args, '--output')
  if (output && !output.toLowerCase().endsWith('.json')) {
    io.stderr('現時点のopenapi --outputは.jsonのみ対応しています。')
    return 2
  }

  const application = await loadApplicationDefinition(resolve(io.cwd, entry))
  const document = generateOpenApi(application, {
    info: { title, version },
  })
  const serialized = `${JSON.stringify(document, null, 2)}\n`
  if (!output) {
    io.stdout(serialized.trimEnd())
    return 0
  }

  const outputPath = resolve(io.cwd, output)
  await writeFile(outputPath, serialized, 'utf8')
  io.stdout(`OpenAPI 3.2 documentを出力しました: ${outputPath}`)
  return 0
}

async function readPackageInfo(
  cwd: string,
): Promise<{ readonly name?: string; readonly version?: string }> {
  try {
    const parsed = JSON.parse(
      await readFile(resolve(cwd, 'package.json'), 'utf8'),
    ) as {
      readonly name?: unknown
      readonly version?: unknown
    }
    return {
      ...(typeof parsed.name === 'string' ? { name: parsed.name } : {}),
      ...(typeof parsed.version === 'string'
        ? { version: parsed.version }
        : {}),
    }
  } catch {
    return {}
  }
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  const value = index < 0 ? undefined : args[index + 1]
  return value && !value.startsWith('--') ? value : undefined
}

function openApiHelpText(): string {
  return [
    'loutre openapi --entry <application.ts> [options]',
    '',
    'Options:',
    '  --output <openapi.json>  JSON fileへ出力（省略時はstdout）',
    '  --title <title>          API title（省略時はpackage.json name）',
    '  --api-version <version> API version（省略時はpackage.json version）',
  ].join('\n')
}
