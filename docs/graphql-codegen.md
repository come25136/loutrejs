# GraphQL Code Generation and Data Resolution

Share SDL as the contract, and use the CLI to generate types, a static schema, and typed bindings from the same input. The Application connects the schema and resolvers with `bindManifest` and passes the resulting manifest to the endpoint. Generated Modules do not import the Application; schema construction and resolver binding occur once during Application initialization.

```sh
npm install @loutrejs/loutre @loutrejs/graphql graphql
npm install --save-dev @loutrejs/cli
```

## Configuration and Generation

Export a static object literal from `graphql.config.ts`. Type-only imports and `satisfies` are supported. Function calls, spreads, and value imports are not evaluated. JSON configuration uses the same `targets` structure.

```ts
import type { GraphQLCodegenConfig } from '@loutrejs/cli'

export default {
  targets: {
    server: {
      kind: 'server',
      schema: ['contracts/**/*.graphql'],
      output: 'src/graphql/generated',
      mappers: {
        OrderItem: '../../domain/order.js#OrderItem',
        Product: '../../domain/product.js#Product',
      },
    },
    client: {
      kind: 'client',
      schema: ['contracts/**/*.graphql'],
      documents: ['operations/**/*.graphql'],
      output: 'src/client/generated.ts',
    },
  },
} satisfies GraphQLCodegenConfig
```

`schema`, `documents`, and `output` paths are relative to the configuration file. Mapper imports are relative to the generated `types.ts`. Resolver Modules must provide a named export called `resolvers`. Reserve the server output directory for generated files, and keep the client output outside that directory. The client target is optional if you only need server generation.

```sh
loutre graphql generate --config graphql.config.ts
loutre graphql generate --config graphql.config.ts --target server
loutre graphql generate --config graphql.config.ts --watch
loutre graphql generate --config graphql.config.ts --check
```

The server target generates `types.ts`, `schema-ast.ts`, and `bindings.ts` as one consistent generation. The client target generates Variables types, result types, and `TypedDocumentNode` for named Operations and Fragments. Also install `@graphql-typed-document-node/core` in client projects.

Generated files are marked with `@generated`. All targets are generated, formatted, and validated in temporary output before the files are updated. If an update fails, all targets are restored to the previous valid generation. `--check` compares all generated content without writing files. Watch mode tracks additions, changes, and deletions of SDL, Operations, and configuration while preserving the last valid generation after errors. Do not place handwritten source files in generated directories. Changes to resolver implementations are rebound when the Application restarts or reloads through HMR.

## Domain Mappers and Scalars

`mappers` describe how public GraphQL types map to domain types. For example, a domain `OrderItem` can contain `productId` while the SDL exposes `product: Product!`. Mapping affects only type generation; it does not define runtime object conversion or persistence. Conflicting import names are aliased.

Mappers are server-only. The Application Context is not part of the configuration; specify it using `bindManifest<AppContext>` or `Resolvers<AppContext>`. Resolver Parent, Args, and Result types are inferred from SDL and domain mappings. Args use GraphQL-coerced values, including default values in Input Objects.

Specify input and output types for custom Scalars separately for each target. Unspecified Scalars do not fall back to `any`.

```json
{ "scalars": { "DateTime": { "input": "Date", "output": "Date" } } }
```

On the client, represent `DateTime` as a string to match its wire format. On the server, register `GraphQLScalarType` parsing and serialization in `resolvers`. You can also register Union/Interface `__resolveType`, Object `__isTypeOf`, and Enum value mappings in the same Resolver Module. Generation does not execute domain Modules; TypeScript checks that referenced imports exist and their types are compatible.

If an Enum's internal values differ from its SDL names, configure the mapping using `enumValues` in the server target, for example `enumValues: { Role: { MEMBER: 0, ADMIN: 2 } }` or `enumValues: { Role: '../../domain/role.js#Role' }` to reference a domain Enum type. The mapping is reflected in resolver arguments, Input Objects, and both normal and batch return types. Register the actual runtime value mapping in `resolvers.Role` yourself. The client uses the SDL names sent over the wire and does not configure `enumValues`.

## Resolvers and Manifests

```ts
import { getFieldSelection } from '@loutrejs/graphql'
import type { Resolvers } from './generated/types.js'
import type { AppContext } from './context.js'

export const resolvers = {
  Query: {
    orders: {
      resolve: ({ args, context, info }) =>
        context.orders.search({
          ...args,
          selection: getFieldSelection(info),
          signal: context.signal,
        }),
    },
  },
  OrderItem: {
    product: {
      requires: ['productId'],
      load: async ({ parents: items, context, signal }) => {
        const products = await context.catalog.findByIds(
          [...new Set(items.map((item) => item.productId))],
          { signal },
        )
        return items.map((item) => {
          const product = products.get(item.productId)
          if (!product) throw new Error('Product not found')
          return product
        })
      },
    },
  },
} satisfies Resolvers<AppContext>
```

