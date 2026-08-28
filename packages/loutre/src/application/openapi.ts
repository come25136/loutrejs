import {
  supportsJsonSchema,
  type ModuleInstance,
  type StandardSchemaV1,
} from '../core/index.js'
import { assertValidCompilation, compileApplication } from '../graph/index.js'
import {
  httpRequestBodyContentType,
  httpRequestBodySchema,
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

export interface GenerateOpenApiOptions {
  readonly info: OpenApiInfo
  readonly servers?: readonly OpenApiServer[]
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
  readonly contractName?: string
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
  const graph = assertValidCompilation(
    compileApplication({
      modules: application.modules,
      entrypoint: application.entrypoint,
      triggers: application.triggers,
    }),
  )
  const executable = new Set(
    graph.executions
      .filter(
        (execution) =>
          execution.kind === 'protocol' && execution.protocol === 'http',
      )
      .map((execution) =>
        execution.kind === 'protocol'
          ? `${execution.implementation}\u0000${execution.procedure}`
          : '',
      ),
  )
  const registry = new SchemaRegistry()
  const paths: Record<string, OpenApiPathItem> = {}
  const operationIds = new Set<string>()

  for (const module of collectModules(application.modules)) {
    for (const implementation of module.definition.implementations ?? []) {
      if (implementation.protocol !== 'http') continue
      for (const procedure of implementation.procedures) {
        if (!executable.has(`${implementation.name}\u0000${procedure}`))
          continue
        const protocol =
          implementation.contract.procedures[procedure]?.protocols.http
        if (!protocol || protocol.protocol !== 'http') continue
        const typed = protocol as HttpProtocol
        const target: HttpOperationTarget = {
          definition: typed.definition,
          ...(implementation.contract.name === undefined
            ? {}
            : { contractName: implementation.contract.name }),
          procedure,
        }
        const operation = createOperation(target, registry, operationIds)
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
): OpenApiObject {
  const definition = target.definition
  const operationId = target.contractName
    ? `${target.contractName}.${target.procedure}`
    : undefined
  if (operationId) {
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
  if (request?.headers) {
    parameters.push(
      ...headerParameters(
        request.headers,
        registry,
        target,
        'RequestHeaders_Input',
      ),
    )
  }

  const requestBody = request?.body
    ? createRequestBody(request.body, registry, target)
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
    ...(requestBody === undefined ? {} : { requestBody }),
    responses: createResponses(target, registry),
    ...(definition.deprecated === undefined
      ? {}
      : { deprecated: definition.deprecated }),
  }
}

function createRequestBody(
  body: NonNullable<NonNullable<HttpProtocolDefinition['request']>['body']>,
  registry: SchemaRegistry,
  target: HttpOperationTarget,
): OpenApiObject {
  const contentType = httpRequestBodyContentType(body)
  return {
    content: {
      [contentType]: {
        schema: registry.reference(
          httpRequestBodySchema(body),
          'input',
          componentName(target, 'RequestBody_Input'),
        ),
      },
    },
  }
}

function createResponses(
  target: HttpOperationTarget,
  registry: SchemaRegistry,
): Record<string, OpenApiObject> {
  const grouped = new Map<
    number,
    { readonly variant: string; readonly response: HttpResponseDefinition }[]
  >()
  for (const [variant, response] of Object.entries(
    target.definition.responses,
  )) {
    const current = grouped.get(response.status) ?? []
    current.push({ variant, response })
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
    readonly variant: string
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
  const schemas = entries.map(({ variant, response }) =>
    registry.reference(
      response.body,
      'output',
      componentName(target, `Response_${variant}_Output`),
    ),
  )
  const payloadSchema = schemas.length === 1 ? schemas[0]! : { oneOf: schemas }
  const streaming = entries[0]?.response.stream === 'server'
  const headers = mergeResponseHeaders(entries, registry, target)
  const descriptions = [
    ...new Set(
      entries.map(({ variant, response }) => response.description ?? variant),
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
    readonly variant: string
    readonly response: HttpResponseDefinition
  }[],
  registry: SchemaRegistry,
  target: HttpOperationTarget,
): Record<string, OpenApiObject> | undefined {
  const result = new Map<string, JsonSchema[]>()
  for (const { variant, response } of entries) {
    if (!response.headers) continue
    const materialized = registry.materialize(
      response.headers,
      'output',
      componentName(target, `Response_${variant}_Headers_Output`),
    )
    const properties = objectProperties(
      materialized.schema,
      'LUTRE_OPENAPI_HEADER_SCHEMA_001',
      `${describeTarget(target)} response headers`,
    )
    for (const [name, schema] of Object.entries(properties)) {
      const current = result.get(name) ?? []
      current.push(schema)
      result.set(name, current)
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
  schema: StandardSchemaV1,
  registry: SchemaRegistry,
  target: HttpOperationTarget,
  suffix: string,
): OpenApiObject[] {
  const materialized = registry.materialize(
    schema,
    'input',
    componentName(target, suffix),
  )
  const properties = objectProperties(
    materialized.schema,
    'LUTRE_OPENAPI_HEADER_SCHEMA_001',
    `${describeTarget(target)} request headers`,
  )
  const required = new Set(
    Array.isArray(materialized.schema.required)
      ? materialized.schema.required.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  )
  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: 'header',
    required: required.has(name),
    schema: propertySchema,
  }))
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
    `${target.contractName ?? 'AnonymousContract'}_${target.procedure}_${suffix}`,
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
  return `${target.contractName ?? 'AnonymousContract'}.${target.procedure}`
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
