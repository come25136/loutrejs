import { readFileSync } from 'node:fs'
import { cp, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type PackageManager,
  type ProjectTarget,
  runScriptCommand,
  targetLabels,
} from './options.js'

const packageManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { readonly dependencies: Readonly<Record<string, string>> }
const loutreVersion = requiredDependencyVersion('@loutrejs/loutre')

function requiredDependencyVersion(name: string): string {
  const version = packageManifest.dependencies[name]
  if (!version) throw new Error(`${name} version is missing from package.json.`)
  return version
}

const baseTemplateDirectory = fileURLToPath(
  new URL('../templates/base/', import.meta.url),
)
const targetsTemplateDirectory = fileURLToPath(
  new URL('../templates/targets/', import.meta.url),
)

const renamedTemplateFiles = new Map([
  ['_gitignore', '.gitignore'],
  ['_oxlintrc.json', '.oxlintrc.json'],
  ['_oxfmtrc.json', '.oxfmtrc.json'],
])

export interface StarterOptions {
  readonly packageName: string
  readonly packageManager: PackageManager
  readonly target: ProjectTarget
}

export async function writeStarter(
  targetDirectory: string,
  options: StarterOptions,
): Promise<void> {
  await cp(baseTemplateDirectory, targetDirectory, { recursive: true })
  await cp(join(targetsTemplateDirectory, options.target), targetDirectory, {
    recursive: true,
  })
  for (const [source, destination] of renamedTemplateFiles) {
    await rename(
      join(targetDirectory, source),
      join(targetDirectory, destination),
    )
  }
  await writeFile(
    join(targetDirectory, 'package.json'),
    renderPackageJson(options),
    'utf8',
  )
  await replaceText(
    join(targetDirectory, 'tsconfig.json'),
    '"__LOUTRE_TYPES__"',
    JSON.stringify(targetManifest(options.target).types),
  )
  await renderTextTemplate(join(targetDirectory, 'README.md'), {
    targetLabel: targetLabels[options.target],
    developmentSection: developmentSection(options),
    verifyCommand: runScriptCommand(options.packageManager, 'verify'),
    deploymentSection: deploymentSection(options),
  })
  if (options.target === 'cloudflare-workers') {
    await renderTextTemplate(join(targetDirectory, 'wrangler.jsonc'), {
      packageName: workerNameFor(options.packageName),
      compatibilityDate: new Date().toISOString().slice(0, 10),
    })
  }
}

interface TargetManifest {
  readonly scripts: Readonly<Record<string, string>>
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly engines?: Readonly<Record<string, string>>
  readonly typecheck?: string
  readonly types: readonly string[]
}

function targetManifest(target: ProjectTarget): TargetManifest {
  switch (target) {
    case 'node':
      return {
        scripts: {
          dev: 'tsx watch src/main.ts',
          build: 'tsc -p tsconfig.build.json',
          start: 'node dist/main.js',
        },
        dependencies: { '@loutrejs/node': loutreVersion },
        devDependencies: { '@types/node': '^22.20.1', tsx: '^4.23.12' },
        engines: { node: '>=22' },
        types: ['node'],
      }
    case 'bun':
      return {
        scripts: {
          dev: 'bun --watch src/main.ts',
          build: 'bun build src/main.ts --outdir dist --target bun',
          start: 'bun dist/main.js',
        },
        devDependencies: { '@types/bun': '^1.4.0' },
        types: ['bun'],
      }
    case 'deno':
      return {
        scripts: {
          dev: 'deno run -A --watch src/main.ts',
          start: 'deno run -A src/main.ts',
        },
        typecheck: 'tsc --noEmit --allowImportingTsExtensions',
        types: [],
      }
    case 'cloudflare-workers':
      return {
        scripts: {
          dev: 'wrangler dev',
          build: 'wrangler deploy --dry-run --outdir dist',
          deploy: 'wrangler deploy',
        },
        devDependencies: { wrangler: '^4.127.1' },
        types: [],
      }
    case 'aws-lambda':
      return {
        scripts: {
          build:
            'esbuild src/main.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/index.mjs',
        },
        devDependencies: { '@types/node': '^22.20.1', esbuild: '^0.28.2' },
        engines: { node: '>=22' },
        types: ['node'],
      }
  }
}

