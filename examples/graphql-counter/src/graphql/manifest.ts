import { bindManifest, schemaDocument } from '../generated/schema-ast.js'
import { resolvers } from './resolvers.js'

export const manifest = bindManifest({ schemaDocument, resolvers })
