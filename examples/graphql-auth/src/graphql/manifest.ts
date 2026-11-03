import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import { resolvers } from './resolvers.js'
import type { AppContext } from './context.js'

export const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })
