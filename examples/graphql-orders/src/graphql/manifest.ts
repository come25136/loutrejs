import { bindManifest } from '../generated/bindings.js'
import { schemaDocument } from '../generated/schema-ast.js'
import type { AppContext } from './context.js'
import { resolvers } from './resolvers.js'

export const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })
