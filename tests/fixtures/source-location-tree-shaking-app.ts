import { defineApplication, defineModule } from '@loutrejs/loutre'

// eslint-disable-next-line no-unused-vars
class CompletelyUnusedSourceLocationSentinel {
  readonly marker = 'SOURCE_LOCATION_TREE_SHAKING_SENTINEL'
}

const AppModule = defineModule(() => ({ name: 'TreeShakingModule' }))

export default defineApplication({ modules: [AppModule()] })
