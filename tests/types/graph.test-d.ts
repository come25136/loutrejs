import {
  compileApplication,
  type ApplicationGraphIR,
} from '@loutrejs/loutre/graph'

const current = compileApplication({ modules: [] }).graph
const graph: ApplicationGraphIR = current
// @ts-expect-error Application GraphはLoutre本体と別versionを持たない
graph.version

compileApplication({
  modules: [],
  // @ts-expect-error 旧Graphのentrypoints inputはサポートしない
  entrypoints: [],
})

compileApplication({
  modules: [],
  // @ts-expect-error 旧Graphのschedules inputはサポートしない
  schedules: [],
})

compileApplication({
  modules: [],
  // @ts-expect-error 旧Graphのqueues inputはサポートしない
  queues: [],
})

compileApplication({
  modules: [],
  // @ts-expect-error 旧Graphのconsumers inputはサポートしない
  consumers: [],
})