Plain resolver functions and `{ resolve }` receive `{ parent, args, context, info }`. Subscription `subscribe` and `resolve` use the same shape. For batched fields, specify `{ requires, read, load, authorize, maxBatchSize }` directly. `load` cannot be combined with `resolve` or `subscribe`. Define Subscription root fields using `subscribe` and `resolve`.

`load` receives `{ parents, args, context, signal, selection }`. Both `__resolveType` and `__isTypeOf` receive `{ parent, context, info }`. Destructure only the properties you need; there is no positional argument order to memorize. At binding time, the runtime adapts these objects to GraphQL.js positional arguments. Scalars follow the standard `GraphQLScalarType` contract.

```ts
import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import type { AppContext } from './context.js'
import { resolvers } from './resolvers.js'

const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })

export const endpoint = graphql.endpoint({
  name: 'Commerce',
  path: '/graphql',
  manifest,
  transports: { http: true, websocket: true },
  factory: (
    orders = inject(OrderService),
    catalog = inject(CatalogService),
  ) => ({
    context: ({ signal }) => ({ orders, catalog, signal }),
  }),
})
```

`schema-ast.ts` exports only the SDL-derived AST and does not depend on Context or Resolver types. Import the schema-specific `bindManifest` from `bindings.ts`. Use `bindManifest<AppContext>` in the Application to type inline resolvers with Parent, coerced Args, Result, and Context. For example, a Counter server can be defined as follows:

```ts
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import type { AppContext } from './context.js'

const manifest = bindManifest<AppContext>({
  schemaDocument,
  resolvers: {
    Query: {
      counter: ({ context }) => context.counter.current(),
    },
    Mutation: {
      increment: ({ args, context }) => context.counter.increment(args.amount),
    },
  },
})
```

`args.amount` is inferred as `number` from SDL, and `context` as `AppContext`. Unknown Types or Fields and invalid return values produce type errors. In separate Modules, continue using `satisfies Resolvers<AppContext>` to check implementations. The shared runtime's `bindManifest` is a lower-level binding function; the generated helper provides schema-specific typing.

The manifest is an opaque type. Endpoints cannot accept `schema`, `typeDefs`, or `rootValue` directly. Neither `makeExecutableSchema()` nor manual preparation is necessary. Put bindings in a Module maintained by the Application. Generated Modules do not import resolvers. Resolvers should use type-only imports from `generated/types`; do not import values from the binding Module back into resolvers.

## Input Validation and Error Formatting

SDL guarantees types, nullability, and GraphQL coercion. Validate business constraints such as string length, array size, or date rules yourself, using Zod or domain-level validation. Loutre does not add a business validation API. For example, a resolver can call `z.object({ first: z.number().int().min(1).max(100) }).parse(args)` and pass validated values to an Application Service.

The endpoint factory can optionally return `formatError(error, input)` to configure public errors and logging shared by HTTP and WebSocket. `error` is a `GraphQLError`; exceptions raised by resolvers, `load`, or `subscribe` are accessible through `originalError`. `input` contains transport-specific request and signal information, like Context creation. WebSocket also exposes `operationId` and `connectionParams`; HTTP exposes `state`.

```ts
import { ZodError } from 'zod'

factory: () => ({
  context: ({ signal }) => ({ signal }),
  formatError(error, input) {
    if (error.originalError instanceof ZodError) {
      return {
        message: 'Invalid input.',
        extensions: {
          code: 'BAD_USER_INPUT',
          details: error.originalError.issues,
        },
      }
    }
    if (!error.originalError) return error.toJSON()
    console.error(`[GraphQL ${input.transport}]`, error.originalError)
    return { message: 'Internal server error' }
  },
})
```

`formatError` synchronously returns a `GraphQLFormattedError`. It handles parsing, validation, variable coercion, field execution, Subscription startup, and GraphQL errors for each delivery event. If `path` or `locations` are omitted, the originals are retained; only returned `extensions` are exposed. This hook does not alter `data`, HTTP status codes, WebSocket frame types, or non-null propagation. If omitted, standard GraphQL errors are returned.

Subscription iterator failures are also recorded in runtime observability. The operation terminates after its WebSocket error frame is formatted. Exceptions thrown while creating Context or by `formatError` itself are treated as ordinary runtime failures. HTTP middleware authentication responses and WebSocket protocol violations are handled by their respective transports.

