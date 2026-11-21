import { trigger, task } from '@loutrejs/loutre/tasks'

export const hello = task<void, void>({
  name: 'hello-worker.tick',
  factory: () => () => {
    console.log('Hello from worker!')
  },
})

export const heartbeat = trigger.fixedDelay({
  name: 'hello-worker',
  delay: 5_000,
  immediate: true,
  task: hello,
})
