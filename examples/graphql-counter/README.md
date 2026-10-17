# GraphQL Counter Example

This Node.js server generates types from shared SDL and combines a runtime manifest, domain mapping, DI, Data Resolution, and Subscriptions. It exposes Query, Mutation, and Subscription operations at the same `/graphql` endpoint.

## Run the Server

Use Node.js 22 or later and run these commands from the repository root.

```sh
npm ci
npm run build
npm run generate --workspace @loutrejs/example-graphql-counter
npm run dev --workspace @loutrejs/example-graphql-counter
```

HTTP is available at http://127.0.0.1:3000/graphql and WebSocket at ws://127.0.0.1:3000/graphql. Set `PORT=3001` to change the port.

## Server Structure

- [contracts/counter.graphql](./contracts/counter.graphql): Shared API contract.
- [graphql.config.ts](./graphql.config.ts): Server type generation and domain mapping.
- [src/domain/counter.ts](./src/domain/counter.ts): Domain state containing `value` and `stepId`, plus change notifications.
- [src/domain/step.ts](./src/domain/step.ts): Batch retrieval of related Steps.
- [src/graphql/resolvers.ts](./src/graphql/resolvers.ts): Uses the generated `Resolvers<AppContext>` type and inline `load` configuration to resolve `Counter.step` by `stepId` in batches.
- [src/graphql/context.ts](./src/graphql/context.ts): Domain services and operation signals. The framework creates a Batch Scope for each Operation or Delivery Event.
- [src/endpoint.ts](./src/endpoint.ts): Connects the bound manifest and DI to Context and configures shared HTTP/WebSocket error formatting.
- [src/graphql/manifest.ts](./src/graphql/manifest.ts): Binds the generated schema to handwritten resolvers.

The domain Counter does not contain a GraphQL `step` object. Mappers type the resolver's Parent as the domain type, while the related domain object is retrieved by `stepId`. The GraphQL contract does not prescribe how data is loaded or stored. This example keeps state in memory and resets it to 0 on restart.

## Query / Mutation

Run a Query from another terminal.

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"query { counter { value step { amount } } activeSubscriptions }"}'
```

```json
{
  "data": {
    "counter": { "value": 0, "step": { "amount": 1 } },
    "activeSubscriptions": 0
  }
}
```

Change the state using variables.

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"mutation Add($amount: Int!) { increment(amount: $amount) { value } }","variables":{"amount":2}}'
```

```json
{ "data": { "increment": { "value": 2 } } }
```

Use `mutation { reset { value } }` to reset the value to 0.

Running `increment(amount: 2147483647)` twice fails domain range validation. `formatError` exposes known `CounterRangeError` exceptions with `extensions.code: BAD_USER_INPUT`, while unexpected exceptions are logged and return `Internal server error`. The application decides which inputs to validate and which error details to expose. See also [Error Formatting](../../docs/graphql-codegen.md#input-validation-and-error-formatting).

Selecting `first: counter { step { amount } } second: counter { step { amount } }` in one Query combines the retrievals into one batch for that operation. Check `stepBatchCount` before and after using a separate Query.

## Subscription

Run a standard `graphql-ws` client from another terminal at the repository root.

```sh
node --input-type=module <<'JS'
import { createClient } from 'graphql-ws'
const client = createClient({ url: 'ws://127.0.0.1:3000/graphql', retryAttempts: 0 })
const stop = client.subscribe(
  { query: 'subscription { counterChanged { value step { amount } } }' },
  {
    next: result => console.log(JSON.stringify(result)),
    error: error => console.error(error),
    complete: () => console.log('Subscription completed.'),
  },
)
process.once('SIGINT', async () => { stop(); await client.dispose() })
JS
```

The current value is delivered first, followed by changes from Mutations in another terminal. Multiple clients each receive the updates. Press Ctrl+C to stop. Check the number of subscriptions with `activeSubscriptions`; the count drops on completion or disconnection. Completion is sent to the server asynchronously.

## Generation and Validation

```sh
npm run generate --workspace @loutrejs/example-graphql-counter
npm run generate:check --workspace @loutrejs/example-graphql-counter
npm run generate --workspace @loutrejs/example-graphql-counter -- --watch
npm run check --workspace @loutrejs/example-graphql-counter
npm run typecheck --workspace @loutrejs/example-graphql-counter
```

Commit generated files. After changing SDL, regenerate the files, update resolver and domain types, and run type checks. See [GraphQL Type Generation](../../docs/graphql-codegen.md) for generation configuration and shared contracts.
