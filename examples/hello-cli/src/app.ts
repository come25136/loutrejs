import { defineApplication } from '@loutrejs/application'
import { entrypoint } from '@loutrejs/core'

const hello = entrypoint<void, string>({
  name: 'hello',
  factory: () => () => 'Hello, World!',
})

export default defineApplication({
  modules: [],
  entrypoint: hello,
})
