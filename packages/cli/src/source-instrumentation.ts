import { relative, sep } from 'node:path'
import { parseSync } from 'oxc-parser'

type AstNode = {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly [key: string]: any
}

interface ImportedApis {
  readonly defineModule: Set<string>
  readonly httpObjects: Set<string>
  readonly httpContract: Set<string>
  readonly httpImplementation: Set<string>
  readonly httpMiddleware: Set<string>
}

interface SourcePoint {
  readonly file: string
  readonly line: number
  readonly column: number
}

const sourceImport =
  'import{registerSourceLocation as __loutreSource,registerSourceMemberLocation as __loutreMemberSource}from"@loutrejs/loutre";'

export function instrumentSourceLocations(
  code: string,
  file: string,
  projectRoot: string,
): string {
  const sourceFile = projectRelativeFile(file, projectRoot)
  if (!sourceFile) return code

  const parsed = parseSync(file, code)
  if (parsed.errors.length > 0) return code

  const program = parsed.program as unknown as AstNode
  const apis = collectImportedApis(program)
  const insertions = new Map<number, string[]>()
  const wrapped = new Set<string>()

  const add = (position: number, text: string) => {
    const current = insertions.get(position) ?? []
    current.push(text)
    insertions.set(position, current)
  }
  const location = (offset: number): SourcePoint => ({
    file: sourceFile,
    ...positionAt(code, offset),
  })
  const sourceLiteral = (offset: number) => JSON.stringify(location(offset))
  const wrapSource = (node: AstNode, offset = node.start) => {
    const key = `${node.start}:${node.end}`
    if (wrapped.has(key)) return
    wrapped.add(key)
    add(node.start, '__loutreSource(')
    add(node.end, `,${sourceLiteral(offset)})`)
  }

  const inspectRouteObject = (route: AstNode, definitionOffset: number) => {
    wrapSource(route, definitionOffset)
    instrumentMiddlewareArray(route, wrapSource)
  }

  const inspectRouteTree = (tree: AstNode) => {
    for (const property of objectProperties(tree)) {
      const value = unwrapExpression(property.value)
      if (!value || value.type !== 'ObjectExpression') continue
      if (hasObjectProperty(value, 'method')) {
        inspectRouteObject(value, property.start)
        continue
      }
      instrumentMiddlewareArray(value, wrapSource)
      const routes = objectPropertyValue(value, 'routes')
      const routeTree = routes ? unwrapExpression(routes) : undefined
      if (routeTree?.type === 'ObjectExpression') inspectRouteTree(routeTree)
    }
  }

  const inspectHttpImplementation = (
    call: AstNode,
    variableName?: string,
    annotationPosition = call.end,
  ) => {
    const definition = unwrapExpression(call.arguments?.[0])
    if (!definition || definition.type !== 'ObjectExpression') return
    const factory = unwrapExpression(objectPropertyValue(definition, 'factory'))
    const handlers = factory ? returnedObject(factory) : undefined
    if (!factory || !handlers || !variableName) return
    for (const property of objectProperties(handlers)) {
      const name = propertyName(property)
      if (!name) continue
      add(
        annotationPosition,
        `;__loutreMemberSource(${variableName}.factory,${JSON.stringify(name)},${sourceLiteral(property.start)})`,
      )
    }
  }

  const inspectKnownCall = (
    call: AstNode,
    variableName?: string,
    annotationPosition = call.end,
  ) => {
    if (isHttpCall(call, apis.httpContract, apis.httpObjects, 'contract')) {
      wrapSource(call)
      const tree = unwrapExpression(call.arguments?.[0])
      if (tree?.type === 'ObjectExpression') inspectRouteTree(tree)
    }
    if (
      isHttpCall(
        call,
        apis.httpImplementation,
        apis.httpObjects,
        'implementation',
      )
    ) {
      wrapSource(call)
      inspectHttpImplementation(call, variableName, annotationPosition)
    }
    if (isHttpCall(call, apis.httpMiddleware, apis.httpObjects, 'middleware')) {
      wrapSource(call)
    }
    if (isDefineModuleCall(call, apis.defineModule)) {
      wrapSource(call)
      const factory = unwrapExpression(call.arguments?.[0])
      const definition = factory ? returnedObject(factory) : undefined
      const providers = definition
        ? unwrapExpression(objectPropertyValue(definition, 'providers'))
        : undefined
      if (providers?.type === 'ArrayExpression') {
        for (const element of providers.elements ?? []) {
          const provider = unwrapExpression(element)
          if (
            provider &&
            (provider.type === 'CallExpression' ||
              provider.type === 'ObjectExpression')
          ) {
            wrapSource(provider)
          }
        }
      }
    }
  }

  walkAst(program, (node) => {
    if (node.type === 'CallExpression') inspectKnownCall(node)
  })

  for (const statement of program.body ?? []) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? (statement.declaration as AstNode | undefined)
        : statement
    if (!declaration) continue

    if (declaration.type === 'ClassDeclaration') {
      if (declaration.id?.name) {
        add(
          statement.end,
          `;__loutreSource(${declaration.id.name},${sourceLiteral(declaration.start)})`,
        )
      } else if (statement.type === 'ExportDefaultDeclaration') {
        wrapSource(declaration)
      }
      continue
    }

    if (declaration.type !== 'VariableDeclaration') continue
    const annotations: string[] = []
    for (const declarator of declaration.declarations ?? []) {
      if (declarator.id?.type !== 'Identifier' || !declarator.init) continue
      const name = declarator.id.name as string
      const init = unwrapExpression(declarator.init as AstNode)
      if (!init) continue
      annotations.push(`__loutreSource(${name},${sourceLiteral(init.start)})`)
      if (init.type === 'CallExpression')
        inspectKnownCall(init, name, statement.end)
    }
    if (annotations.length > 0) add(statement.end, `;${annotations.join(';')}`)
  }

  if (insertions.size === 0) return code
  add(0, sourceImport)

  let output = code
  for (const position of [...insertions.keys()].toSorted((a, b) => b - a)) {
    output = `${output.slice(0, position)}${insertions.get(position)!.join('')}${output.slice(position)}`
  }
  return output
}