With `application/graphql-response+json`, HTTP returns 400 for GraphQL errors occurring before execution that have no `data`. GraphQL errors during resolver execution return 200. With `application/json`, GraphQL request errors retain their 200 responses.

## Read-through and Batching

For fields without arguments, an own data property on Parent with the same name is reused if its value is not `undefined`. `null`, `[]`, `false`, `0`, and `''` all count as loaded. Prototype properties and getters are not automatically read.

Fields declaring arguments are not automatically reused, even when called without explicit arguments. Use an explicit `read` to verify that prefetched data, such as a page, matches the requested arguments.

```ts
import { data } from '@loutrejs/graphql'

const posts = {
  requires: ['id'],
  read: ({ parent, args }) =>
    parent.postsPage?.first === args.first
      ? data.loaded(parent.postsPage.items)
      : data.missing,
  load: ({ parents: users, args, context, signal }) =>
    context.posts.findForUsers(users, { first: args.first, signal }),
  maxBatchSize: 100,
} satisfies NonNullable<Resolvers<AppContext>['User']>['posts']
```

`loaded(undefined)` is rejected. `requires` is checked only for missing data, and `load` receives the Parent array in its original order. Return the same number of Results in that same order. Missing required internal keys or a mismatched result count produce GraphQL field errors.

A `load` result may contain an `Error` for an individual Parent. Only that element is treated as a GraphQL field error, reflected in the response according to its path and nullability. If `load` itself throws, the entire batch's fields fail.

Batches are grouped by Execution Scope, Field Definition, and coerced Arguments. Aliases, object key order, and whether default values are explicitly supplied do not split batches. Arguments with uncertain equality, such as Dates or class instances, are conservatively separated. Different selections also form separate batches, with `selection` passed to `load`. Synchronously collected requests are flushed at a microtask boundary and split by `maxBatchSize`. Parents that resolve asynchronously may form multiple batches.

Identical requests for the same Parent object can share in-flight work. There is no entity cache based solely on completed values or matching IDs. Repositories must preserve per-Parent Tenant, Authorization, and Revision information, and deduplicate using composite keys where necessary.

## Authorization and Execution Scope

A batch field's `authorize` runs before `read`, reuse, or `load`. Enforce authorization in the Repository even for prefetched data returned by `resolve`.

A scope is created per HTTP or WebSocket Query operation, per Mutation root field, and per Subscription delivery event. Batches are not shared across separate HTTP requests or concurrent operations on the same WebSocket connection. Manual scopes and `AsyncLocalStorage` are unnecessary.

HTTP aborts and WebSocket complete, disconnect, or drain signals are propagated to `context` and `load` via `signal`. Cooperatively stop external I/O using that signal. GraphQL error paths, non-null/list semantics, and introspection are delegated to GraphQL.js.

## Field Selection and Observability

Call `getFieldSelection(info)` from a resolver's `info` to obtain a Field Selection tree. Each node contains `parentType`, `fieldName`, `responseKeys`, `args`, `children`, `requires`, and `prefetchable`. The tree accounts for aliases, fragments, inline fragments, `skip`/`include`, variables, default arguments, and concrete Interface/Union types. It does not introduce an internal dependency on `__typename`. `defer` and `stream` are explicitly rejected.

Field selection information helps with prefetching decisions. The Repository determines SQL, pagination, `totalCount`, transactions, and snapshots. Loutre does not automatically hydrate partial domain values. Return complete domain objects if child resolvers cannot fill in missing descendant fields.

Operation traces aggregate `graphql.data.field.reused_count`, `graphql.data.batch.call_count`, `graphql.data.batch.parent_count`, and `graphql.data.batch.duration_ms`. There is no guarantee that batch counts or SQL query counts will always be one.

## Sharing SDL and CI

Share a contracts workspace or a versioned SDL package, and pin its version in the lockfile. Consumers can write Operations and generate client types without waiting for the server implementation to finish.

```sh
loutre graphql validate --schema 'contracts/**/*.graphql'
loutre graphql diff --before released/schema.graphql --after contracts/schema.graphql --json
```

`diff` exits with code 1 for breaking changes and separately reports dangerous changes, such as adding Enum values. Schema diffs alone cannot guarantee authorization or service behavior. Split SDL files and `extend` are supported; Federation and stitching are not.

Commit generated files and run `--check`, TypeScript checks, and integration tests in CI. See the [Counter server](../examples/graphql-counter/README.md), [Orders server](../examples/graphql-orders/README.md), and [architecture ADR (Japanese)](./adr/loutre_graphql_codegen_architecture.md) for examples.
