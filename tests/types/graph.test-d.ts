import {
  compileApplication,
  type ApplicationGraphIR,
} from '@loutrejs/loutre/graph'

const current = compileApplication({ modules: [] }).graph
const graph: ApplicationGraphIR = current
const version: 5 = graph.version
void version

compileApplication({
  modules: [],
  // @ts-expect-error Graph v3のentrypoints inputはサポートしない
  entrypoints: [],
})

compileApplication({
  modules: [],
  // @ts-expect-error Graph v3のschedules inputはサポートしない
  schedules: [],
})

compileApplication({
  modules: [],
  // @ts-expect-error Graph v3のqueues inputはサポートしない
  queues: [],
})

compileApplication({
  modules: [],
  // @ts-expect-error Graph v3のconsumers inputはサポートしない
  consumers: [],
})
