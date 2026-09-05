import {
  supportsJsonSchema,
  type ModuleInstance,
  type StandardSchemaV1,
} from '../core/index.js'
import { resolveContractProcedureIdentity } from '../core/contract-internal.js'
import { assertValidCompilation, compileApplication } from '../graph/index.js'
import {
  type HttpProtocol,
  type HttpProtocolDefinition,
  type HttpResponseDefinition,
} from '../http/index.js'
import type { ApplicationDefinition } from './index.js'

export interface OpenApiInfo {
  readonly title: string
  readonly version: string
  readonly description?: string
}

export interface OpenApiServer {
  readonly url: string
  readonly description?: string
}

export interface OpenApiOperationIdContext {
  readonly procedure: string
  readonly method: string
  readonly path: string
}

export interface GenerateOpenApiOptions {
  readonly info: OpenApiInfo
  readonly servers?: readonly OpenApiServer[]
  readonly operationId?: (
    context: OpenApiOperationIdContext,
  ) => string | undefined
}

export interface OpenApiDocument {
  readonly openapi: '3.2.0'
  readonly jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema'
  readonly info: OpenApiInfo
  readonly servers?: readonly OpenApiServer[]
  readonly paths: Readonly<Record<string, OpenApiPathItem>>
  readonly components?: {
    readonly schemas?: Readonly<Record<string, JsonSchema>>
  }
}

type JsonSchema = Record<string, unknown>
type OpenApiObject = Record<string, unknown>
type OpenApiPathItem = Record<string, unknown>

type Direction = 'input' | 'output'

interface SchemaMaterialization {
  readonly name: string
  readonly schema: JsonSchema
  readonly reference: { readonly $ref: string }
}

interface HttpOperationTarget {
  readonly definition: HttpProtocolDefinition
  readonly procedure: string
}

const FIXED_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
  'query',
])

export function generateOpenApi(
  application: ApplicationDefinition,
  options: GenerateOpenApiOptions,
): OpenApiDocument {
  assertValidCompilation(
    compileApplication({
      modules: application.modules,
      ...(application.arguments === undefined
        ? {}
        : { arguments: application.arguments }),
      tasks: application.tasks,
      triggers: application.triggers,
    }),
  )
  const registry = new SchemaRegistry()
  const paths: Record<string, OpenApiPathItem> = {}
  const operationIds = new Set<string>()
  for (const module of collectModules(application.modules)) {
    for (const implementation of module.definition.implementations ?? []) {
      if (implementation.protocol !== 'http') continue
      for (const procedure of implementation.procedures) {
        const protocol =
          implementation.contract.procedures[procedure]?.protocols.http
        if (!protocol || protocol.protocol !== 'http') continue
        const typed = protocol as HttpProtocol
        const target: HttpOperationTarget = {
          definition: typed.definition,
          procedure: resolveContractProcedureIdentity(
            implementation.contract,
            procedure,
          ).procedure,
        }
        const operation = createOperation(
          target,
          registry,
          operationIds,
          options.operationId,
        )
        attachOperation(paths, typed.definition, operation)
      }
    }
  }

  const schemas = registry.components()
  return {
    openapi: '3.2.0',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: options.info,
    ...(options.servers === undefined ? {} : { servers: options.servers }),
    paths,
    ...(Object.keys(schemas).length === 0 ? {} : { components: { schemas } }),
  }
}

function createOperation(
  target: HttpOperationTarget,
  registry: SchemaRegistry,
  operationIds: Set<string>,
  resolveOperationId: GenerateOpenApiOptions['operationId'],
): OpenApiObject {
  const definition = target.definition
  const operationId = resolveOperationId?.({
    procedure: target.procedure,
    method: definition.method,
    path: definition.path,
  })
  if (operationId !== undefined) {
    if (operationId.length === 0) {
      throw openApiError(
        'LUTRE_OPENAPI_OPERATION_ID_002',
        `operationId must not be empty for ${describeTarget(target)}`,
      )
    }
    if (operationIds.has(operationId)) {
      throw openApiError(
        'LUTRE_OPENAPI_OPERATION_ID_001',
        `Duplicate operationId: ${operationId}`,
      )
    }
    operationIds.add(operationId)
  }

  const parameters: OpenApiObject[] = []
  const request = definition.request
  if (request?.params) {
    for (const [name, schema] of Object.entries(request.params)) {
      parameters.push({
        name,
        in: 'path',
        required: true,
        schema: registry.reference(
          schema,
          'input',
          componentName(target, `RequestParam_${name}_Input`),
        ),
      })
    }
  }
  if (request?.query) {
    parameters.push({
      in: 'querystring',
      content: {
        'application/x-www-form-urlencoded': {
          schema: registry.reference(
            request.query,
            'input',
            componentName(target, 'RequestQuery_Input'),
          ),
        },
      },
    })
  }
  const requestHeaders = request?.headers
    ? requestHeadersProjection(request.headers, registry, target)
    : undefined
  if (requestHeaders) {
    parameters.push(...headerParameters(requestHeaders))
  }

  const requestBody = request?.body
    ? createRequestBody(request.body, requestHeaders, registry, target)
    : undefined

  return {
    ...(definition.tags === undefined ? {} : { tags: definition.tags }),
    ...(definition.summary === undefined
      ? {}
      : { summary: definition.summary }),
    ...(definition.description === undefined
      ? {}
      : { description: definition.description }),
    ...(operationId === undefined ? {} : { operationId }),
    ...(parameters.length === 0 ? {} : { parameters }),
    ...(requestHeaders === undefined
      ? {}
      : { 'x-loutre-request-headers': requestHeaders.schema }),
    ...(requestBody === undefined ? {} : { requestBody }),
    responses: createResponses(target, registry),
    ...(definition.deprecated === undefined
      ? {}
      : { deprecated: definition.deprecated }),
  }
}

function createRequestBody(
  body: NonNullable<NonNullable<HttpProtocolDefinition['request']>['body']>,
  headers: RequestHeadersProjection | undefined,
  registry: SchemaRegistry,
  target: HttpOperationTarget,
): OpenApiObject {
  const mediaTypes = requestBodyMediaTypes(headers, target)
  const schema = registry.reference(
    body,
    'input',
    componentName(target, 'RequestBody_Input'),
  )
  return {
    content: Object.fromEntries(
      mediaTypes.map((mediaType) => [mediaType, { schema }]),
    ),
  }
}

interface RequestHeaderVariant {
  readonly schema: JsonSchema
  readonly properties: Readonly<Record<string, JsonSchema>>
  readonly required: ReadonlySet<string>
}

interface RequestHeadersProjection {
  readonly schema: JsonSchema
  readonly variants: readonly RequestHeaderVariant[]
}

function requestHeadersProjection(
  schema: StandardSchemaV1,
  registry: SchemaRegistry,
  target: HttpOperationTarget,
): RequestHeadersProjection {
  const materialized = registry.materialize(
    schema,
    'input',
    componentName(target, 'RequestHeaders_Input'),
  )
  return {
    schema: materialized.schema,
    variants: requestHeaderVariants(materialized.schema, target),
  }
}

function requestHeaderVariants(
  schema: JsonSchema,
  target: HttpOperationTarget,
): readonly RequestHeaderVariant[] {
  const alternatives = objectSchemaAlternatives(schema)
  if (!alternatives) {
    throw openApiError(
      'LUTRE_OPENAPI_HEADER_SCHEMA_001',
      `${describeTarget(target)} request headers must convert to an object JSON Schema or a union of object JSON Schemas with properties.`,
    )
  }
  return alternatives.map((alternative) => ({
    schema: alternative,
    properties: objectProperties(
      alternative,
      'LUTRE_OPENAPI_HEADER_SCHEMA_001',
      `${describeTarget(target)} request headers variant`,
    ),
    required: new Set(
      Array.isArray(alternative.required)
        ? alternative.required.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    ),
  }))
}

function objectSchemaAlternatives(
  schema: JsonSchema,
): readonly JsonSchema[] | undefined {
  if (schema.type === 'object') return [schema]
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (!Array.isArray(alternatives)) continue
    const result: JsonSchema[] = []
    for (const alternative of alternatives) {
      if (
        typeof alternative !== 'object' ||
        alternative === null ||
        Array.isArray(alternative)
      ) {
        return undefined
      }
      const nested = objectSchemaAlternatives(alternative as JsonSchema)
      if (!nested) return undefined
      result.push(...nested)
    }
    return result
  }
  return undefined
}

function requestBodyMediaTypes(
  headers: RequestHeadersProjection | undefined,
  target: HttpOperationTarget,
): readonly string[] {
  if (!headers) {
    throw openApiError(
      'LUTRE_OPENAPI_CONTENT_TYPE_001',
      `${describeTarget(target)} request body requires a request headers schema with content-type.`,
    )
  }
  const mediaTypes: string[] = []
  for (const variant of headers.variants) {
    const contentType = variant.properties['content-type']
    if (!contentType || !variant.required.has('content-type')) {
      throw openApiError(
        'LUTRE_OPENAPI_CONTENT_TYPE_001',
        `${describeTarget(target)} request header variants must require content-type.`,
      )
    }
    const values = finiteStringValues(contentType)
    if (!values || values.length === 0) {
      throw openApiError(
        'LUTRE_OPENAPI_CONTENT_TYPE_002',
        `${describeTarget(target)} request content-type must resolve to a finite set of string literals.`,
      )
    }
    mediaTypes.push(...values)
  }
  return [...new Set(mediaTypes)]
}

function finiteStringValues(schema: JsonSchema): readonly string[] | undefined {
  if (typeof schema.const === 'string') return [schema.const]
  if (Array.isArray(schema.enum)) {
    return schema.enum.every((value) => typeof value === 'string')
      ? (schema.enum as string[])
      : undefined
  }
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (!Array.isArray(alternatives)) continue
    const values: string[] = []
    for (const alternative of alternatives) {
      if (
        typeof alternative !== 'object' ||
        alternative === null ||
        Array.isArray(alternative)
      ) {
        return undefined
      }
      const nested = finiteStringValues(alternative as JsonSchema)
      if (!nested) return undefined
      values.push(...nested)
    }
    return values
  }
  return undefined
}

function createResponses(
  target: HttpOperationTarget,
  registry: SchemaRegistry,
): Record<string, OpenApiObject> {
  const grouped = new Map<
    number,
    { readonly name: string; readonly response: HttpResponseDefinition }[]
  >()
  for (const [name, response] of Object.entries(target.definition.responses)) {
    const current = grouped.get(response.status) ?? []
    current.push({ name, response })
    grouped.set(response.status, current)
  }

  return Object.fromEntries(
    [...grouped.entries()]
      .toSorted(([left], [right]) => left - right)
      .map(([status, entries]) => [
        String(status),
        createResponse(target, entries, registry),
      ]),
  )
}

function createResponse(
  target: HttpOperationTarget,
  entries: readonly {
    readonly name: string
    readonly response: HttpResponseDefinition
  }[],
  registry: SchemaRegistry,
): OpenApiObject {
  const streamKinds = new Set(
    entries.map(({ response }) => response.stream === 'server'),
  )
  if (streamKinds.size > 1) {
    throw openApiError(
      'LUTRE_OPENAPI_RESPONSE_STREAM_001',
      `${describeTarget(target)} declares streaming and non-streaming responses with the same status.`,
    )
  }
  const schemas = entries.map(({ name, response }) =>
    registry.reference(
      response.body,
      'output',
      componentName(target, `Response_${name}_Output`),
    ),
  )
  const payloadSchema = schemas.length === 1 ? schemas[0]! : { oneOf: schemas }
  const streaming = entries[0]?.response.stream === 'server'
  const headers = mergeResponseHeaders(entries, registry, target)
  const descriptions = [
    ...new Set(
      entries.map(({ name, response }) => response.description ?? name),
    ),
  ]

  return {
    description: descriptions.join(' / '),
    ...(headers === undefined ? {} : { headers }),
    content: streaming
      ? {
          'text/event-stream': {
            itemSchema: {
              type: 'object',
              required: ['data'],
              properties: {
                data: {
                  type: 'string',
                  contentMediaType: 'application/json',
                  contentSchema: payloadSchema,
                },
              },
            },
          },
        }
      : {
          'application/json': {
            schema: payloadSchema,
          },
        },
  }
}

