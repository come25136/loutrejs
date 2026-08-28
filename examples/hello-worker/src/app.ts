import { defineApplication } from '@loutrejs/loutre'
import { fixedDelay, task } from '@loutrejs/loutre'

const hello = task<void, void>({
  name: 'hello-worker.tick',
  factory: () => () => {
    console.log('Hello from worker!')
  },
})

const heartbeat = fixedDelay({
  name: 'hello-worker',
  delay: 5_000,
  immediate: true,
  task: hello,
})

export default defineApplication({
  modules: [],
  triggers: [heartbeat],
})
