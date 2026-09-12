# @loutrejs/bullmq

`@loutrejs/loutre/tasks`のQueue Consumer executionをBullMQ Workerへ接続するDriver packageです。

## Install

```sh
npm install @loutrejs/loutre @loutrejs/bullmq bullmq
```

`bullmq`はpeer dependencyです。

## Usage

```ts
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { consume, queue, task } from '@loutrejs/loutre/tasks'
import { bindBullMqQueue } from '@loutrejs/bullmq'
import { z } from 'zod'

const orders = queue({
  name: 'orders',
  payload: z.object({ id: z.string() }),
})

const processOrder = task<{ id: string }, void>({
  name: 'orders.process',
  factory:
    () =>
    async ({ id }) => {
      console.log(id)
    },
})

const orderConsumer = consume({
  name: 'orders.consumer',
  queue: orders,
  task: processOrder,
})

const QueueModule = defineModule(() => ({
  providers: [
    bindBullMqQueue(orders, {
      connection: { host: '127.0.0.1', port: 6379 },
    }),
  ],
  executions: [orderConsumer],
}))

export default defineApplication({ modules: [QueueModule()] })
```

Trigger execution is started through the Tasks Extension Host API:

```ts
const app = await bootstrapApplication({ application })
await app.tasks.start()
```

## Options

`bindBullMqQueue()`ではBullMQ Workerへ渡すconnectionに加えて、`concurrency`、`prefix`、`workerOptions`を指定できます。

低レベルAPIとして`createBullMqQueueDriver()`も公開しています。

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Loutre](https://github.com/come25136/loutrejs)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
