# @loutrejs/bullmq

Loutre QueueをBullMQ Workerへ接続するbinding packageです。Queue descriptorとQueue Consumer TriggerをLoutre Application modelに保ったまま、実際のmessage consumptionをBullMQへ接続できます。

## Install

```sh
npm install @loutrejs/loutre @loutrejs/bullmq bullmq
```

`bullmq`はpeer dependencyです。

## Usage

```ts
import {
  consume,
  defineApplication,
  defineModule,
  queue,
  task,
} from '@loutrejs/loutre'
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
}))

export default defineApplication({
  modules: [QueueModule()],
  triggers: [orderConsumer],
})
```

## Options

`bindBullMqQueue()`ではBullMQ Workerへ渡すconnectionに加えて、`concurrency`、`prefix`、`workerOptions`を指定できます。

低レベルAPIとして`createBullMqQueueDriver()`も公開しています。

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Loutre](https://github.com/come25136/loutrejs)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
