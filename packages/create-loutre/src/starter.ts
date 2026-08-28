import { readFileSync } from 'node:fs'
import { cp, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { readonly dependencies: Readonly<Record<string, string>> }
const loutreVersion = packageManifest.dependencies['@loutrejs/loutre']
if (!loutreVersion)
  throw new Error('@loutrejs/loutreのversionがpackage.jsonにありません。')

const templateDirectory = fileURLToPath(
  new URL('../templates/default/', import.meta.url),
)

const renamedTemplateFiles = new Map([
  ['_gitignore', '.gitignore'],
  ['_oxlintrc.json', '.oxlintrc.json'],
  ['_oxfmtrc.json', '.oxfmtrc.json'],
])

export async function writeStarter(
  targetDirectory: string,
  packageName: string,
): Promise<void> {
  await cp(templateDirectory, targetDirectory, { recursive: true })
  for (const [source, destination] of renamedTemplateFiles) {
    await rename(
      join(targetDirectory, source),
      join(targetDirectory, destination),
    )
  }
  await writeFile(
    join(targetDirectory, 'package.json'),
    renderPackageJson(packageName),
    'utf8',
  )
}

function renderPackageJson(packageName: string): string {
  return `${JSON.stringify(
    {
      name: packageName,
      version: '0.1.0',
      private: true,
      type: 'module',
      engines: {
        node: '>=22',
      },
      scripts: {
        dev: 'tsx watch src/main.ts',
        build: 'tsc -p tsconfig.build.json',
        start: 'node dist/main.js',
        typecheck: 'tsc --noEmit',
        check: 'npm run typecheck && loutre check --entry src/app.ts',
        test: 'vitest run',
        'test:watch': 'vitest',
        lint: 'oxlint',
        'lint:fix': 'oxlint --fix',
        format: 'oxfmt',
        'format:check': 'oxfmt --check',
        verify:
          'npm run format:check && npm run lint && npm run check && npm test && npm run build',
      },
      dependencies: {
        '@loutrejs/loutre': loutreVersion,
        '@loutrejs/node': loutreVersion,
        zod: '^4.4.3',
      },
      devDependencies: {
        '@loutrejs/cli': loutreVersion,
        '@types/node': '^22.20.1',
        oxfmt: '^0.65.0',
        oxlint: '^1.80.0',
        tsx: '^4.23.12',
        typescript: '^7.0.2',
        vitest: '^4.1.11',
      },
    },
    null,
    2,
  )}\n`
}
