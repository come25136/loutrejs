import { isAbsolute, relative, sep, win32 } from 'node:path'
import { parseSync } from '@swc/core'

type AstNode = {
  readonly type: string
  readonly span?: {
    readonly start: number
    readonly end: number
  }
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

  let program: AstNode
  try {
    program = parseSync(code, parserOptions(file)) as unknown as AstNode
  } catch {
    return code
  }

  const toIndex = createSwcPositionMapper(code)
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
    if (!node.span) return
    const start = toIndex(node.span.start)
    const end = toIndex(node.span.end)
    const key = `${start}:${end}`
    if (wrapped.has(key)) return
    wrapped.add(key)
    add(start, `${sourceHelper}(`)
    add(end, `,${sourceLiteral(start)})`)
  }

  walkAst(program, (node) => {
    if (node.type !== 'CallExpression') return
    if (
      isHttpCall(node, apis.httpContract, apis.httpObjects, 'contract') ||
      isHttpCall(
        node,
        apis.httpImplementation,
        apis.httpObjects,
        'implementation',
      ) ||
      isHttpCall(node, apis.httpMiddleware, apis.httpObjects, 'middleware') ||
      isDirectCall(node, apis.httpMiddlewareFactories) ||
      isDirectCall(node, apis.providerFactories) ||
      isProviderBuilderCall(node, apis.providerBuilders) ||
      isDirectCall(node, apis.defineModule)
    ) {
      wrapSource(node)
    }
  })

  for (const statement of program.body ?? []) {
    const declaration = classDeclarationOf(statement)
    const name = declaration?.identifier?.value
    if (
      !declaration ||
      declaration.declare === true ||
      typeof name !== 'string'
    ) {
      continue
    }
    if (!statement.span || !declaration.span) continue
    add(
      toIndex(statement.span.end),
      `;${sourceHelper}(${name},${sourceLiteral(toIndex(declaration.span.start))})`,
    )
  }

  if (insertions.size === 0) return code
  const importPosition = sourceImportPosition(program, code, toIndex)
  add(
    importPosition.position,
    `${importPosition.needsSemicolon ? ';' : ''}import{registerSourceLocation as ${sourceHelper}}from"@loutrejs/loutre";`,
  )

  let output = code
  for (const position of [...insertions.keys()].toSorted((a, b) => b - a)) {
    output = `${output.slice(0, position)}${insertions.get(position)!.join('')}${output.slice(position)}`
  }
  return output
}

function parserOptions(file: string) {
  const lower = file.toLowerCase()
  const typescript = /\.(?:ts|tsx|mts|cts)$/.test(lower)
  const jsx = /\.(?:jsx|tsx)$/.test(lower)
  return typescript
    ? ({
        syntax: 'typescript',
        tsx: jsx,
        decorators: true,
        target: 'esnext',
      } as const)
    : ({
        syntax: 'ecmascript',
        jsx,
        decorators: true,
        target: 'esnext',
      } as const)
}

