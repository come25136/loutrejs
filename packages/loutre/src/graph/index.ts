export * from './ir.js'
export {
  StaticValidationError,
  assertValidCompilation,
  validateGraph,
  type ApplicationCompilationInput,
} from './graph.js'
export { buildApplicationGraph, compileApplication } from './compiler.js'
