import { fixedDelay, task } from '@loutrejs/loutre'

const hello = task<void, void>({
  name: 'hello-worker.tick',
  factory: () => () => {
    console.log('Hello from worker!')
  },
})

export const heartbeat = fixedDelay({
  name: 'hello-worker',
  delay: 5_000,
  immediate: true,
  task: hello,
})
