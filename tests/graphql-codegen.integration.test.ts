import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { runCli } from '@loutrejs/cli'
import { buildASTSchema, graphql as execute, Kind } from 'graphql'
import { generatedHeader } from '../packages/cli/src/graphql-codegen.js'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  )
})

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'loutre-graphql-codegen-'))
  directories.push(cwd)
  await writeFile(
    join(cwd, 'schema.graphql'),
    `
    scalar DateTime
    enum Role { MEMBER ADMIN }
    type User { id: ID!, name: String!, friend: User, createdAt: DateTime! }
    type Query { user(id: ID!): User }
    type Subscription { userChanged: User! }
  `,
  )
  await writeFile(
    join(cwd, 'operation.graphql'),
    'query UserName($id: ID!) { user(id: $id) { name createdAt } }',
  )
  const config = {
    targets: {
      server: {
        kind: 'server',
        schema: ['*.graphql'],
        output: 'generated',
        mappers: { User: '../domain.js#User' },
        scalars: { DateTime: { input: 'Date', output: 'Date' } },
      },
      client: {
        kind: 'client',
        schema: ['schema.graphql'],
        documents: ['operation.graphql'],
        output: 'client.ts',
        scalars: { DateTime: 'string' },
      },
    },
  }
  config.targets.server.schema = ['schema.graphql']
  await writeFile(join(cwd, 'config.json'), JSON.stringify(config))
  const stdout: string[] = [],
    stderr: string[] = []
  const invoke = (args: string[]) =>
    runCli(['graphql', ...args], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    })
  return { cwd, config, stdout, stderr, invoke }
}

