import {
  buildASTSchema,
  parse,
  GraphQLScalarType,
  isObjectType,
  isInterfaceType,
} from 'graphql'
import {
  createSchemaData,
  data,
  type FieldSpec,
  type FieldSelection,
} from '@loutrejs/graphql/data'
import { bindManifest } from '@loutrejs/graphql/runtime'
import { getManifest } from '../packages/graphql/src/manifest-internal.js'
import {
  executeManifest,
  subscribeManifest,
} from '../packages/graphql/src/execution.js'

const basic = `type Child { id: ID!, name: String! } type Parent { id: ID!, child: Child } type Query { parents: [Parent!]! }`
type DynamicFields = Record<
  string,
  Record<string, FieldSpec<any, any, any, any>>
>
function fixture(
  sdl: string,
  build: (d: ReturnType<typeof createSchemaData<DynamicFields>>) => object,
  context: object = {},
) {
  const document = parse(sdl, { noLocation: true })
  const schema = buildASTSchema(document)
  const identities = Object.fromEntries(
    Object.values(schema.getTypeMap())
      .filter(
        (type) =>
          (isObjectType(type) || isInterfaceType(type)) &&
          !type.name.startsWith('__'),
      )
      .map((type) => [
        type.name,
        Object.fromEntries(
          Object.keys((type as any).getFields()).map((name) => [
            name,
            `${type.name}.${name}`,
          ]),
        ),
      ]),
  )
  const d = createSchemaData<DynamicFields>(identities)
  const manifest = bindManifest({
    schemaDocument: document,
    resolvers: build(d),
  })
  const bound = getManifest(manifest)
  const controller = new AbortController()
  const annotations: Record<string, unknown>[] = []
  const options = {
    signal: controller.signal,
    annotate: (attributes: Record<string, unknown>) =>
      annotations.push(attributes),
  }
  return {
    controller,
    annotations,
    query: (source: string, variableValues: Record<string, unknown> = {}) =>
      executeManifest(
        bound,
        {
          schema: bound.schema,
          document: parse(source),
          contextValue: context,
          variableValues,
        },
        options,
      ),
    subscribe: (source: string, variableValues: Record<string, unknown> = {}) =>
      subscribeManifest(
        bound,
        {
          schema: bound.schema,
          document: parse(source),
          contextValue: context,
          variableValues,
        },
        options,
      ),
  }
}

it('200個のParentを順序を保ってmaxBatchSizeで分割し、SourceへRequiredを渡す', async () => {
  const parents = Array.from({ length: 200 }, (_, id) => ({
    id: String(id),
    childId: `child-${id}`,
  }))
  const load = vi.fn((values: readonly any[]) =>
    values.map((parent) => ({ id: parent.childId, name: parent.id })),
  )
  let demand: FieldSelection | undefined
  const f = fixture(basic, (d) => ({
    Query: {
      parents: d.Query!.parents!.source((input) => {
        demand = input.demand
        return parents
      }),
    },
    Parent: {
      child: d.Parent!.child!.field({
        requires: ['childId'],
        load,
        maxBatchSize: 64,
      }),
    },
  }))
  const result = await f.query('{ parents { child { id name } } }')
  expect(result.errors).toBeUndefined()
  expect(
    (result.data!.parents as any[]).map((parent) => parent.child.id),
  ).toEqual(parents.map((parent) => parent.childId))
  expect(load.mock.calls.map(([values]) => values.length)).toEqual([
    64, 64, 64, 8,
  ])
  expect(demand!.children[0]).toMatchObject({
    fieldName: 'child',
    requires: ['childId'],
    prefetchable: true,
  })
  expect(f.annotations.at(-1)).toMatchObject({
    'graphql.data.batch.call_count': 4,
    'graphql.data.batch.parent_count': 200,
  })
})