function collectImportedApis(program: AstNode): ImportedApis {
  const apis: ImportedApis = {
    defineModule: new Set(),
    httpObjects: new Set(),
    httpContract: new Set(),
    httpImplementation: new Set(),
    httpMiddleware: new Set(),
  }
  for (const statement of program.body ?? []) {
    if (statement.type !== 'ImportDeclaration') continue
    const source = statement.source?.value
    if (source !== '@loutrejs/loutre' && source !== '@loutrejs/loutre/http') {
      continue
    }
    for (const specifier of statement.specifiers ?? []) {
      if (specifier.type !== 'ImportSpecifier') continue
      const imported = specifier.imported?.name ?? specifier.imported?.value
      const local = specifier.local?.name
      if (typeof imported !== 'string' || typeof local !== 'string') continue
      if (source === '@loutrejs/loutre' && imported === 'defineModule') {
        apis.defineModule.add(local)
      }
      if (source === '@loutrejs/loutre/http') {
        if (imported === 'http') apis.httpObjects.add(local)
        if (imported === 'defineHttpContract') apis.httpContract.add(local)
        if (imported === 'defineHttpImplementation') {
          apis.httpImplementation.add(local)
        }
        if (imported === 'defineHttpMiddleware') apis.httpMiddleware.add(local)
      }
    }
  }
  return apis
}

function isDefineModuleCall(
  call: AstNode,
  names: ReadonlySet<string>,
): boolean {
  const callee = unwrapExpression(call.callee as AstNode | undefined)
  return callee?.type === 'Identifier' && names.has(callee.name)
}

function isHttpCall(
  call: AstNode,
  directNames: ReadonlySet<string>,
  objectNames: ReadonlySet<string>,
  member: string,
): boolean {
  const callee = unwrapExpression(call.callee as AstNode | undefined)
  if (callee?.type === 'Identifier') return directNames.has(callee.name)
  return (
    callee?.type === 'MemberExpression' &&
    callee.computed !== true &&
    callee.object?.type === 'Identifier' &&
    objectNames.has(callee.object.name) &&
    callee.property?.name === member
  )
}

function returnedObject(factory: AstNode): AstNode | undefined {
  const body = unwrapExpression(factory.body as AstNode | undefined)
  if (body?.type === 'ObjectExpression') return body
  if (body?.type !== 'BlockStatement') return undefined
  for (const statement of body.body ?? []) {
    if (statement.type !== 'ReturnStatement') continue
    const returned = unwrapExpression(statement.argument as AstNode | undefined)
    if (returned?.type === 'ObjectExpression') return returned
  }
  return undefined
}

function instrumentMiddlewareArray(
  definition: AstNode,
  wrapSource: (node: AstNode, offset?: number) => void,
): void {
  const middlewares = unwrapExpression(
    objectPropertyValue(definition, 'middlewares'),
  )
  if (middlewares?.type !== 'ArrayExpression') return
  for (const element of middlewares.elements ?? []) {
    const middleware = unwrapExpression(element)
    if (middleware?.type === 'CallExpression') wrapSource(middleware)
  }
}

function objectProperties(value: AstNode): readonly AstNode[] {
  if (value.type !== 'ObjectExpression') return []
  return (value.properties ?? []).filter(
    (property: AstNode) => property.type === 'Property',
  )
}

function objectPropertyValue(
  value: AstNode,
  name: string,
): AstNode | undefined {
  return objectProperties(value).find(
    (property) => propertyName(property) === name,
  )?.value
}

function hasObjectProperty(value: AstNode, name: string): boolean {
  return objectPropertyValue(value, name) !== undefined
}

function propertyName(property: AstNode): string | undefined {
  if (property.computed === true) return undefined
  if (property.key?.type === 'Identifier') return property.key.name
  if (
    property.key?.type === 'Literal' &&
    typeof property.key.value === 'string'
  ) {
    return property.key.value
  }
  return undefined
}

function unwrapExpression(value: AstNode | undefined): AstNode | undefined {
  let current = value
  while (
    current &&
    (current.type === 'ParenthesizedExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSInstantiationExpression')
  ) {
    current = current.expression as AstNode | undefined
  }
  return current
}

function walkAst(root: AstNode, visit: (node: AstNode) => void): void {
  const seen = new WeakSet<object>()
  const walk = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    const record = value as Record<string, unknown>
    if (
      typeof record.type === 'string' &&
      typeof record.start === 'number' &&
      typeof record.end === 'number'
    ) {
      visit(record as AstNode)
    }
    for (const child of Object.values(record)) walk(child)
  }
  walk(root)
}

function positionAt(
  code: string,
  offset: number,
): { line: number; column: number } {
  let line = 1
  let lineStart = 0
  for (let index = 0; index < offset; index++) {
    if (code.charCodeAt(index) !== 10) continue
    line += 1
    lineStart = index + 1
  }
  return { line, column: offset - lineStart + 1 }
}

function projectRelativeFile(
  file: string,
  projectRoot: string,
): string | undefined {
  const path = relative(projectRoot, file)
  if (path === '' || path === '..' || path.startsWith(`..${sep}`))
    return undefined
  if (path.split(sep).includes('node_modules')) return undefined
  return path.split(sep).join('/')
}
