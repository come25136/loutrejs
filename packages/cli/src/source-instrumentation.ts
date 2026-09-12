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
  readonly providerBuilders: Set<string>
  readonly providerFactories: Set<string>
  readonly httpObjects: Set<string>
  readonly httpContract: Set<string>
  readonly httpImplementation: Set<string>
  readonly httpMiddleware: Set<string>
  readonly httpMiddlewareFactories: Set<string>
}

interface SourcePoint {
  readonly file: string
  readonly line: number
  readonly column: number
}

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
  const initializers = collectTopLevelInitializers(program)
  const usedIdentifiers = collectIdentifierNames(program)
  const sourceHelper = uniqueHelperName('__loutreSource', usedIdentifiers)
  usedIdentifiers.add(sourceHelper)
  const memberSourceHelper = uniqueHelperName(
    '__loutreMemberSource',
    usedIdentifiers,
  )
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
    add(node.start, `${sourceHelper}(`)
    add(node.end, `,${sourceLiteral(offset)})`)
  }

  const inspectRouteObject = (route: AstNode, definitionOffset: number) => {
    wrapSource(route, definitionOffset)
  }

  const inspectRouteTree = (tree: AstNode) => {
    const routeTree = resolveStaticExpression(tree, initializers)
    if (routeTree?.type !== 'ObjectExpression') return
    for (const property of objectProperties(routeTree)) {
      const rawValue = unwrapExpression(property.value)
      const value = resolveStaticExpression(rawValue, initializers)
      if (!value || value.type !== 'ObjectExpression') continue
      if (hasObjectProperty(value, 'method')) {
        inspectRouteObject(
          value,
          rawValue === value ? property.start : value.start,
        )
        continue
      }
      const routes = objectPropertyValue(value, 'routes')
      if (routes) inspectRouteTree(routes)
    }
  }

  const inspectHttpImplementation = (
    call: AstNode,
    variableName?: string,
    annotationPosition = call.end,
  ) => {
    const definition = resolveStaticExpression(
      call.arguments?.[0],
      initializers,
    )
    if (!definition || definition.type !== 'ObjectExpression') return
    const factory = resolveStaticExpression(
      objectPropertyValue(definition, 'factory'),
      initializers,
    )
    const handlers = factory ? returnedHandlerObject(factory) : undefined
    if (!factory || !handlers || !variableName) return
    for (const property of objectProperties(handlers)) {
      const name = propertyName(property)
      if (!name) continue
      add(
        annotationPosition,
        `;${memberSourceHelper}(${variableName}.factory,${JSON.stringify(name)},${sourceLiteral(property.start)})`,
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
      const tree = resolveStaticExpression(call.arguments?.[0], initializers)
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
    if (isDirectCall(call, apis.httpMiddlewareFactories)) {
      wrapSource(call)
    }
    if (
      isDirectCall(call, apis.providerFactories) ||
      isProviderBuilderCall(call, apis.providerBuilders)
    ) {
      wrapSource(call)
    }
    if (isDefineModuleCall(call, apis.defineModule)) {
      wrapSource(call)
      const factory = resolveStaticExpression(call.arguments?.[0], initializers)
      const definition = factory
        ? returnedObject(factory, initializers)
        : undefined
      const providers = definition
        ? resolveStaticExpression(
            objectPropertyValue(definition, 'providers'),
            initializers,
          )
        : undefined
      if (providers?.type === 'ArrayExpression') {
        for (const element of providers.elements ?? []) {
          const provider = resolveStaticExpression(element, initializers)
          if (provider?.type === 'ObjectExpression') {
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
      if (declaration.declare === true) continue
      if (declaration.id?.name) {
        add(
          statement.end,
          `;${sourceHelper}(${declaration.id.name},${sourceLiteral(declaration.start)})`,
        )
      } else if (statement.type === 'ExportDefaultDeclaration') {
        wrapSource(declaration)
      }
      continue
    }

    if (declaration.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations ?? []) {
      if (declarator.id?.type !== 'Identifier' || !declarator.init) continue
      const name = declarator.id.name as string
      const init = unwrapExpression(declarator.init as AstNode)
      if (init?.type === 'CallExpression') {
        inspectKnownCall(init, name, statement.end)
      }
    }
  }

  if (insertions.size === 0) return code
  const importPosition = sourceImportPosition(program)
  add(
    importPosition,
    `${importPosition === program.start ? '' : ';'}import{registerSourceLocation as ${sourceHelper},registerSourceMemberLocation as ${memberSourceHelper}}from"@loutrejs/loutre";`,
  )

  let output = code
  for (const position of [...insertions.keys()].toSorted((a, b) => b - a)) {
    output = `${output.slice(0, position)}${insertions.get(position)!.join('')}${output.slice(position)}`
  }
  return output
}

function collectTopLevelInitializers(program: AstNode): Map<string, AstNode> {
  const initializers = new Map<string, AstNode>()
  for (const statement of program.body ?? []) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? (statement.declaration as AstNode | undefined)
        : statement
    if (declaration?.type !== 'VariableDeclaration') continue
    for (const declarator of declaration.declarations ?? []) {
      if (
        declarator.id?.type === 'Identifier' &&
        declarator.init !== undefined
      ) {
        initializers.set(declarator.id.name, declarator.init as AstNode)
      }
    }
  }
  return initializers
}

function resolveStaticExpression(
  value: AstNode | undefined,
  initializers: ReadonlyMap<string, AstNode>,
  resolving = new Set<string>(),
): AstNode | undefined {
  const expression = unwrapExpression(value)
  if (expression?.type !== 'Identifier') return expression
  const name = expression.name as string
  const initializer = initializers.get(name)
  if (!initializer || resolving.has(name)) return expression
  const nextResolving = new Set(resolving)
  nextResolving.add(name)
  return resolveStaticExpression(initializer, initializers, nextResolving)
}

function collectIdentifierNames(program: AstNode): Set<string> {
  const identifiers = new Set<string>()
  walkAst(program, (node) => {
    if (node.type === 'Identifier' && typeof node.name === 'string') {
      identifiers.add(node.name)
    }
  })
  return identifiers
}

function uniqueHelperName(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base
  for (let index = 1; ; index += 1) {
    const candidate = `${base}$${index}`
    if (!used.has(candidate)) return candidate
  }
}

function sourceImportPosition(program: AstNode): number {
  let position = program.start
  for (const statement of program.body ?? []) {
    if (
      statement.type !== 'ExpressionStatement' ||
      typeof statement.directive !== 'string'
    ) {
      break
    }
    position = statement.end
  }
  return position
}

function collectImportedApis(program: AstNode): ImportedApis {
  const apis: ImportedApis = {
    defineModule: new Set(),
    providerBuilders: new Set(),
    providerFactories: new Set(),
    httpObjects: new Set(),
    httpContract: new Set(),
    httpImplementation: new Set(),
    httpMiddleware: new Set(),
    httpMiddlewareFactories: new Set(),
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
      if (source === '@loutrejs/loutre') {
        if (imported === 'defineModule') apis.defineModule.add(local)
        if (imported === 'provide') apis.providerBuilders.add(local)
        if (
          imported === 'environmentProvider' ||
          imported === 'argumentsProvider'
        ) {
          apis.providerFactories.add(local)
        }
      }
      if (source === '@loutrejs/loutre/http') {
        if (imported === 'http') apis.httpObjects.add(local)
        if (imported === 'defineHttpContract') apis.httpContract.add(local)
        if (imported === 'defineHttpImplementation') {
          apis.httpImplementation.add(local)
        }
        if (imported === 'defineHttpMiddleware') apis.httpMiddleware.add(local)
        if (
          imported === 'basicAuth' ||
          imported === 'bearerAuth' ||
          imported === 'cors'
        ) {
          apis.httpMiddlewareFactories.add(local)
        }
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

function isDirectCall(call: AstNode, names: ReadonlySet<string>): boolean {
  const callee = unwrapExpression(call.callee as AstNode | undefined)
  return callee?.type === 'Identifier' && names.has(callee.name)
}

function isProviderBuilderCall(
  call: AstNode,
  builders: ReadonlySet<string>,
): boolean {
  const callee = unwrapExpression(call.callee as AstNode | undefined)
  if (
    callee?.type !== 'MemberExpression' ||
    callee.computed === true ||
    !['useClass', 'useValue', 'useFactory', 'select'].includes(
      callee.property?.name,
    )
  ) {
    return false
  }
  const builder = unwrapExpression(callee.object as AstNode | undefined)
  return builder?.type === 'CallExpression' && isDirectCall(builder, builders)
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

function returnedHandlerObject(factory: AstNode): AstNode | undefined {
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

function returnedObject(
  factory: AstNode,
  initializers: ReadonlyMap<string, AstNode>,
): AstNode | undefined {
  const body = resolveStaticExpression(
    factory.body as AstNode | undefined,
    initializers,
  )
  if (body?.type === 'ObjectExpression') return body
  if (body?.type !== 'BlockStatement') return undefined
  for (const statement of body.body ?? []) {
    if (statement.type !== 'ReturnStatement') continue
    const returned = resolveStaticExpression(
      statement.argument as AstNode | undefined,
      initializers,
    )
    if (returned?.type === 'ObjectExpression') return returned
  }
  return undefined
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