function mergeResponseHeaders(
  entries: readonly {
    readonly name: string
    readonly response: HttpResponseDefinition
  }[],
  registry: SchemaRegistry,
  target: HttpOperationTarget,
): Record<string, OpenApiObject> | undefined {
  const result = new Map<string, JsonSchema[]>()
  for (const { name, response } of entries) {
    if (!response.headers) continue
    const materialized = registry.materialize(
      response.headers,
      'output',
      componentName(target, `Response_${name}_Headers_Output`),
    )
    const properties = objectProperties(
      materialized.schema,
      'LUTRE_OPENAPI_HEADER_SCHEMA_001',
      `${describeTarget(target)} response headers`,
    )
    for (const [headerName, schema] of Object.entries(properties)) {
      const current = result.get(headerName) ?? []
      current.push(schema)
      result.set(headerName, current)
    }
  }
  if (result.size === 0) return undefined
  return Object.fromEntries(
    [...result.entries()].map(([name, schemas]) => [
      name,
      {
        schema:
          schemas.length === 1
            ? schemas[0]!
            : { oneOf: dedupeJsonSchemas(schemas) },
      },
    ]),
  )
}

function headerParameters(
  projection: RequestHeadersProjection,
): OpenApiObject[] {
  const names = new Set<string>()
  for (const variant of projection.variants) {
    for (const name of Object.keys(variant.properties)) {
      if (name.toLowerCase() !== 'content-type') names.add(name)
    }
  }

  return [...names].map((name) => {
    const schemas = dedupeJsonSchemas(
      projection.variants.flatMap((variant) =>
        variant.properties[name] ? [variant.properties[name]] : [],
      ),
    )
    return {
      name,
      in: 'header',
      required: projection.variants.every(
        (variant) =>
          variant.required.has(name) && variant.properties[name] !== undefined,
      ),
      schema: schemas.length === 1 ? schemas[0]! : { anyOf: schemas },
    }
  })
}

function objectProperties(
  schema: JsonSchema,
  code: string,
  description: string,
): Record<string, JsonSchema> {
  const properties = schema.properties
  if (
    schema.type !== 'object' ||
    typeof properties !== 'object' ||
    properties === null ||
    Array.isArray(properties)
  ) {
    throw openApiError(
      code,
      `${description} must convert to an object JSON Schema with properties.`,
    )
  }
  return properties as Record<string, JsonSchema>
}

function attachOperation(
  paths: Record<string, OpenApiPathItem>,
  definition: HttpProtocolDefinition,
  operation: OpenApiObject,
): void {
  const path = definition.path
  const pathItem = (paths[path] ??= {})
  const method = definition.method.toLowerCase()
  if (FIXED_METHODS.has(method)) {
    if (pathItem[method] !== undefined) {
      throw openApiError(
        'LUTRE_OPENAPI_OPERATION_001',
        `Duplicate OpenAPI operation: ${definition.method.toUpperCase()} ${path}`,
      )
    }
    pathItem[method] = operation
    return
  }
  const additional = (pathItem.additionalOperations ??= {}) as Record<
    string,
    OpenApiObject
  >
  const methodName = definition.method.toUpperCase()
  if (additional[methodName] !== undefined) {
    throw openApiError(
      'LUTRE_OPENAPI_OPERATION_001',
      `Duplicate OpenAPI operation: ${methodName} ${path}`,
    )
  }
  additional[methodName] = operation
}

