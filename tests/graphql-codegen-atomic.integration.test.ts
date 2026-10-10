import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '@loutrejs/cli'

const failure = vi.hoisted(() => ({ publish: false }))
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return {
    ...fs,
    rename: async (from: string, to: string) => {
      if (failure.publish && to.endsWith('/generated')) {
        failure.publish = false
        throw new Error('publish failure')
      }
      return fs.rename(from, to)
    },
  }
})

it('全fileをstageし、後続targetのpublish失敗時は全targetの正常世代へ戻す', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'loutre-graphql-atomic-'))
  const stderr: string[] = []
  const invoke = () =>
    runCli(['graphql', 'generate', '--config', 'config.ts'], {
      cwd,
      stdout: () => {},
      stderr: (value) => stderr.push(value),
    })
  try {
    await writeFile(
      join(cwd, 'schema.graphql'),
      'type Query { hello: String! }',
    )
    await writeFile(join(cwd, 'operation.graphql'), 'query Hello { hello }')
    await writeFile(
      join(cwd, 'config.ts'),
      `export default { targets: { server: { kind:'server', schema:['schema.graphql'],  output:'generated' }, client:{kind:'client',schema:['schema.graphql'],documents:['operation.graphql'],output:'client.ts'} } }`,
    )
    expect(await invoke(), stderr.join('\n')).toBe(0)
    const paths = [
      'client.ts',
      ...['types.ts', 'data.ts', 'schema-ast.ts', 'bindings.ts'].map(
        (name) => `generated/${name}`,
      ),
    ]
    const previous = await Promise.all(
      paths.map((path) => readFile(join(cwd, path), 'utf8')),
    )
    await writeFile(join(cwd, 'schema.graphql'), 'type Query { hello: String }')
    failure.publish = true
    expect(await invoke()).toBe(1)
    expect(stderr.join('\n')).toContain('publish failure')
    expect(
      await Promise.all(paths.map((path) => readFile(join(cwd, path), 'utf8'))),
    ).toEqual(previous)
    expect((await readdir(cwd)).some((name) => name.endsWith('.tmp'))).toBe(
      false,
    )
    expect(await invoke()).toBe(0)
    const current = await readFile(join(cwd, 'generated/types.ts'), 'utf8')
    expect(current).not.toEqual(previous[1])
    const fingerprint = current.split('\n')[1]
    for (const file of paths.filter((path) => path.startsWith('generated/')))
      expect((await readFile(join(cwd, file), 'utf8')).split('\n')[1]).toBe(
        fingerprint,
      )
  } finally {
    failure.publish = false
    await rm(cwd, { recursive: true, force: true })
  }
})