function collectIdentifierNames(program: AstNode): Set<string> {
  const identifiers = new Set<string>()
  walkAst(program, (node) => {
    if (node.type === 'Identifier' && typeof node.value === 'string') {
      identifiers.add(node.value)
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

function sourceImportPosition(
  program: AstNode,
  code: string,
  toIndex: (position: number) => number,
): { position: number; needsSemicolon: boolean } {
  let position = code.charCodeAt(0) === 0xfeff ? 1 : 0
  if (program.interpreter != null) {
    const lineEnd = code.indexOf('\n', position)
    position = lineEnd === -1 ? code.length : lineEnd + 1
  }

  let needsSemicolon = false
  for (const statement of program.body ?? []) {
    if (
      statement.type !== 'ExpressionStatement' ||
      statement.expression?.type !== 'StringLiteral' ||
      !statement.span
    ) {
      break
    }
    position = toIndex(statement.span.end)
    needsSemicolon = true
  }
  return { position, needsSemicolon }
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
    if (statement.type !== 'ImportDeclaration' || statement.typeOnly === true) {
      continue
    }
    const source = statement.source?.value
    if (source !== '@loutrejs/loutre' && source !== '@loutrejs/loutre/http') {
      continue
    }
    for (const specifier of statement.specifiers ?? []) {
      if (
        specifier.type !== 'ImportSpecifier' ||
        specifier.isTypeOnly === true
      ) {
        continue
      }
      const local = specifier.local
      const key = bindingKey(local)
      const imported = specifier.imported?.value ?? local?.value
      if (!key || typeof imported !== 'string') continue
      if (source === '@loutrejs/loutre') {
        if (imported === 'defineModule') apis.defineModule.add(key)
        if (imported === 'provide') apis.providerBuilders.add(key)
        if (
          imported === 'environmentProvider' ||
          imported === 'argumentsProvider'
        ) {
          apis.providerFactories.add(key)
        }
      }
      if (source === '@loutrejs/loutre/http') {
        if (imported === 'http') apis.httpObjects.add(key)
        if (imported === 'defineHttpContract') apis.httpContract.add(key)
        if (imported === 'defineHttpImplementation') {
          apis.httpImplementation.add(key)
        }
        if (imported === 'defineHttpMiddleware') apis.httpMiddleware.add(key)
        if (
          imported === 'basicAuth' ||
          imported === 'bearerAuth' ||
          imported === 'cors'
        ) {
          apis.httpMiddlewareFactories.add(key)
        }
      }
    }
  }
  return apis
}

function bindingKey(node: AstNode | undefined): string | undefined {
  if (
    node?.type !== 'Identifier' ||
    typeof node.value !== 'string' ||
    typeof node.ctxt !== 'number'
  ) {
    return undefined
  }
  return `${node.value}\0${node.ctxt}`
}

function isImportedIdentifier(
  node: AstNode | undefined,
  bindings: ReadonlySet<string>,
): boolean {
  const key = bindingKey(node)
  return key !== undefined && bindings.has(key)
}

function isDirectCall(call: AstNode, bindings: ReadonlySet<string>): boolean {
  return isImportedIdentifier(
    unwrapExpression(call.callee as AstNode | undefined),
    bindings,
  )
}

function isProviderBuilderCall(
  call: AstNode,
  builders: ReadonlySet<string>,
): boolean {
  const callee = unwrapExpression(call.callee as AstNode | undefined)
  if (
    callee?.type !== 'MemberExpression' ||
    callee.property?.type !== 'Identifier' ||
    !['useClass', 'useValue', 'useFactory', 'select'].includes(
      callee.property.value,
    )
  ) {
    return false
  }
  const builder = unwrapExpression(callee.object as AstNode | undefined)
  return builder?.type === 'CallExpression' && isDirectCall(builder, builders)
}

function isHttpCall(
  call: AstNode,
  directBindings: ReadonlySet<string>,
  objectBindings: ReadonlySet<string>,
  member: string,
): boolean {
  const callee = unwrapExpression(call.callee as AstNode | undefined)
  if (callee?.type === 'Identifier') {
    return isImportedIdentifier(callee, directBindings)
  }
  return (
    callee?.type === 'MemberExpression' &&
    callee.property?.type === 'Identifier' &&
    callee.property.value === member &&
    isImportedIdentifier(
      unwrapExpression(callee.object as AstNode | undefined),
      objectBindings,
    )
  )
}

function unwrapExpression(value: AstNode | undefined): AstNode | undefined {
  let current = value
  while (
    current?.expression &&
    [
      'ParenthesisExpression',
      'TsAsExpression',
      'TsConstAssertion',
      'TsInstantiation',
      'TsNonNullExpression',
      'TsSatisfiesExpression',
      'TsTypeAssertion',
    ].includes(current.type)
  ) {
    current = current.expression as AstNode
  }
  return current
}

function classDeclarationOf(statement: AstNode): AstNode | undefined {
  if (statement.type === 'ClassDeclaration') return statement
  if (
    statement.type === 'ExportDeclaration' &&
    statement.declaration?.type === 'ClassDeclaration'
  ) {
    return statement.declaration
  }
  if (
    statement.type === 'ExportDefaultDeclaration' &&
    statement.decl?.type === 'ClassExpression'
  ) {
    return statement.decl
  }
  return undefined
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
    if (typeof record.type === 'string') visit(record as AstNode)
    for (const child of Object.values(record)) walk(child)
  }
  walk(root)
}

function createSwcPositionMapper(code: string): (position: number) => number {
  const indexByByteOffset = new Map<number, number>([[0, 0]])
  let byteOffset = 0
  for (let index = 0; index < code.length;) {
    const codePoint = code.codePointAt(index)!
    byteOffset += utf8Length(codePoint)
    index += codePoint > 0xffff ? 2 : 1
    indexByByteOffset.set(byteOffset, index)
  }
  return (position: number) =>
    indexByByteOffset.get(Math.max(0, position - 1)) ?? 0
}

function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
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