describe('GraphQL CLI', () => {
  it.each([{ MEMBER: 0, ADMIN: 2 }, '../domain.js#Role'])(
    'serverのEnum対応%sを引数・Input Object・通常とBatchの戻り値へ反映する',
    async (enumMapping) => {
      const f = await fixture()
      await writeFile(
        join(f.cwd, 'schema.graphql'),
        'enum Role { MEMBER ADMIN } input Options { role:Role = ADMIN } type Query { role(value:Role!, options:Options):Role! }',
      )
      await writeFile(
        join(f.cwd, 'config.json'),
        JSON.stringify({
          targets: {
            server: {
              kind: 'server',
              schema: ['schema.graphql'],
              output: 'generated',
              enumValues: { Role: enumMapping },
            },
          },
        }),
      )
      expect(
        await f.invoke(['generate', '--config', 'config.json']),
        f.stderr.join('\n'),
      ).toBe(0)
      const types = await readFile(join(f.cwd, 'generated/types.ts'), 'utf8')
      expect(types).toContain("value: ResolversTypes['Role']")
      expect(types).toContain("role: InputMaybe<ResolversTypes['Role']>")
      expect(types).toContain("ResolversTypes['Role'],")
      expect(types).not.toContain('Role: null')
      if (typeof enumMapping === 'string')
        expect(types).toContain("from '../domain.js'")
      else expect(types).toContain('export type Role = 0 | 2')
    },
  )
  it('Enumの戻り値をnullable・listも含めてEnum型として生成する', async () => {
    const f = await fixture()
    await writeFile(
      join(f.cwd, 'schema.graphql'),
      `
      enum Status { ACTIVE INACTIVE }
      type Query { status: Status!, optionalStatus: Status, statuses: [Status]!, optionalStatuses: [Status!] }
    `,
    )
    await writeFile(
      join(f.cwd, 'config.json'),
      JSON.stringify({
        targets: {
          server: {
            kind: 'server',
            schema: ['schema.graphql'],
            output: 'generated',
          },
        },
      }),
    )
    expect(
      await f.invoke([
        'generate',
        '--config',
        'config.json',
        '--target',
        'server',
      ]),
      f.stderr.join('\n'),
    ).toBe(0)
    const types = await readFile(join(f.cwd, 'generated/types.ts'), 'utf8')
    expect(types).not.toContain("ResolversParentTypes['Status']")
    expect(types).toContain("Maybe<ReadonlyArray<ResolversTypes['Status']>>")
    expect(types).toContain("ReadonlyArray<Maybe<ResolversTypes['Status']>>")
    expect(types).toContain("Maybe<ResolversTypes['Status']>")
  })
  it('Applicationなしでdomain mappingとContextがgenericなResolver型、選択fieldだけのclient型を生成する', async () => {
    const f = await fixture()
    await writeFile(
      join(f.cwd, 'operation.graphql'),
      'query UserName($id: ID! = "/** keep */") { user(id: $id) { name createdAt } }',
    )
    expect(
      await f.invoke(['generate', '--config', 'config.json']),
      f.stderr.join('\n'),
    ).toBe(0)
    const server = await readFile(join(f.cwd, 'generated/types.ts'), 'utf8')
    const client = await readFile(join(f.cwd, 'client.ts'), 'utf8')
    expect(server).toContain('User as UserDomain')
    expect(server).not.toContain('AppContext')
    expect(server).not.toContain('../context')
    expect(server).toContain('ContextType = object')
    expect(server).toContain('input: Date')
    expect(server).toContain('export interface SchemaFields')
    expect(client).toContain('UserNameQueryVariables')
    expect(client).toContain('UserNameDocument')
    expect(client).toContain('/** keep */')
    expect(client).toContain('createdAt: string')
    expect(client).not.toContain('AppContext')
    expect(client).not.toContain('../domain')
    expect(client).not.toContain(f.cwd)
    expect(
      await f.invoke(['generate', '--config', 'config.json', '--check']),
    ).toBe(0)
    const original = server
    await writeFile(
      join(f.cwd, 'schema.graphql'),
      (await readFile(join(f.cwd, 'schema.graphql'), 'utf8')).replace(
        'name: String!',
        'name: String',
      ),
    )
    expect(
      await f.invoke(['generate', '--config', 'config.json', '--check']),
    ).toBe(1)
    expect(await readFile(join(f.cwd, 'generated/types.ts'), 'utf8')).toBe(
      original,
    )
  })

  it('targetを選択し、入力globをconfigの位置から解決する', async () => {
    const f = await fixture()
    expect(
      await runCli(
        [
          'graphql',
          'generate',
          '--config',
          join(f.cwd, 'config.json'),
          '--target',
          'server',
        ],
        { cwd: '/', stdout: () => {}, stderr: (text) => f.stderr.push(text) },
      ),
    ).toBe(0)
    await expect(readFile(join(f.cwd, 'client.ts'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(
      await f.invoke([
        'generate',
        '--config',
        'config.json',
        '--target',
        'missing',
      ]),
    ).toBe(1)
  })

  it('分割SDLのextendとfragmentを結合し、生成したschemaで実際に実行する', async () => {
    const f = await fixture()
    await writeFile(
      join(f.cwd, 'schema.graphql'),
      'type User { id: ID!, name: String! } type Query { user: User! }',
    )
    await writeFile(
      join(f.cwd, 'extension.graphql'),
      'extend type User { active: Boolean! }',
    )
    await writeFile(
      join(f.cwd, 'operation.graphql'),
      'query UserName { user { ...Identity active } }',
    )
    await writeFile(
      join(f.cwd, 'fragment.graphql'),
      'fragment Identity on User { id name }',
    )
    f.config.targets.server.schema = ['schema.graphql', 'extension.graphql']
    f.config.targets.client.schema = ['schema.graphql', 'extension.graphql']
    f.config.targets.client.documents = [
      'operation.graphql',
      'fragment.graphql',
    ]
    delete (f.config.targets.server.scalars as Record<string, unknown>).DateTime
    delete (f.config.targets.client.scalars as Record<string, unknown>).DateTime
    await writeFile(join(f.cwd, 'config.json'), JSON.stringify(f.config))
    expect(
      await f.invoke(['generate', '--config', 'config.json']),
      f.stderr.join('\n'),
    ).toBe(0)
    const staticSchema = await readFile(
      join(f.cwd, 'generated/schema-ast.ts'),
      'utf8',
    )
    const document = Function(
      'Kind',
      'return (' + staticSchema.split(' = ')[1]! + ')',
    )(Kind)
    const schema = buildASTSchema(document)
    schema.getQueryType()!.getFields().user!.resolve = () => ({
      id: '1',
      name: 'Loutre',
      active: true,
    })
    expect(
      await execute({ schema, source: 'query { user { id active } }' }),
    ).toMatchObject({ data: { user: { id: '1', active: true } } })
  })

  it.each([
    'scalar',
    'mapper',
    'operation',
    'clientMapper',
    'enumType',
    'enumValue',
    'clientEnumValues',
    'unknownOption',
    'duplicateOutput',
    'anonymous',
    'missingInput',
  ])('%sが不正なら生成物を一つも書かない', async (mode) => {
    const f = await fixture()
    const config: Record<string, any> = f.config
    if (mode === 'scalar') delete config.targets.server.scalars
    if (mode === 'mapper')
      config.targets.server.mappers.Unknown = '../domain.js#Unknown'
    if (mode === 'operation')
      await writeFile(
        join(f.cwd, 'operation.graphql'),
        'query Wrong { absent }',
      )
    if (mode === 'anonymous')
      await writeFile(
        join(f.cwd, 'operation.graphql'),
        '{ user(id: "1") { id } }',
      )
    if (mode === 'clientMapper')
      config.targets.client.mappers = { User: '../domain.js#User' }
    if (mode === 'enumType') config.targets.server.enumValues = { User: {} }
    if (mode === 'enumValue')
      config.targets.server.enumValues = { Role: { UNKNOWN: 1 } }
    if (mode === 'clientEnumValues')
      config.targets.client.enumValues = { Role: { MEMBER: 1 } }
    if (mode === 'unknownOption') config.targets.server.plugin = 'custom'
    if (mode === 'duplicateOutput')
      config.targets.client.output = config.targets.server.output
    if (mode === 'missingInput')
      config.targets.server.schema = ['missing/*.graphql']
    await writeFile(join(f.cwd, 'config.json'), JSON.stringify(config))
    expect(await f.invoke(['generate', '--config', 'config.json'])).toBe(1)
    await expect(
      readFile(join(f.cwd, 'generated/types.ts')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(f.stderr.length).toBeGreaterThan(0)
  })

  it('生成物以外のfileを上書きしない', async () => {
    const f = await fixture()
    f.config.targets.server.output = 'domain.ts'
    await writeFile(join(f.cwd, 'config.json'), JSON.stringify(f.config))
    await writeFile(
      join(f.cwd, 'domain.ts'),
      'export interface User { id: string }',
    )
    expect(await f.invoke(['generate', '--config', 'config.json'])).toBe(1)
    expect(await readFile(join(f.cwd, 'domain.ts'), 'utf8')).toBe(
      'export interface User { id: string }',
    )
    await expect(readFile(join(f.cwd, 'client.ts'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('schemaの破壊的変更とdangerous changeを分類する', async () => {
    const f = await fixture()
    expect(await f.invoke(['validate', '--schema', 'schema.graphql'])).toBe(0)
    await writeFile(
      join(f.cwd, 'next.graphql'),
      (await readFile(join(f.cwd, 'schema.graphql'), 'utf8'))
        .replace('name: String!, ', '')
        .replace('MEMBER ADMIN', 'MEMBER ADMIN OWNER'),
    )
    expect(
      await f.invoke([
        'diff',
        '--before',
        'schema.graphql',
        '--after',
        'next.graphql',
        '--json',
      ]),
    ).toBe(1)
    const changes = JSON.parse(f.stdout.at(-1)!)
    expect(changes.breaking).toContainEqual(
      expect.objectContaining({ type: 'FIELD_REMOVED' }),
    )
    expect(changes.dangerous).toContainEqual(
      expect.objectContaining({ type: 'VALUE_ADDED_TO_ENUM' }),
    )
  })

  it.each([
    ['generate'],
    ['generate', '--config'],
    ['generate', '--config', 'x', '--watch', '--check'],
    ['validate', '--schema', 'x', '--target', 'x'],
    ['diff', '--before', 'x'],
  ])('引数が不正ならexit code 2を返す: %j', async (...args) => {
    const f = await fixture()
    expect(await f.invoke(args)).toBe(2)
  })

  it('watchがSDL変更とエラーからの回復を反映し、SIGTERMで終了する', async () => {
    const f = await fixture()
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import { runCli } from ${JSON.stringify(new URL('../packages/cli/src/index.ts', import.meta.url).href)}; process.exitCode = await runCli(['graphql','generate','--config',${JSON.stringify(join(f.cwd, 'config.json'))},'--watch'], { cwd: ${JSON.stringify(f.cwd)}, stdout: console.log, stderr: console.error })`,
      ],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    try {
      await vi.waitFor(() => expect(output).toContain('監視しています'), {
        timeout: 10000,
      })
      const path = join(f.cwd, 'generated/types.ts')
      const previous = await readFile(path, 'utf8')
      await writeFile(join(f.cwd, 'schema.graphql'), 'type Query {')
      await vi.waitFor(() => expect(output).toContain('Syntax Error'), {
        timeout: 5000,
      })
      expect(await readFile(path, 'utf8')).toBe(previous)
      await writeFile(
        join(f.cwd, 'schema.graphql'),
        'type Query { hello: String! }',
      )
      f.config.targets.server.mappers =
        {} as typeof f.config.targets.server.mappers
      f.config.targets.client.schema = ['schema.graphql']
      await writeFile(join(f.cwd, 'operation.graphql'), 'query Hello { hello }')
      delete (f.config.targets.server.scalars as Record<string, unknown>)
        .DateTime
      delete (f.config.targets.client.scalars as Record<string, unknown>)
        .DateTime
      await writeFile(join(f.cwd, 'config.json'), JSON.stringify(f.config))
      await vi.waitFor(
        async () => expect(await readFile(path, 'utf8')).toContain('hello'),
        { timeout: 5000 },
      )
      const exited = new Promise<number | null>((resolve) =>
        child.once('exit', resolve),
      )
      child.kill('SIGTERM')
      expect(await exited).toBe(0)
      expect((await readFile(path, 'utf8')).startsWith(generatedHeader)).toBe(
        true,
      )
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  }, 20000)
})

it('旧生成物のdata.tsを削除し、手書きのdata.tsは保護する', async () => {
  const f = await fixture()
  expect(await f.invoke(['generate', '--config', 'config.json'])).toBe(0)
  const path = join(f.cwd, 'generated/data.ts')
  const previous = `${generatedHeader}export const createData = () => ({})\n`
  await writeFile(path, previous)
  expect(
    await f.invoke(['generate', '--config', 'config.json', '--check']),
  ).toBe(1)
  expect(await readFile(path, 'utf8')).toBe(previous)
  expect(await f.invoke(['generate', '--config', 'config.json'])).toBe(0)
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  const handwritten = 'export const userData = {}\n'
  await writeFile(path, handwritten)
  expect(await f.invoke(['generate', '--config', 'config.json'])).toBe(1)
  expect(await readFile(path, 'utf8')).toBe(handwritten)
})

it('TypeScript設定から型付きBindingとschemaを生成し、Applicationのimportを含めない', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'loutre-graphql-config-'))
  directories.push(cwd)
  await writeFile(join(cwd, 'schema.graphql'), 'type Query { hello: String! }')
  await writeFile(
    join(cwd, 'resolvers.ts'),
    'throw new Error("ResolverをCLIから実行しない")',
  )
  const config = `import type { GraphQLCodegenConfig } from '@loutrejs/cli'; export default {targets:{server:{kind:'server',schema:['schema.graphql'],output:'generated'}}} satisfies GraphQLCodegenConfig`
  await writeFile(join(cwd, 'config.ts'), config)
  const stderr: string[] = []
  const invoke = () =>
    runCli(['graphql', 'generate', '--config', 'config.ts'], {
      cwd,
      stdout: () => {},
      stderr: (value) => stderr.push(value),
    })
  expect(await invoke(), stderr.join('\n')).toBe(0)
  const schema = await readFile(join(cwd, 'generated/schema-ast.ts'), 'utf8')
  const types = await readFile(join(cwd, 'generated/types.ts'), 'utf8')
  const bindings = await readFile(join(cwd, 'generated/bindings.ts'), 'utf8')
  expect(schema).not.toContain("from '../resolvers")
  expect(schema).not.toContain('bindManifest')
  expect(schema).not.toContain('./types.js')
  expect(schema).not.toContain('@loutrejs/graphql')
  expect(schema).not.toContain('Context')
  expect(bindings).toContain('resolvers: Resolvers<Context>')
  expect(bindings).not.toContain('../context')
  expect(bindings).not.toContain('../resolvers')
  expect(schema).not.toContain(' as unknown')
  expect(schema).toContain('schemaDocument: DocumentNode')
  expect(types).not.toContain('bindManifest')
  expect(types).toContain('import type')
  expect(types).not.toContain('../context')
  const previous = types
  await writeFile(join(cwd, 'config.ts'), `import './resolvers.ts';${config}`)
  expect(await invoke()).toBe(1)
  expect(stderr.join('\n')).not.toContain('ResolverをCLIから実行しない')
  expect(await readFile(join(cwd, 'generated/types.ts'), 'utf8')).toBe(previous)
})