function renderPackageJson(options: StarterOptions): string {
  const target = targetManifest(options.target)
  const build = target.scripts.build
  const typecheck = target.typecheck ?? 'tsc --noEmit'
  const verifyBuild = build === undefined ? '' : ` && ${build}`
  return `${JSON.stringify(
    {
      name: options.packageName,
      version: '0.1.0',
      private: true,
      type: 'module',
      ...(target.engines === undefined ? {} : { engines: target.engines }),
      scripts: {
        ...target.scripts,
        typecheck,
        check: `${typecheck} && loutre check --entry src/app.ts`,
        test: 'vitest run',
        'test:watch': 'vitest',
        lint: 'oxlint',
        'lint:fix': 'oxlint --fix',
        format: 'oxfmt',
        'format:check': 'oxfmt --check',
        verify: `oxfmt --check && oxlint && ${typecheck} && loutre check --entry src/app.ts && vitest run${verifyBuild}`,
      },
      dependencies: {
        '@loutrejs/loutre': loutreVersion,
        zod: '^4.4.3',
        ...target.dependencies,
      },
      devDependencies: {
        '@loutrejs/cli': loutreVersion,
        oxfmt: '^0.65.0',
        oxlint: '^1.80.0',
        typescript: '^7.0.2',
        vitest: '^4.1.11',
        ...target.devDependencies,
      },
    },
    null,
    2,
  )}\n`
}

function developmentSection(options: StarterOptions): string {
  if (options.target === 'aws-lambda') {
    return [
      '## Development',
      '',
      'The Lambda target does not start a local HTTP listener. Verify Application behavior with tests.',
      '',
      '```sh',
      runScriptCommand(options.packageManager, 'test:watch'),
      '```',
    ].join('\n')
  }
  return [
    '## Development',
    '',
    '```sh',
    runScriptCommand(options.packageManager, 'dev'),
    '```',
    '',
    options.target === 'cloudflare-workers'
      ? 'Wrangler starts a local Cloudflare Workers environment.'
      : 'Open <http://127.0.0.1:3000> to receive a JSON response.',
  ].join('\n')
}

function deploymentSection(options: StarterOptions): string {
  if (options.target === 'cloudflare-workers') {
    return [
      '## Deploy',
      '',
      '```sh',
      runScriptCommand(options.packageManager, 'deploy'),
      '```',
    ].join('\n')
  }
  if (options.target === 'aws-lambda') {
    return [
      '## Build',
      '',
      '```sh',
      runScriptCommand(options.packageManager, 'build'),
      '```',
      '',
      'Deploy the `handler` export from `dist/index.mjs` as the AWS Lambda handler.',
    ].join('\n')
  }
  return [
    '## Production',
    '',
    '```sh',
    ...(options.target === 'deno'
      ? []
      : [runScriptCommand(options.packageManager, 'build')]),
    runScriptCommand(options.packageManager, 'start'),
    '```',
  ].join('\n')
}

async function renderTextTemplate(
  path: string,
  values: Readonly<Record<string, string>>,
): Promise<void> {
  let content = await readFile(path, 'utf8')
  for (const [name, value] of Object.entries(values)) {
    content = content.replaceAll(`{{${name}}}`, value)
  }
  await writeFile(path, content, 'utf8')
}

async function replaceText(
  path: string,
  search: string,
  replacement: string,
): Promise<void> {
  const content = await readFile(path, 'utf8')
  await writeFile(path, content.replaceAll(search, replacement), 'utf8')
}

function workerNameFor(packageName: string): string {
  return (
    packageName
      .replace(/[^a-z0-9-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 63) || 'loutre-worker'
  )
}