it('null・空配列・false・0・空文字を先読み値として再利用する', async () => {
  const load = vi.fn(() => [])
  const f = fixture(
    'type Parent { nullable: String, children: [String!]!, flag: Boolean!, count: Int!, text: String! } type Query { parent: Parent! }',
    (d) => ({
      Query: {
        parent: () => ({
          nullable: null,
          children: [],
          flag: false,
          count: 0,
          text: '',
        }),
      },
      Parent: Object.fromEntries(
        ['nullable', 'children', 'flag', 'count', 'text'].map((name) => [
          name,
          d.Parent![name]!.field({ load }),
        ]),
      ),
    }),
  )
  expect(
    await f.query('{ parent { nullable children flag count text } }'),
  ).toEqual({
    data: {
      parent: { nullable: null, children: [], flag: false, count: 0, text: '' },
    },
  })
  expect(load).not.toHaveBeenCalled()
  expect(f.annotations.at(-1)).toMatchObject({
    'graphql.data.field.reused_count': 5,
  })
})

it('prototypeとgetterを自動readで実行せず、未取得値をloadする', async () => {
  const getter = vi.fn(() => {
    throw new Error('getterを実行しない')
  })
  const parent = Object.create({ child: { id: 'wrong', name: 'wrong' } })
  Object.defineProperty(parent, 'child', { get: getter })
  const f = fixture(basic, (d) => ({
    Query: { parents: () => [parent] },
    Parent: {
      child: d.Parent!.child!.field({
        load: () => [{ id: 'loaded', name: 'loaded' }],
      }),
    },
  }))
  expect(await f.query('{ parents { child { id } } }')).toEqual({
    data: { parents: [{ child: { id: 'loaded' } }] },
  })
  expect(getter).not.toHaveBeenCalled()
})

it('引数付きFieldの自動reuseを禁止し、引数に一致する明示readだけ再利用する', async () => {
  const load = vi.fn((_parents: readonly any[], { args }: any) => [
    { id: String(args.first), name: 'load' },
  ])
  const f = fixture(
    basic.replace('child: Child', 'child(first: Int! = 1): Child'),
    (d) => ({
      Query: { parents: () => [{ child: { id: 'unsafe', name: 'unsafe' } }] },
      Parent: { child: d.Parent!.child!.field({ load }) },
    }),
  )
  expect(await f.query('{ parents { child { id } } }')).toEqual({
    data: { parents: [{ child: { id: '1' } }] },
  })
  expect(load).toHaveBeenCalledOnce()
  const read = fixture(
    basic.replace('child: Child', 'child(first: Int! = 1): Child'),
    (d) => ({
      Query: {
        parents: () => [
          { page: { first: 1, value: { id: 'safe', name: 'safe' } } },
        ],
      },
      Parent: {
        child: d.Parent!.child!.field({
          read: ({ parent, args }) =>
            parent.page.first === args.first
              ? data.loaded(parent.page.value)
              : data.missing,
          load,
        }),
      },
    }),
  )
  expect(await read.query('{ parents { child { id } } }')).toEqual({
    data: { parents: [{ child: { id: 'safe' } }] },
  })
  expect(load).toHaveBeenCalledOnce()
})

it('内部キー欠落と戻り値の要素数不一致をGraphQL Field Errorへ変換する', async () => {
  const load = vi.fn(() => [])
  const missing = fixture(basic, (d) => ({
    Query: { parents: () => [{}] },
    Parent: { child: d.Parent!.child!.field({ requires: ['childId'], load }) },
  }))
  const result = await missing.query('{ parents { child { id } } }')
  expect(result.errors![0]).toMatchObject({ path: ['parents', 0, 'child'] })
  expect(result.errors![0]!.message).toContain('childId')
  expect(load).not.toHaveBeenCalled()
  const mismatch = fixture(basic, (d) => ({
    Query: { parents: () => [{}, {}] },
    Parent: { child: d.Parent!.child!.field({ load }) },
  }))
  expect(
    (await mismatch.query('{ parents { child { id } } }')).errors,
  ).toHaveLength(2)
})

