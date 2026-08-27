import { defineApplication } from '@loutrejs/application'
import { entrypoint, fixedDelay } from '@loutrejs/core'

const hello = entrypoint<void, void>({
  name: 'hello-worker.tick',
  factory: () => () => {
    console.log('Hello from worker!')
  },
})

const heartbeat = fixedDelay({
  name: 'hello-worker',
  delay: 5_000,
  immediate: true,
  entrypoint: hello,
})

export default defineApplication({
  modules: [],
  triggers: [heartbeat],
})
