import {
  SchemaValidationError,
  validateSchema,
  type StandardSchemaV1,
} from '../../core/index.js'

export function decodeQuery(
  searchParams: URLSearchParams,
): Readonly<Record<string, string | string[]>> {
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of searchParams) {
    const current = query[key]
    query[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value]
  }
  return query
}

export async function validateRequestHeaders(
  schema: StandardSchemaV1,
  bodyDeclared: boolean,
  headers: Headers,
): Promise<unknown> {
  try {
    return await validateSchema(schema, requestHeadersForValidation(headers))
  } catch (error) {
    if (
      bodyDeclared &&
      error instanceof SchemaValidationError &&
      hasContentTypeIssue(error)
    ) {
      throw new HttpUnsupportedMediaTypeError(
        normalizeMediaType(headers.get('content-type')),
      )
    }
    throw error
  }
}

export function validatedContentType(headers: unknown): string {
  if (typeof headers !== 'object' || headers === null) {
    throw new TypeError('HTTP body requires validated request headers')
  }
  const contentType = (headers as Record<string, unknown>)['content-type']
  if (typeof contentType !== 'string' || contentType.length === 0) {
    throw new TypeError(
      'HTTP body requires request.headers content-type to resolve to a string',
    )
  }
  return contentType
}

export async function decodeBody(
  request: Request,
  contentType: string,
): Promise<unknown> {
  const mediaType = normalizeMediaType(contentType)!
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    try {
      return await request.json()
    } catch (error) {
      throw new HttpInputDecodeError(error)
    }
  }
  if (mediaType === 'multipart/form-data') {
    try {
      return await request.formData()
    } catch (error) {
      throw new HttpInputDecodeError(error)
    }
  }
  if (mediaType.startsWith('text/')) {
    try {
      return await request.text()
    } catch (error) {
      throw new HttpInputDecodeError(error)
    }
  }
  return request.body
}

function requestHeadersForValidation(headers: Headers): Record<string, string> {
  const decoded = Object.fromEntries(headers.entries())
  const contentType = normalizeMediaType(headers.get('content-type'))
  if (contentType) decoded['content-type'] = contentType
  return decoded
}

function hasContentTypeIssue(error: SchemaValidationError): boolean {
  return error.issues.some((issue) => {
    const first = issue.path?.[0]
    const key =
      typeof first === 'object' && first !== null && 'key' in first
        ? first.key
        : first
    return key === 'content-type'
  })
}

function normalizeMediaType(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase()
  return normalized ? normalized : undefined
}

export class HttpInputDecodeError extends Error {
  constructor(readonly cause: unknown) {
    super('HTTP request body decode failed', { cause })
    this.name = 'HttpInputDecodeError'
  }
}

export class HttpInputValidationError extends Error {
  constructor(readonly cause: unknown) {
    super('HTTP request body validation failed', { cause })
    this.name = 'HttpInputValidationError'
  }
}

export class HttpUnsupportedMediaTypeError extends Error {
  constructor(readonly mediaType: string | undefined) {
    super('HTTP request content type is unsupported by the Contract')
    this.name = 'HttpUnsupportedMediaTypeError'
  }
}