it('Authorizationをread / reuse / loadより先に適用し、wrapperのMetadataを保つ', async () => {
  const read = vi.fn(() => data.loaded({ id: 'private', name: 'private' }))
  const load = vi.fn(() => [])
  const f = fixture(basic, (d) => ({
    Query: { parents: () => [{ child: { id: 'private' } }] },
    Parent: {
      child: data.authorize(d.Parent!.child!.field({ read, load }), () => {
        throw new Error('Forbidden')
      }),
    },
  }))
  const result = await f.query('{ parents { child { id } } }')
  expect(result.errors![0]!.message).toBe('Forbidden')
  expect(read).not.toHaveBeenCalled()
  expect(load).not.toHaveBeenCalled()
})

it('object key順・default引数・aliasを正規化し、異なる引数を混同しない', async () => {
  const load = vi.fn((parents: readonly any[], { args }: any) =>
    parents.map(() => ({ id: String(args.options.first), name: 'n' })),
  )
  const sdl =
    basic.replace('child: Child', 'child(options: Options! = {}): Child') +
    ' input Options { first: Int! = 1, reverse: Boolean! = false }'
  const f = fixture(sdl, (d) => ({
    Query: { parents: () => [{ id: '1' }, { id: '2' }] },
    Parent: { child: d.Parent!.child!.field({ load }) },
  }))
  expect(
    (
      await f.query(
        '{ parents { a: child { id } b: child(options:{reverse:false,first:1}) { id } c:child(options:{first:2}) { id } } }',
      )
    ).errors,
  ).toBeUndefined()
  expect(load).toHaveBeenCalledTimes(2)
  expect(load.mock.calls.map(([parents]) => parents.length)).toEqual([2, 2])
})

it('Dateを返すCustom Scalar引数を安全に別Batchへ分離する', async () => {
  const load = vi.fn((parents: readonly any[]) =>
    parents.map(() => ({ id: '1', name: '1' })),
  )
  const f = fixture(
    basic.replace('child: Child', 'child(at: DateTime!): Child') +
      ' scalar DateTime',
    (d) => ({
      DateTime: new GraphQLScalarType({
        name: 'DateTime',
        serialize: (value) => String(value),
        parseValue: (value) => new Date(String(value)),
      }),
      Query: { parents: () => [{}, {}] },
      Parent: { child: d.Parent!.child!.field({ load }) },
    }),
  )
  expect(
    (
      await f.query('query($at:DateTime!){ parents { child(at:$at){id} } }', {
        at: '2026-01-01',
      })
    ).errors,
  ).toBeUndefined()
  expect(load).toHaveBeenCalledTimes(2)
})

it('互換性のないSelectionを別Batchにし、aliasだけでは分割しない', async () => {
  const load = vi.fn((parents: readonly any[]) =>
    parents.map(() => ({ id: '1', name: 'n' })),
  )
  const f = fixture(basic, (d) => ({
    Query: { parents: () => [{}, {}] },
    Parent: { child: d.Parent!.child!.field({ load }) },
  }))
  expect(
    (
      await f.query(
        '{parents{ a:child {id} b:child {alias:id} c:child{name} }}',
      )
    ).errors,
  ).toBeUndefined()
  expect(load.mock.calls.map(([parents]) => parents.length)).toEqual([2, 2])
})

it('同じIDの異なるtenant / revisionのParentを共有せず、完了値をcacheしない', async () => {
  const load = vi.fn((parents: readonly any[]) =>
    parents.map((parent) => ({
      id: parent.id,
      name: `${parent.tenant}-${parent.revision}`,
    })),
  )
  const parents = [
    { id: 'same', tenant: 'a', revision: 1 },
    { id: 'same', tenant: 'b', revision: 2 },
  ]
  const f = fixture(basic, (d) => ({
    Query: { parents: () => parents },
    Parent: { child: d.Parent!.child!.field({ load }) },
  }))
  expect(await f.query('{parents{child{name}}}')).toEqual({
    data: { parents: [{ child: { name: 'a-1' } }, { child: { name: 'b-2' } }] },
  })
  parents[0]!.revision = 3
  expect(await f.query('{parents{child{name}}}')).toMatchObject({
    data: { parents: [{ child: { name: 'a-3' } }, { child: { name: 'b-2' } }] },
  })
  expect(load).toHaveBeenCalledTimes(2)
})

