import { application, module } from '@loutrejs/loutre'

// eslint-disable-next-line no-unused-vars
class CompletelyUnusedSourceLocationSentinel {
  readonly marker = 'SOURCE_LOCATION_TREE_SHAKING_SENTINEL'
}

const AppModule = module(() => ({ name: 'TreeShakingModule' }))

export default application({ modules: [AppModule()] })
