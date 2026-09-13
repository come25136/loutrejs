import { isAbsolute, relative, sep, win32 } from 'node:path'
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
  const usedIdentifiers = collectIdentifierNames(program)
  const sourceHelper = uniqueHelperName('__loutreSource', usedIdentifiers)
  const insertions = new Map<number, string[]>()
  const wrapped = new Set<string>()

  const add = (position: number, text: string) => {
    const current = insertions.get(position) ?? []
    current.push(text)
    insertions.set(position, current)
  }
  const sourceLiteral = (offset: number) =>
    JSON.stringify({
      file: sourceFile,
      ...positionAt(code, offset),
    } satisfies SourcePoint)
  const wrapSource = (node: AstNode) => {
    const key = `${node.start}:${node.end}`
    if (wrapped.has(key)) return
    wrapped.add(key)
    add(node.start, `${sourceHelper}(`)
    add(node.end, `,${sourceLiteral(node.start)})`)
  }

  const inspectKnownCall = (call: AstNode) => {
    if (
      isHttpCall(call, apis.httpContract, apis.httpObjects, 'contract') ||
      isHttpCall(
        call,
        apis.httpImplementation,
        apis.httpObjects,
        'implementation',
      ) ||
      isHttpCall(call, apis.httpMiddleware, apis.httpObjects, 'middleware') ||
      isDirectCall(call, apis.httpMiddlewareFactories) ||
      isDirectCall(call, apis.providerFactories) ||
      isProviderBuilderCall(call, apis.providerBuilders) ||
      isDirectCall(call, apis.defineModule)
    ) {
      wrapSource(call)
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
    if (declaration?.type !== 'ClassDeclaration') continue
    if (declaration.declare === true || !declaration.id?.name) continue
    add(
      statement.end,
      `;${sourceHelper}(${declaration.id.name},${sourceLiteral(declaration.start)})`,
    )
  }

  if (insertions.size === 0) return code
  const importPosition = sourceImportPosition(program)
  add(
    importPosition,
    `${importPosition === program.start ? '' : ';'}import{registerSourceLocation as ${sourceHelper}}from"@loutrejs/loutre";`,
  )

  let output = code
  for (const position of [...insertions.keys()].toSorted((a, b) => b - a)) {
    output = `${output.slice(0, position)}${insertions.get(position)!.join('')}${output.slice(position)}`
  }
  return output
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
  if (
    path === '' ||
    path === '..' ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path) ||
    win32.isAbsolute(path)
  ) {
    return undefined
  }
  if (path.split(sep).includes('node_modules')) return undefined
  return path.split(sep).join('/')
}