it('Mutation root field間で同じParentの取得済み値を共有しない', async () => {
  let revision = 0
  const parent = { id: '1' }
  const load = vi.fn(() => [{ id: '1', name: String(revision) }])
  const f = fixture(basic + ' type Mutation { change: [Parent!]! }', (d) => ({
    Query: { parents: () => [parent] },
    Mutation: {
      change: () => {
        revision++
        return [parent]
      },
    },
    Parent: { child: d.Parent!.child!.field({ load }) },
  }))
  expect(
    await f.query('mutation{ a:change {child{name}} b:change {child{name}} }'),
  ).toEqual({
    data: { a: [{ child: { name: '1' } }], b: [{ child: { name: '2' } }] },
  })
  expect(load).toHaveBeenCalledTimes(2)
})

it('SubscriptionのDelivery EventごとにScopeを作り、同じParentの更新を再取得する', async () => {
  let revision = 0
  const parent = { id: '1' }
  const load = vi.fn(() => [{ id: '1', name: String(revision) }])
  const f = fixture(
    basic + ' type Subscription { ticks: [Parent!]! }',
    (d) => ({
      Query: { parents: () => [parent] },
      Subscription: {
        ticks: {
          subscribe: async function* () {
            revision++
            yield [parent]
            revision++
            yield [parent]
          },
          resolve: (value: unknown) => value,
        },
      },
      Parent: { child: d.Parent!.child!.field({ load }) },
    }),
  )
  const stream = await f.subscribe('subscription{ticks{child{name}}}')
  if (!(Symbol.asyncIterator in stream))
    throw new Error('Subscription streamが必要です。')
  expect((await stream.next()).value).toEqual({
    data: { ticks: [{ child: { name: '1' } }] },
  })
  expect((await stream.next()).value).toEqual({
    data: { ticks: [{ child: { name: '2' } }] },
  })
  await stream.return!()
  expect(load).toHaveBeenCalledTimes(2)
})

it('並行Operationを別Scopeにし、中断後は新しいBatchを実行しない', async () => {
  const load = vi.fn((parents: readonly any[]) =>
    parents.map(() => ({ id: '1', name: 'n' })),
  )
  const f = fixture(basic, (d) => ({
    Query: { parents: () => [{}, {}] },
    Parent: { child: d.Parent!.child!.field({ load }) },
  }))
  await Promise.all([
    f.query('{parents{child{id}}}'),
    f.query('{parents{child{id}}}'),
  ])
  expect(load.mock.calls.map(([parents]) => parents.length)).toEqual([2, 2])
  const pending = f.query('{parents{child{id}}}')
  f.controller.abort(new Error('cancel'))
  expect((await pending).errors).toBeDefined()
  expect(load).toHaveBeenCalledTimes(2)
})

it('fragment / directive / abstract typeをDemandへ反映し、__typenameに依存を追加しない', async () => {
  let demand: FieldSelection | undefined
  const sdl =
    'interface Node { id:ID! } type Parent implements Node {id:ID!,child:Child} type Other implements Node{id:ID!,other:String} type Child{id:ID!,name:String!} type Query{node:Node!}'
  const f = fixture(sdl, (d) => ({
    Query: {
      node: d.Query!.node!.source((input) => {
        demand = input.demand
        return { __typename: 'Parent', id: 'p' }
      }),
    },
    Parent: {
      child: d.Parent!.child!.field({
        requires: ['id'],
        load: () => [{ id: '1', name: 'n' }],
      }),
    },
  }))
  expect(
    (
      await f.query(
        'query($show:Boolean!){node{__typename ...Parts ... on Other{other} ... on Parent{alias:child @include(if:$show){name}}}} fragment Parts on Parent{child{id}}',
        { show: false },
      )
    ).errors,
  ).toBeUndefined()
  expect(
    demand!.children.some(
      (field) => field.fieldName === 'other' && field.parentType === 'Other',
    ),
  ).toBe(true)
  expect(
    demand!.children.filter((field) => field.fieldName === 'child'),
  ).toHaveLength(1)
  expect(
    demand!.children.find((field) => field.fieldName === '__typename')!
      .requires,
  ).toEqual([])
  expect(
    demand!.children.find((field) => field.fieldName === 'child')!.requires,
  ).toEqual(['id'])
})

