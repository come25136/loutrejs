import { expect, it } from 'vitest'
import { contractNameViolations } from '../scripts/contract-names.mjs'

it.each([
  ['const read = mcp.contract({})', ['read']],
  ['const tool = (mcp.contract({}))', ['tool']],
  ['let api: Api = http.contract<Tree>({})', ['api']],
  [
    'const echo = ws.websocket.contract({}), ping = defineMessagePortContract({})',
    ['echo', 'ping'],
  ],
  ['const api = createApiContract(path)', ['api']],
  ['const api = contract()', ['api']],
  ['const port = messagePort.contract({}) satisfies Contract', ['port']],
  ['const read /* Tool */ = mcp.contract({})!', ['read']],
])('契約全体の束縛を検出する: %s', (source, names) => {
  expect(
    [...contractNameViolations(source, 'test.ts')].map(({ name }) => name),
  ).toEqual(names)
})

it('契約名・個別のルート・ツール・無関係なメソッドは許可する', () => {
  const source = `
    const contract = http.contract({})
    const OrdersContract = mcp.contract({})
    const read = OrdersContract.tools.read
    const route = http.contract({}).routes.get
    const tool = mcp.contract({}).tools.read
    const shape = geometry.contract()
    // const read = http.contract({})
    const text = 'const read = http.contract({})'
  `
  expect([...contractNameViolations(source, 'test.ts')]).toEqual([])
})

it('Markdownのコード例で宣言と委譲ルートを識別し、元の行を指す', () => {
  const source = [
    '例: const read = mcp.contract({})',
    '```sh',
    'const read = mcp.contract({})',
    '```',
    '~~~ts',
    'const write = mcp.contract({})',
    'mcp.implementation({ route: Api.routes.mcp })',
    '~~~',
  ].join('\n')
  const violations = [...contractNameViolations(source, 'README.md')]
  expect(
    violations.map(({ name, offset }) => [
      name,
      source.slice(0, offset).split('\n').length,
    ]),
  ).toEqual([
    ['write', 6],
    ['Api', 7],
  ])
})