function collectModules(
  roots: readonly ModuleInstance[],
): readonly ModuleInstance[] {
  const result: ModuleInstance[] = []
  const seen = new Set<ModuleInstance>()
  const visit = (module: ModuleInstance) => {
    if (seen.has(module)) return
    seen.add(module)
    for (const imported of module.definition.imports ?? []) visit(imported)
    result.push(module)
  }
  for (const root of roots) visit(root)
  return result
}

class SchemaRegistry {
  private readonly bySchema = new Map<
    StandardSchemaV1,
    Partial<Record<Direction, SchemaMaterialization>>
  >()
  private readonly schemas: Record<string, JsonSchema> = {}

  reference(
    schema: StandardSchemaV1,
    direction: Direction,
    preferredName: string,
  ): { readonly $ref: string } {
    return this.materialize(schema, direction, preferredName).reference
  }

  materialize(
    schema: StandardSchemaV1,
    direction: Direction,
    preferredName: string,
  ): SchemaMaterialization {
    const existing = this.bySchema.get(schema)?.[direction]
    if (existing) return existing
    if (!supportsJsonSchema(schema)) {
      throw openApiError(
        'LUTRE_OPENAPI_SCHEMA_001',
        `${preferredName} does not implement StandardJSONSchemaV1.`,
      )
    }
    let converted: JsonSchema
    try {
      converted = schema['~standard'].jsonSchema[direction]({
        target: 'draft-2020-12',
      })
    } catch (error) {
      throw openApiError(
        'LUTRE_OPENAPI_SCHEMA_002',
        `${preferredName} could not be converted to draft-2020-12 JSON Schema: ${errorMessage(error)}`,
      )
    }
    const name = uniqueComponentName(preferredName, this.schemas)
    const rebased = rebaseLocalDefinitions(converted, name)
    this.schemas[name] = rebased
    const materialized: SchemaMaterialization = {
      name,
      schema: rebased,
      reference: { $ref: `#/components/schemas/${escapeJsonPointer(name)}` },
    }
    const directions = this.bySchema.get(schema) ?? {}
    directions[direction] = materialized
    this.bySchema.set(schema, directions)
    return materialized
  }

  components(): Readonly<Record<string, JsonSchema>> {
    return this.schemas
  }
}

function rebaseLocalDefinitions(
  schema: JsonSchema,
  schemaComponentName: string,
): JsonSchema {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit)
    if (typeof value !== 'object' || value === null) return value
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (
        key === '$ref' &&
        typeof child === 'string' &&
        child.startsWith('#/$defs/')
      ) {
        result[key] =
          `#/components/schemas/${escapeJsonPointer(schemaComponentName)}/$defs/${child.slice('#/$defs/'.length)}`
      } else {
        result[key] = visit(child)
      }
    }
    return result
  }
  return visit(schema) as JsonSchema
}

function componentName(target: HttpOperationTarget, suffix: string): string {
  return sanitizeComponentName(
    `${target.definition.method} ${target.definition.path} ${target.procedure} ${suffix}`,
  )
}

function sanitizeComponentName(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_.-]+/g, '_')
  return sanitized.length === 0 ? 'Schema' : sanitized
}

function uniqueComponentName(
  preferred: string,
  schemas: Readonly<Record<string, JsonSchema>>,
): string {
  if (!(preferred in schemas)) return preferred
  let index = 2
  while (`${preferred}_${index}` in schemas) index += 1
  return `${preferred}_${index}`
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function describeTarget(target: HttpOperationTarget): string {
  return `${target.definition.method.toUpperCase()} ${target.definition.path} (${target.procedure})`
}

function dedupeJsonSchemas(schemas: readonly JsonSchema[]): JsonSchema[] {
  const seen = new Set<string>()
  const result: JsonSchema[] = []
  for (const schema of schemas) {
    const serialized = JSON.stringify(schema)
    if (seen.has(serialized)) continue
    seen.add(serialized)
    result.push(schema)
  }
  return result
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function openApiError(code: string, message: string): Error {
  return new Error(`${code}: ${message}`)
}
