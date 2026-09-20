import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ApplicationDefinition, ApplicationModel } from '@loutrejs/loutre'
import type { HttpContract } from '@loutrejs/loutre/http'
import {
  generateOpenApi,
  type OpenApiSource,
} from '@loutrejs/loutre/http/openapi'
import { loadEntry } from './entry-loader.js'

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
    io.stderr('openapi requires --entry <entry>.')
    return 2
  }

  const packageInfo = await readPackageInfo(io.cwd)
  const title = readOption(args, '--title') ?? packageInfo.name ?? 'Loutre API'
  const version =
    readOption(args, '--api-version') ?? packageInfo.version ?? '0.0.0'
  const output = readOption(args, '--output')
  if (output && !output.toLowerCase().endsWith('.json')) {
    io.stderr('openapi --output currently supports only .json files.')
    return 2
  }

  const entryValue = await loadEntry(resolve(io.cwd, entry), {
    projectRoot: io.cwd,
  })
  const source = openApiSourceFromEntry(entryValue)
  const document = generateOpenApi(source, {
    info: { title, version },
  })
  const serialized = `${JSON.stringify(document, null, 2)}\n`
  if (!output) {
    io.stdout(serialized.trimEnd())
    return 0
  }

  const outputPath = resolve(io.cwd, output)
  await writeFile(outputPath, serialized, 'utf8')
  io.stdout(`Wrote OpenAPI 3.2 document: ${outputPath}`)
  return 0
}

function openApiSourceFromEntry(entry: unknown): OpenApiSource {
  if (typeof entry !== 'object' || entry === null || !('kind' in entry)) {
    throw invalidOpenApiEntry()
  }

  if (entry.kind === 'http-contract') {
    return entry as HttpContract
  }

  if (entry.kind === 'application-definition') {
    const application = entry as ApplicationDefinition
    assertApplicationModel(application.model)
    return application.model
  }

  throw invalidOpenApiEntry()
}

function assertApplicationModel(
  model: ApplicationDefinition['model'] | undefined,
): asserts model is ApplicationModel {
  if (!model || model.kind !== 'application-model') {
    throw new Error(
      'ApplicationDefinition must contain a compiled Application Model.',
    )
  }
}

function invalidOpenApiEntry(): Error {
  return new Error(
    'OpenAPI entry must default export an ApplicationDefinition or HttpContract.',
  )
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
    'loutre openapi --entry <entry.ts> [options]',
    '',
    'The entry must default export an ApplicationDefinition or HttpContract.',
    '',
    'Options:',
    '  --output <openapi.json>  Write a JSON file (defaults to stdout)',
    '  --title <title>          API title (defaults to package.json name)',
    '  --api-version <version> API version (defaults to package.json version)',
  ].join('\n')
}
