import { readFileSync } from 'node:fs'

const packageManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { readonly dependencies: Readonly<Record<string, string>> }
const loutreVersion = packageManifest.dependencies['@loutrejs/loutre']
if (!loutreVersion)
  throw new Error('@loutrejs/loutreのversionがpackage.jsonにありません。')

export function starterFiles(packageName: string): ReadonlyMap<string, string> {
  return new Map([
    ['package.json', renderPackageJson(packageName)],
    ['tsconfig.json', tsconfig],
    ['.gitignore', gitignore],
    ['README.md', readme],
    ['src/app.ts', applicationSource],
    ['src/main.ts', mainSource],
  ])
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
        build: 'tsc',
        start: 'node dist/main.js',
        check: 'tsc --noEmit && loutre check --entry src/app.ts',
      },
      dependencies: {
        '@loutrejs/loutre': loutreVersion,
        '@loutrejs/node': loutreVersion,
        zod: '^4.4.3',
      },
      devDependencies: {
        '@loutrejs/cli': loutreVersion,
        '@types/node': '^22.20.1',
        tsx: '^4.23.12',
        typescript: '^7.0.2',
      },
    },
    null,
    2,
  )}\n`
}

const tsconfig = `{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useDefineForClassFields": true,
    "rootDir": "src",
    "outDir": "dist",
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
`

const gitignore = `node_modules/
dist/
.env
`

const readme = `# Loutre Application

Loutreで作成したNode.js HTTP Applicationです。

## 開発

\`\`\`sh
npm run dev
\`\`\`

<http://127.0.0.1:3000> へアクセスするとJSONレスポンスを返します。

## 検証

\`\`\`sh
npm run check
npm run build
npm start
\`\`\`
`

const applicationSource = `import {
  contract,
  defineApplication,
  defineModule,
  implementation,
  procedure,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

const AppContract = contract(
  {
    hello: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/',
          responses: {
            ok: {
              status: 200,
              body: z.object({
                message: z.string(),
              }),
            },
          },
          pipeline: [http.controller],
        }),
      },
    }),
  },
  { name: 'AppContract' },
)

const AppController = implementation({
  name: 'AppController',
  contract: AppContract,
  protocol: http,
  factory: () => ({
    async hello(ctx) {
      return ctx.response.ok({
        body: { message: 'Hello from Loutre!' },
      })
    },
  }),
})

const AppModule = defineModule(() => ({
  name: 'AppModule',
  description: 'HTTP Applicationのentry module',
  implementations: [AppController],
}))

export default defineApplication({
  modules: [AppModule()],
})
`

const mainSource = `import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const server = await nodeRuntime.serve({
  application,
  hostname: '127.0.0.1',
  port: 3000,
})

console.log('Loutre is swimming at http://127.0.0.1:3000')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close(signal)
  })
}
`