it('Data ResolverのField Identity不一致とunknown FieldをBinding時に拒否する', () => {
  expect(() =>
    fixture(basic, (d) => ({
      Query: { parents: () => [] },
      Parent: { absent: d.Parent!.child!.field({ load: () => [] }) },
    })),
  ).toThrow('存在しないResolver Field')
  expect(() =>
    fixture(basic, (d) => ({
      Query: { parents: d.Parent!.child!.source(() => []) },
    })),
  ).toThrow('Field Identity')
})

it('Metadataを失うwrapperとincremental directiveを明示的に拒否する', async () => {
  const f = fixture(basic, (d) => {
    const resolver = d.Parent!.child!.field({
      load: () => [{ id: '1', name: '1' }],
    })
    return {
      Query: { parents: () => [{}] },
      Parent: {
        child: (...args: Parameters<typeof resolver>) => resolver(...args),
      },
    }
  })
  expect((await f.query('{parents{child{id}}}')).errors![0]!.message).toContain(
    'Metadata',
  )
  expect(
    (await f.query('{parents @defer{child{id}}}')).errors![0]!.message,
  ).toContain('@defer')
  expect(() => data.loaded(undefined as never)).toThrow('loaded(undefined)')
})

it('Scalar / enum Binding後のdefault Argumentsをcoerceし、Abstract TypeのResolverを維持する', async () => {
  const f = fixture(
    'scalar DateTime enum Role { MEMBER ADMIN } input Options { at:DateTime = "2026-01-01", role:Role = ADMIN } type Query { check(options:Options! = {}):String! }',
    () => ({
      DateTime: new GraphQLScalarType({
        name: 'DateTime',
        serialize: (value) => String(value),
        parseValue: (value) => new Date(String(value)),
      }),
      Role: { MEMBER: 1, ADMIN: 2 },
      Query: {
        check: (
          _parent: unknown,
          { options }: { options: { at: Date; role: number } },
        ) => `${options.at.toISOString()}:${options.role}`,
      },
    }),
  )
  expect(await f.query('{check}')).toEqual({
    data: { check: '2026-01-01T00:00:00.000Z:2' },
  })
})

it('Execution Context ViewでClassのprivate field / getter / methodを壊さない', async () => {
  class Context {
    #value = 'private-context'
    get value() {
      return this.#value
    }
    read() {
      return this.#value
    }
  }
  const f = fixture(
    'type Query { value:String! }',
    (d) => ({
      Query: {
        value: d.Query!.value!.source(
          ({ context }) => `${context.value}:${context.read()}`,
        ),
      },
    }),
    Object.freeze(new Context()),
  )
  expect(await f.query('{value}')).toEqual({
    data: { value: 'private-context:private-context' },
  })
})

it('Opaque Scalarのplain objectと循環値も保守的に分離する', async () => {
  const load = vi.fn((parents: readonly any[]) =>
    parents.map(() => ({ id: '1', name: 'n' })),
  )
  const sdl =
    basic.replace('child: Child', 'child(token: Token!): Child') +
    ' scalar Token'
  const f = fixture(sdl, (d) => ({
    Token: new GraphQLScalarType({
      name: 'Token',
      serialize: (value) => String(value),
      parseValue: () => {
        const value: Record<string, unknown> = {}
        value.self = value
        return value
      },
    }),
    Query: { parents: () => [{}, {}] },
    Parent: { child: d.Parent!.child!.field({ load }) },
  }))
  expect(
    (
      await f.query('query($token:Token!){parents{child(token:$token){id}}}', {
        token: 'opaque',
      })
    ).errors,
  ).toBeUndefined()
  expect(load).toHaveBeenCalledTimes(2)
})
