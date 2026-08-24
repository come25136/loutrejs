import {
  API,
  type Checker,
  DiagnosticCategory,
  type Diagnostic as TypeScriptDiagnostic,
  type NumberLiteralType,
  type Program,
  type Snapshot,
  SymbolFlags,
  type StringLiteralType,
  type Type,
  type TypeReference,
} from 'typescript/unstable/sync'
import * as ts from 'typescript/unstable/ast'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import type { Diagnostic, LayerIR } from './ir.js'
import {
  validateSourceConstructorDependencies,
  validateSourceContextKeyNames,
  validateSourceContextProperties,
  validateSourceCoverage,
  validateSourceLayerReturns,
  validateSourceTokenIds,
} from './source-validation.js'

export interface SourceLocationIR {
  readonly file: string
  readonly line: number
  readonly column: number
}

export interface SourceModuleIR {
  readonly name: string
  readonly description?: string
  readonly location: SourceLocationIR
  readonly imports: readonly string[]
  readonly providers: readonly string[]
  readonly exports: readonly string[]
  readonly implementations: readonly string[]
  readonly lifecycle: readonly string[]
  readonly requires: readonly string[]
}

export interface SourceContractProcedureIR {
  readonly name: string
  readonly protocols: readonly {
    readonly name: string
    readonly interaction: 'unary' | 'server-stream' | 'client-stream' | 'duplex'
    readonly pipeline: readonly LayerIR[]
    readonly responses: readonly {
      readonly name: string
      readonly status?: number
    }[]
  }[]
}

export interface SourceContractIR {
  readonly name: string
  readonly location: SourceLocationIR
  readonly procedures: readonly SourceContractProcedureIR[]
}

export interface ConstructorDependencyIR {
  readonly index: number
  readonly parameter: string
  readonly reference: string
  readonly rootReference: string
  readonly symbol?: number
  readonly explicitInject: boolean
}

export interface SourceConstructorIR {
  readonly className: string
  readonly symbol?: number
  readonly location: SourceLocationIR
  readonly dependencies: readonly ConstructorDependencyIR[]
}

export interface SourceRuntimeImportIR {
  readonly file: string
  readonly module: string
  readonly kind: 'named' | 'default' | 'namespace'
  readonly local: string
  readonly imported?: string
  readonly typeOnly: boolean
}

export interface SourceManagedProviderIR {
  readonly reference: string
  readonly symbol: number
}

export interface ContextPropertyUseIR {
  readonly className: string
  readonly method: string
  readonly property: string
  readonly location: SourceLocationIR
}

export interface SourceContextKeyIR {
  readonly name: string
  readonly property: string
  readonly location: SourceLocationIR
}

export interface SourceTokenIR {
  readonly name: string
  readonly id: string
  readonly location: SourceLocationIR
}

export interface SourceApplicationManifest {
  readonly version: 1
  readonly files: readonly string[]
  readonly modules: readonly SourceModuleIR[]
  readonly providers: readonly string[]
  readonly contracts: readonly SourceContractIR[]
  readonly pipelines: readonly {
    readonly contract: string
    readonly procedure: string
    readonly protocol: string
    readonly layers: readonly LayerIR[]
  }[]
  readonly constructors: readonly SourceConstructorIR[]
  readonly tokens: readonly SourceTokenIR[]
  readonly contextKeys: readonly SourceContextKeyIR[]
  readonly contextProperties: readonly ContextPropertyUseIR[]
  readonly implementations: readonly SourceImplementationIR[]
  readonly runtimeImports: readonly SourceRuntimeImportIR[]
  readonly managedProviders: readonly SourceManagedProviderIR[]
  readonly capabilities: readonly string[]
  readonly envKeys: readonly { readonly env: string; readonly key: string }[]
  readonly conditions: readonly { readonly module: string; readonly source: string }[]
  readonly lifecycles: readonly { readonly module: string; readonly hook: string }[]
  readonly diagnostics: readonly Diagnostic[]
}

export interface SourceImplementationIR {
  readonly contract: string
  readonly protocol: string
  readonly procedures?: readonly string[]
  readonly implementation: string
  readonly implementationSymbol?: number
}

export interface SourceCompilerOptions {
  readonly tsconfigPath: string
  readonly entry?: string
  readonly includeDeclarationFiles?: boolean
  readonly fileChanges?: {
    readonly changed?: string[]
    readonly created?: string[]
    readonly deleted?: string[]
  }
}

export interface SourceCompilerSession {
  compile(options: SourceCompilerOptions): SourceApplicationManifest
  close(): void
}

export function createSourceCompilerSession(): SourceCompilerSession {
  let api = new API()
  let closed = false
  return {
    compile(options) {
      if (closed) throw new Error('終了済みSource Compiler Sessionは利用できません')
      try {
        return compileTypeScriptSourceWithApi(api, options)
      } catch (error) {
        if (!isStaleCompilerHandleError(error)) throw error
        api.close()
        api = new API()
        const { fileChanges: _fileChanges, ...fullBuildOptions } = options
        return compileTypeScriptSourceWithApi(api, fullBuildOptions)
      }
    },
    close() {
      if (closed) return
      closed = true
      api.close()
    },
  }
}

function isStaleCompilerHandleError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('could not be resolved') &&
    error.message.includes('handle')
  )
}

export function compileTypeScriptSource(
  options: SourceCompilerOptions,
): SourceApplicationManifest {
  const session = createSourceCompilerSession()
  try {
    return session.compile(options)
  } finally {
    session.close()
  }
}

function compileTypeScriptSourceWithApi(
  api: API,
  options: SourceCompilerOptions,
): SourceApplicationManifest {
  const snapshot = api.updateSnapshot({
    openProjects: [options.tsconfigPath],
    ...(options.fileChanges ? { fileChanges: options.fileChanges } : {}),
  })
  try {
    return compileTypeScriptSnapshot(snapshot, options)
  } finally {
    snapshot.dispose()
  }
}

function compileTypeScriptSnapshot(
  snapshot: Snapshot,
  options: SourceCompilerOptions,
): SourceApplicationManifest {
  const project = snapshot
    .getProjects()
    .find(({ configFileName }) => resolve(configFileName) === resolve(options.tsconfigPath))
  if (!project) {
    throw new Error(`TypeScript projectを開けませんでした: ${options.tsconfigPath}`)
  }
  const program = project.program
  const checker = project.checker
  const candidateSourceFiles = program
    .getSourceFileNames()
    .map((fileName) => program.getSourceFile(fileName))
    .filter((sourceFile): sourceFile is ts.SourceFile => sourceFile !== undefined)
    .filter(
      (sourceFile) =>
        (options.includeDeclarationFiles === true || !sourceFile.isDeclarationFile) &&
        !sourceFile.fileName.includes('/node_modules/') &&
        !sourceFile.fileName.includes('/tests/'),
    )
  const sourceFiles = options.entry
    ? collectReachableSourceFiles(
        program,
        candidateSourceFiles,
        isAbsolute(options.entry)
          ? options.entry
          : resolve(dirname(options.tsconfigPath), options.entry),
      )
    : candidateSourceFiles
  const modules: SourceModuleIR[] = []
  const contracts: SourceContractIR[] = []
  const constructors: SourceConstructorIR[] = []
  const tokens: SourceTokenIR[] = []
  const contextKeys: SourceContextKeyIR[] = []
  const contextProperties: ContextPropertyUseIR[] = []
  const providers = new Set<string>()
  const diagnostics: Diagnostic[] = collectTypeScriptDiagnostics(
    program,
    sourceFiles,
    options.tsconfigPath,
  )
  const envKeys: { env: string; key: string }[] = []
  const layerDefinitions = new Map<string, Omit<LayerIR, 'index'>>()
  const sourceModules: SourceModuleDeclaration[] = []
  const implementations: SourceImplementationIR[] = []
  const runtimeImports: SourceRuntimeImportIR[] = []

  for (const sourceFile of sourceFiles) {
    visitSourceFile(sourceFile, {
      checker,
      modules,
      contracts,
      constructors,
      tokens,
      contextKeys,
      contextProperties,
      providers,
      diagnostics,
      envKeys,
      layerDefinitions,
      sourceModules,
      implementations,
      runtimeImports,
    })
  }

  const managedProviders = sourceModules.flatMap((module) =>
    module.providers.flatMap((provider) => provider.managedClasses),
  )
  validateSourceTokenIds(tokens, diagnostics)
  validateSourceDuplicateProviders(sourceModules, diagnostics)
  validateSourceContextKeyNames(contextKeys, diagnostics)
  validateSourceCoverage(contracts, implementations, diagnostics)
  validateSourceConstructorDependencies(
    implementations,
    constructors,
    providers,
    diagnostics,
  )

  const contextPropertyByDeclaration = new Map(
    contextKeys.map((key) => [key.name, key.property]),
  )
  const pipelines = contracts.flatMap((contract) =>
    contract.procedures.flatMap((procedure) =>
      procedure.protocols.map((protocol) => ({
        contract: contract.name,
        procedure: procedure.name,
        protocol: protocol.name,
        layers: protocol.pipeline.map((layer) => ({
          ...layer,
          requires: layer.requires.map(
            (reference) => contextPropertyByDeclaration.get(reference) ?? reference,
          ),
          provides: layer.provides.map(
            (reference) => contextPropertyByDeclaration.get(reference) ?? reference,
          ),
        })),
      })),
    ),
  )
  validateSourceContextProperties(
    implementations,
    contextProperties,
    contextKeys,
    pipelines,
    diagnostics,
  )
  validateSourceLayerReturns(pipelines, diagnostics)
  const capabilities = new Set<string>()
  for (const pipeline of pipelines) {
    capabilities.add('crypto.random')
    if (pipeline.protocol === 'http') capabilities.add('http.server')
    if (pipeline.protocol === 'messagePort') {
      capabilities.add('messagePort.send')
      capabilities.add('messagePort.receive')
    }
    const protocol = contracts
      .find(({ name }) => name === pipeline.contract)
      ?.procedures.find(({ name }) => name === pipeline.procedure)
      ?.protocols.find(({ name }) => name === pipeline.protocol)
    if (protocol?.interaction === 'server-stream') {
      capabilities.add('stream.readable')
      if (pipeline.protocol === 'http') capabilities.add('http.response.streaming')
    }
  }
  for (const module of modules) {
    for (const requirement of module.requires) {
      capabilities.add(requirement.replace(/^['"]|['"]$/g, ''))
    }
  }

  const manifest: SourceApplicationManifest = {
    version: 1,
    files: sourceFiles.map((sourceFile) => sourceFile.fileName),
    modules,
    providers: [...providers],
    contracts,
    pipelines,
    constructors,
    tokens,
    contextKeys,
    contextProperties,
    implementations,
    runtimeImports,
    managedProviders,
    capabilities: [...capabilities],
    envKeys,
    conditions: modules.flatMap((module) =>
      module.providers
        .filter((provider) => provider.includes('.select('))
        .map((source) => ({ module: module.name, source })),
    ),
    lifecycles: modules.flatMap((module) =>
      module.lifecycle.map((hook) => ({ module: module.name, hook })),
    ),
    diagnostics,
  }
  return manifest
}

function collectTypeScriptDiagnostics(
  program: Program,
  sourceFiles: readonly ts.SourceFile[],
  tsconfigPath: string,
): Diagnostic[] {
  const compilerDiagnostics = [
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getProgramDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...sourceFiles.flatMap((sourceFile) => {
      const syntactic = program.getSyntacticDiagnostics(sourceFile.fileName)
      return syntactic.length > 0
        ? syntactic
        : [
            ...program.getBindDiagnostics(sourceFile.fileName),
            ...program.getSemanticDiagnostics(sourceFile.fileName),
          ]
    }),
  ].filter(({ category }) => category === DiagnosticCategory.Error)
  const unique = new Map<string, Diagnostic>()
  for (const diagnostic of compilerDiagnostics) {
    const converted = convertTypeScriptDiagnostic(diagnostic, program, tsconfigPath)
    unique.set(
      `${converted.code}\0${converted.path}\0${converted.message}`,
      converted,
    )
  }
  return [...unique.values()]
}

function convertTypeScriptDiagnostic(
  diagnostic: TypeScriptDiagnostic,
  program: Program,
  tsconfigPath: string,
): Diagnostic {
  const file = diagnostic.fileName
  const sourceFile = file ? program.getSourceFile(file) : undefined
  const position =
    sourceFile && diagnostic.pos >= 0
      ? sourceFile.getLineAndCharacterOfPosition(diagnostic.pos)
      : undefined
  const path = file
    ? `${file}${position ? `:${position.line + 1}:${position.character + 1}` : ''}`
    : tsconfigPath
  return {
    code: `TS${diagnostic.code}`,
    message: formatTypeScriptDiagnosticMessage(diagnostic),
    path,
  }
}

function formatTypeScriptDiagnosticMessage(
  diagnostic: TypeScriptDiagnostic,
): string {
  const nested = diagnostic.messageChain?.map(formatTypeScriptDiagnosticMessage) ?? []
  return [diagnostic.text, ...nested].join('\n')
}

function collectReachableSourceFiles(
  program: Program,
  candidates: readonly ts.SourceFile[],
  entry: string,
): ts.SourceFile[] {
  const byPath = new Map(
    candidates.map((sourceFile) => [resolve(sourceFile.fileName), sourceFile]),
  )
  const first = byPath.get(resolve(entry)) ?? program.getSourceFile(entry)
  if (!first) {
    throw new Error(`Application entryがTypeScript Programにありません: ${entry}`)
  }

  const reachable: ts.SourceFile[] = []
  const visited = new Set<string>()
  const visit = (sourceFile: ts.SourceFile) => {
    const path = resolve(sourceFile.fileName)
    if (visited.has(path)) return
    visited.add(path)
    if (!sourceFile.isDeclarationFile && !sourceFile.fileName.includes('/node_modules/')) {
      reachable.push(sourceFile)
    }

    for (const statement of sourceFile.statements) {
      const specifier =
        (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined
      if (!specifier) continue
      if (!specifier.startsWith('.')) continue
      const dependency = resolveRelativeSourceFile(
        byPath,
        sourceFile.fileName,
        specifier,
      )
      if (dependency) visit(dependency)
    }
  }
  visit(first)
  return reachable
}

function resolveRelativeSourceFile(
  sourceFiles: ReadonlyMap<string, ts.SourceFile>,
  importer: string,
  specifier: string,
): ts.SourceFile | undefined {
  const requested = resolve(dirname(importer), specifier)
  const extension = extname(requested)
  const stem = extension ? requested.slice(0, -extension.length) : requested
  const candidates = [
    requested,
    `${stem}.ts`,
    `${stem}.tsx`,
    `${stem}.mts`,
    `${stem}.cts`,
    resolve(requested, 'index.ts'),
    resolve(requested, 'index.tsx'),
  ]
  for (const candidate of candidates) {
    const sourceFile = sourceFiles.get(resolve(candidate))
    if (sourceFile) return sourceFile
  }
  return undefined
}

interface VisitState {
  readonly checker: Checker
  readonly modules: SourceModuleIR[]
  readonly contracts: SourceContractIR[]
  readonly constructors: SourceConstructorIR[]
  readonly tokens: SourceTokenIR[]
  readonly contextKeys: SourceContextKeyIR[]
  readonly contextProperties: ContextPropertyUseIR[]
  readonly providers: Set<string>
  readonly diagnostics: Diagnostic[]
  readonly envKeys: { env: string; key: string }[]
  readonly layerDefinitions: Map<string, Omit<LayerIR, 'index'>>
  readonly sourceModules: SourceModuleDeclaration[]
  readonly implementations: SourceImplementationIR[]
  readonly runtimeImports: SourceRuntimeImportIR[]
}

interface SourceProviderDeclaration {
  readonly id: string
  readonly tokenSymbol: number
  readonly reference: string
  readonly module: string
  readonly location: SourceLocationIR
  readonly managedClasses: readonly SourceManagedProviderIR[]
}

interface SourceModuleDeclaration {
  readonly symbol: number
  readonly name: string
  readonly imports: readonly number[]
  readonly providers: readonly SourceProviderDeclaration[]
}

function visitSourceFile(sourceFile: ts.SourceFile, state: VisitState): void {
  state.runtimeImports.push(...readRuntimeImports(sourceFile, state.checker))
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const typedLayer = readLayerTypeDefinition(
        node.name.text,
        node.initializer,
        state.checker,
      )
      if (typedLayer) state.layerDefinitions.set(node.name.text, typedLayer)
      if (typedLayer && isFactoryInvocation(node.initializer, 'layer')) {
        const definition = node.initializer.arguments[0]
        const returns =
          definition && ts.isObjectLiteralExpression(definition)
            ? readInboundReturnedProperties(definition)
            : undefined
        if (returns) {
          state.layerDefinitions.set(node.name.text, {
            ...typedLayer,
            returns,
          })
        }
      }
      const declaredToken = readTokenDeclaration(
        node.name.text,
        node.initializer,
        sourceFile,
      )
      if (declaredToken) state.tokens.push(declaredToken)
      const declaredContextKey = readContextKeyDeclaration(
        node.name.text,
        node.initializer,
        sourceFile,
      )
      if (declaredContextKey) state.contextKeys.push(declaredContextKey)
      if (isNamedCall(node.initializer, 'defineModule')) {
        const module = readModule(node.name.text, node.initializer, sourceFile)
        state.modules.push(module)
        for (const provider of module.providers) state.providers.add(provider)
        const sourceModule = readSourceModuleDeclaration(
          node.name,
          node.initializer,
          sourceFile,
          state.checker,
        )
        if (sourceModule) state.sourceModules.push(sourceModule)
        state.implementations.push(
          ...readSourceImplementations(
            node.initializer,
            sourceFile,
            state.checker,
          ),
        )
      }
      if (isNamedCall(node.initializer, 'contract')) {
        state.contracts.push(
          readContract(
            node.name.text,
            node.initializer,
            sourceFile,
            state.diagnostics,
            state.layerDefinitions,
            state.checker,
          ),
        )
      }
    }
    if (ts.isClassDeclaration(node) && node.name) {
      const constructor = readConstructor(node, sourceFile, state.checker)
      state.constructors.push(constructor)
      state.contextProperties.push(...readContextPropertyUses(node, sourceFile))
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'key' &&
      ts.isIdentifier(node.expression.expression) &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      state.envKeys.push({
        env: node.expression.expression.text,
        key: node.arguments[0].text,
      })
    }
    node.forEachChild(visit)
  }
  visit(sourceFile)
}

function readRuntimeImports(
  sourceFile: ts.SourceFile,
  _checker: Checker,
): SourceRuntimeImportIR[] {
  const imports: SourceRuntimeImportIR[] = []
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause
    ) {
      continue
    }
    const module = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (clause.name) {
      imports.push({
        file: sourceFile.fileName,
        module,
        kind: 'default',
        local: clause.name.text,
        typeOnly: clause.phaseModifier === ts.SyntaxKind.TypeKeyword,
      })
    }
    const bindings = clause.namedBindings
    if (!bindings) continue
    if (ts.isNamespaceImport(bindings)) {
      imports.push({
        file: sourceFile.fileName,
        module,
        kind: 'namespace',
        local: bindings.name.text,
        typeOnly: clause.phaseModifier === ts.SyntaxKind.TypeKeyword,
      })
      continue
    }
    for (const element of bindings.elements) {
      imports.push({
        file: sourceFile.fileName,
        module,
        kind: 'named',
        local: element.name.text,
        imported: element.propertyName?.text ?? element.name.text,
        typeOnly:
          clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
          element.isTypeOnly,
      })
    }
  }
  return imports
}

function readTokenDeclaration(
  name: string,
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
): SourceTokenIR | undefined {
  if (
    !ts.isCallExpression(expression) ||
    !isNamedCall(expression, 'token')
  ) {
    return undefined
  }
  const id = expression.arguments[0]
  if (!id || !ts.isStringLiteral(id)) return undefined
  return {
    name,
    id: id.text,
    location: locationOf(expression, sourceFile),
  }
}

function readContextKeyDeclaration(
  name: string,
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
): SourceContextKeyIR | undefined {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    expression.expression.name.text !== 'of' ||
    !ts.isCallExpression(expression.expression.expression) ||
    !isNamedCall(expression.expression.expression, 'contextKey')
  ) {
    return undefined
  }
  const property = expression.expression.expression.arguments[0]
  if (!property || !ts.isStringLiteral(property)) return undefined
  return {
    name,
    property: property.text,
    location: locationOf(expression, sourceFile),
  }
}

function readModule(
  name: string,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
): SourceModuleIR {
  const factory = call.arguments[0]
  const definition = factory && getReturnedObject(factory)
  const description = definition
    ? readObjectProperty(definition, 'description')
    : undefined
  return {
    name,
    ...(description === undefined
      ? {}
      : {
          description:
            ts.isStringLiteral(description) ||
            ts.isNoSubstitutionTemplateLiteral(description)
              ? description.text
              : description.getText(sourceFile),
        }),
    location: locationOf(call, sourceFile),
    imports: readArrayProperty(definition, 'imports', sourceFile),
    providers: readArrayProperty(definition, 'providers', sourceFile),
    exports: readArrayProperty(definition, 'exports', sourceFile),
    implementations: readArrayProperty(
      definition,
      'implementations',
      sourceFile,
    ),
    lifecycle: readObjectKeys(
      definition ? readObjectProperty(definition, 'lifecycle') : undefined,
    ),
    requires: readArrayProperty(definition, 'requires', sourceFile),
  }
}

function readSourceModuleDeclaration(
  name: ts.Identifier,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  checker: Checker,
): SourceModuleDeclaration | undefined {
  const moduleSymbol = resolveSourceSymbol(name, checker)
  if (moduleSymbol === undefined) return undefined
  const factory = call.arguments[0]
  const definition = factory && getReturnedObject(factory)
  const imports = definition
    ? readObjectProperty(definition, 'imports')
    : undefined
  const providers = definition
    ? readObjectProperty(definition, 'providers')
    : undefined

  return {
    symbol: moduleSymbol,
    name: name.text,
    imports:
      imports && ts.isArrayLiteralExpression(imports)
        ? imports.elements.flatMap((element) => {
            if (ts.isSpreadElement(element)) return []
            const target = readModuleImportTarget(element)
            const symbol = target && resolveSourceSymbol(target, checker)
            return symbol === undefined ? [] : [symbol]
          })
        : [],
    providers:
      providers && ts.isArrayLiteralExpression(providers)
        ? providers.elements.flatMap((element) => {
            if (ts.isSpreadElement(element)) return []
            const token = readProviderTokenExpression(element)
            const tokenSymbol = token && resolveSourceSymbol(token, checker)
            if (!token || tokenSymbol === undefined) return []
            const location = locationOf(element, sourceFile)
            return [{
              id: `${location.file}:${location.line}:${location.column}`,
              tokenSymbol,
              reference: token.getText(sourceFile),
              module: name.text,
              location,
              managedClasses: readManagedProviderExpressions(element)
                .flatMap((managed) => {
                  const symbol = resolveSourceSymbol(managed, checker)
                  return symbol === undefined
                    ? []
                    : [{ reference: managed.getText(sourceFile), symbol }]
                }),
            }]
          })
        : [],
  }
}

function readManagedProviderExpressions(
  expression: ts.Expression,
): ts.Expression[] {
  const unwrapped = unwrapExpression(expression)
  if (ts.isIdentifier(unwrapped) || ts.isPropertyAccessExpression(unwrapped)) {
    return [unwrapped]
  }
  if (!ts.isCallExpression(unwrapped)) return []
  const called = unwrapped.expression
  if (!ts.isPropertyAccessExpression(called)) return []
  if (called.name.text === 'useClass') {
    const implementation = unwrapped.arguments[0]
    return implementation ? [implementation] : []
  }
  if (called.name.text !== 'select') return []
  const mapping = unwrapped.arguments[1]
  if (!mapping || !ts.isObjectLiteralExpression(mapping)) return []
  return mapping.properties.flatMap((property) => {
    if (ts.isPropertyAssignment(property)) return [property.initializer]
    if (ts.isShorthandPropertyAssignment(property)) {
      return ts.isIdentifier(property.name) ? [property.name] : []
    }
    return []
  })
}

function readSourceImplementations(
  moduleCall: ts.CallExpression,
  sourceFile: ts.SourceFile,
  checker: Checker,
): SourceImplementationIR[] {
  const factory = moduleCall.arguments[0]
  const definition = factory && getReturnedObject(factory)
  const implementations = definition
    ? readObjectProperty(definition, 'implementations')
    : undefined
  if (!implementations || !ts.isArrayLiteralExpression(implementations)) {
    return []
  }
  return implementations.elements.flatMap((element) => {
    if (ts.isSpreadElement(element)) return []
    const parsed = readSourceImplementation(element, sourceFile, checker)
    return parsed ? [parsed] : []
  })
}

function readSourceImplementation(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  checker: Checker,
): SourceImplementationIR | undefined {
  const withCall = unwrapExpression(expression)
  if (
    !ts.isCallExpression(withCall) ||
    !ts.isPropertyAccessExpression(withCall.expression) ||
    withCall.expression.name.text !== 'with'
  ) {
    return undefined
  }
  const implementation = withCall.arguments[0]
  if (!implementation) return undefined
  let chain = unwrapExpression(withCall.expression.expression)
  let procedures: string[] | undefined
  if (
    ts.isCallExpression(chain) &&
    ts.isPropertyAccessExpression(chain.expression) &&
    chain.expression.name.text === 'procedures'
  ) {
    procedures = chain.arguments.flatMap((argument) =>
      ts.isStringLiteral(argument) ? [argument.text] : [],
    )
    chain = unwrapExpression(chain.expression.expression)
  }
  if (
    !ts.isCallExpression(chain) ||
    !ts.isPropertyAccessExpression(chain.expression) ||
    chain.expression.name.text !== 'for'
  ) {
    return undefined
  }
  const protocol = chain.arguments[0]
  const implementCall = unwrapExpression(chain.expression.expression)
  if (!protocol || !isNamedCall(implementCall, 'implement')) return undefined
  const contract = implementCall.arguments[0]
  if (!contract) return undefined
  const implementationSymbol = resolveSourceSymbol(implementation, checker)
  return {
    contract: contract.getText(sourceFile),
    protocol: protocol.getText(sourceFile),
    ...(procedures === undefined ? {} : { procedures }),
    implementation: implementation.getText(sourceFile),
    ...(implementationSymbol === undefined ? {} : { implementationSymbol }),
  }
}

function readModuleImportTarget(
  expression: ts.Expression,
): ts.Expression | undefined {
  const unwrapped = unwrapExpression(expression)
  if (!ts.isCallExpression(unwrapped)) return undefined
  return ts.isExpression(unwrapped.expression)
    ? unwrapped.expression
    : undefined
}

function readProviderTokenExpression(
  expression: ts.Expression,
): ts.Expression | undefined {
  const unwrapped = unwrapExpression(expression)
  if (ts.isIdentifier(unwrapped) || ts.isPropertyAccessExpression(unwrapped)) {
    return unwrapped
  }
  if (!ts.isCallExpression(unwrapped)) return undefined
  const called = unwrapped.expression
  if (
    (ts.isIdentifier(called) && called.text === 'provide') ||
    (ts.isPropertyAccessExpression(called) && called.name.text === 'provide')
  ) {
    return unwrapped.arguments[0]
  }
  if (ts.isPropertyAccessExpression(called)) {
    return readProviderTokenExpression(called.expression)
  }
  return undefined
}

function resolveSourceSymbol(
  expression: ts.Node,
  checker: Checker,
): number | undefined {
  let symbol = checker.getSymbolAtLocation(expression)
  if (!symbol) return undefined
  if ((symbol.flags & SymbolFlags.Alias) !== 0) {
    symbol = checker.getAliasedSymbol(symbol)
  }
  return checker.isUnknownSymbol(symbol) ? undefined : symbol.id
}

function readContract(
  name: string,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  diagnostics: Diagnostic[],
  layerDefinitions: ReadonlyMap<string, Omit<LayerIR, 'index'>>,
  checker: Checker,
): SourceContractIR {
  const definition = call.arguments[0]
  const procedures: SourceContractProcedureIR[] = []
  if (definition && ts.isObjectLiteralExpression(definition)) {
    for (const property of definition.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const procedureName = propertyName(property.name)
      if (!procedureName || !isNamedCall(property.initializer, 'procedure')) continue
      const procedureObject = property.initializer.arguments[0]
      const protocolsObject =
        procedureObject && ts.isObjectLiteralExpression(procedureObject)
          ? readObjectProperty(procedureObject, 'protocols')
          : undefined
      const protocols: SourceContractProcedureIR['protocols'][number][] = []
      if (protocolsObject && ts.isObjectLiteralExpression(protocolsObject)) {
        for (const protocolProperty of protocolsObject.properties) {
          if (!ts.isPropertyAssignment(protocolProperty)) continue
          const protocolName = propertyName(protocolProperty.name)
          if (!protocolName || !ts.isCallExpression(protocolProperty.initializer)) continue
          const protocolDefinition = protocolProperty.initializer.arguments[0]
          const pipelineExpression =
            protocolDefinition && ts.isObjectLiteralExpression(protocolDefinition)
              ? readObjectProperty(protocolDefinition, 'pipeline')
              : undefined
          const interactionExpression =
            protocolDefinition && ts.isObjectLiteralExpression(protocolDefinition)
              ? readObjectProperty(protocolDefinition, 'interaction')
              : undefined
          const interaction =
            interactionExpression && ts.isStringLiteral(interactionExpression)
              ? interactionExpression.text
              : 'unary'
          const responsesExpression =
            protocolDefinition && ts.isObjectLiteralExpression(protocolDefinition)
              ? readObjectProperty(protocolDefinition, 'responses')
              : undefined
          const responses = readSourceResponses(responsesExpression)
          const pipeline =
            pipelineExpression && ts.isArrayLiteralExpression(pipelineExpression)
              ? pipelineExpression.elements.map((element, index) =>
                  sourceLayer(
                    element,
                    index,
                    sourceFile,
                    layerDefinitions,
                    checker,
                  ),
                )
            : []
          validateSourceTerminal(
            name,
            procedureName,
            protocolName,
            pipeline,
            diagnostics,
          )
          validateSourceLayerOrder(
            name,
            procedureName,
            protocolName,
            pipeline,
            diagnostics,
          )
          validateSourceShortCircuitResponses(
            name,
            procedureName,
            protocolName,
            pipeline,
            responses,
            diagnostics,
          )
          protocols.push({
            name: protocolName,
            interaction: interaction as
              | 'unary'
              | 'server-stream'
              | 'client-stream'
              | 'duplex',
            pipeline,
            responses,
          })
        }
      }
      procedures.push({ name: procedureName, protocols })
    }
  }
  return { name, location: locationOf(call, sourceFile), procedures }
}

function readConstructor(
  declaration: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  checker: Checker,
): SourceConstructorIR {
  const constructor = declaration.members.find(ts.isConstructorDeclaration)
  const dependencies: ConstructorDependencyIR[] = []
  for (const [index, parameter] of (constructor?.parameters ?? []).entries()) {
    const inject = parameter.modifiers
      ?.filter(ts.isDecorator)
      ?.map((decorator) => decorator.expression)
      .find(
        (expression): expression is ts.CallExpression =>
          isNamedCall(expression, 'Inject'),
      )
    const referenceNode = inject?.arguments[0] ?? readTypeReferenceNode(parameter.type)
    if (!referenceNode) continue
    const root = readRootReference(referenceNode)
    if (!root) continue
    const dependencySymbol = resolveSourceSymbol(referenceNode, checker)
    dependencies.push({
      index,
      parameter: parameter.name.getText(sourceFile),
      reference: referenceNode.getText(sourceFile),
      rootReference: root.text,
      ...(dependencySymbol === undefined ? {} : { symbol: dependencySymbol }),
      explicitInject: inject !== undefined,
    })
  }
  const classSymbol = resolveSourceSymbol(declaration.name!, checker)
  return {
    className: declaration.name!.text,
    ...(classSymbol === undefined ? {} : { symbol: classSymbol }),
    location: locationOf(declaration, sourceFile),
    dependencies,
  }
}

function readTypeReferenceNode(type: ts.TypeNode | undefined): ts.Node | undefined {
  return type && ts.isTypeReferenceNode(type) ? type.typeName : undefined
}

function readRootReference(node: ts.Node): ts.Identifier | undefined {
  if (ts.isIdentifier(node)) return node
  if (ts.isQualifiedName(node)) return readRootReference(node.left)
  if (ts.isPropertyAccessExpression(node)) return readRootReference(node.expression)
  return undefined
}

function readContextPropertyUses(
  declaration: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): ContextPropertyUseIR[] {
  const uses: ContextPropertyUseIR[] = []
  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member) || !member.body) continue
    const method = member.name && propertyName(member.name)
    const contextParameter = member.parameters[0]?.name
    if (!method || !contextParameter || !ts.isIdentifier(contextParameter)) continue

    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === contextParameter.text
      ) {
        uses.push({
          className: declaration.name!.text,
          method,
          property: node.name.text,
          location: locationOf(node, sourceFile),
        })
      }
      node.forEachChild(visit)
    }
    visit(member.body)
  }
  return uses
}

function sourceLayer(
  element: ts.Expression,
  index: number,
  sourceFile: ts.SourceFile,
  layerDefinitions: ReadonlyMap<string, Omit<LayerIR, 'index'>>,
  checker: Checker,
): LayerIR {
  const name = element.getText(sourceFile)
  const declared = layerDefinitions.get(name)
  if (declared) return { index, ...declared }
  const inferred = readLayerTypeDefinition(name, element, checker)
  if (inferred) return { index, ...inferred }
  const role = name.startsWith('validate.')
    ? 'validation'
    : /\.(controller|resolver|handler)$/.test(name)
      ? 'terminal'
      : 'generic'
  return {
    index,
    name,
    role,
    requires: [],
    provides: [],
    requiresValidated: [],
  }
}

function readLayerTypeDefinition(
  name: string,
  expression: ts.Expression,
  checker: Checker,
): Omit<LayerIR, 'index'> | undefined {
  const type = checker.getTypeAtLocation(expression)
  if (!type) return undefined
  if (readStringLiteralType(type, 'kind', expression, checker) !== 'layer') {
    return undefined
  }
  const role = readStringLiteralType(type, 'role', expression, checker)
  const declaredName = readStringLiteralType(type, 'name', expression, checker)
  return {
    name: declaredName ?? name,
    role: isLayerRole(role) ? role : 'generic',
    requires: readContextKeyNames(type, 'requires', expression, checker),
    provides: readContextKeyNames(type, 'provides', expression, checker),
    requiresValidated: readStringTuple(
      type,
      'requiresValidated',
      expression,
      checker,
    ),
    ...readTypedShortCircuits(type, expression, checker),
  }
}

function readStringTuple(
  type: Type,
  property: string,
  expression: ts.Expression,
  checker: Checker,
): string[] {
  const propertyType = readTypeProperty(type, property, expression, checker)
  if (!propertyType) return []
  return readTupleElementTypes(propertyType, checker).flatMap((element) =>
    element.isStringLiteralType() ? [element.value] : [],
  )
}

function readContextKeyNames(
  type: Type,
  property: 'requires' | 'provides',
  expression: ts.Expression,
  checker: Checker,
): string[] {
  const propertyType = readTypeProperty(type, property, expression, checker)
  if (!propertyType) return []
  return readTupleElementTypes(propertyType, checker).flatMap((element) => {
    const name = readStringLiteralType(element, 'name', expression, checker)
    return name === undefined ? [] : [name]
  })
}

function readTypedShortCircuits(
  type: Type,
  expression: ts.Expression,
  checker: Checker,
): Pick<LayerIR, 'shortCircuits'> | {} {
  const declarations = readTypeProperty(
    type,
    'shortCircuits',
    expression,
    checker,
  )
  if (!declarations) return {}
  const shortCircuits = readTupleElementTypes(declarations, checker).flatMap(
    (declaration) => {
      const protocol = readStringLiteralType(
        declaration,
        'protocol',
        expression,
        checker,
      )
      const variant = readStringLiteralType(
        declaration,
        'variant',
        expression,
        checker,
      )
      if (protocol === undefined || variant === undefined) return []
      const response = readTypeProperty(
        declaration,
        'response',
        expression,
        checker,
      )
      const status = response
        ? readNumberLiteralType(response, 'status', expression, checker)
        : undefined
      return [
        {
          protocol,
          variant,
          ...(status === undefined ? {} : { response: { status } }),
        },
      ]
    },
  )
  return shortCircuits.length === 0 ? {} : { shortCircuits }
}

function readTupleElementTypes(
  type: Type,
  checker: Checker,
): readonly Type[] {
  const value = checker.getNonNullableType(type) ?? type
  if (value.isTupleType()) {
    return checker.getTypeArguments(value as TypeReference)
  }
  if (value.isTypeReference() && value.getTarget().isTupleType()) {
    return checker.getTypeArguments(value)
  }
  return []
}

function readStringLiteralType(
  type: Type,
  property: string,
  expression: ts.Expression,
  checker: Checker,
): string | undefined {
  const value = readTypeProperty(type, property, expression, checker)
  return value?.isStringLiteralType()
    ? (value as StringLiteralType).value
    : undefined
}

function readNumberLiteralType(
  type: Type,
  property: string,
  expression: ts.Expression,
  checker: Checker,
): number | undefined {
  const value = readTypeProperty(type, property, expression, checker)
  return value?.isNumberLiteralType()
    ? (value as NumberLiteralType).value
    : undefined
}

function readTypeProperty(
  type: Type,
  property: string,
  expression: ts.Expression,
  checker: Checker,
): Type | undefined {
  const value = checker.getNonNullableType(type) ?? type
  const symbol = checker.getPropertyOfType(value, property)
  return symbol
    ? checker.getNonNullableType(
        checker.getTypeOfSymbolAtLocation(symbol, expression),
      )
    : undefined
}

function isLayerRole(value: string | undefined): value is LayerIR['role'] {
  return (
    value === 'generic' ||
    value === 'authentication' ||
    value === 'guard' ||
    value === 'validation' ||
    value === 'framework' ||
    value === 'terminal'
  )
}

function readSourceResponses(
  expression: ts.Expression | undefined,
): { readonly name: string; readonly status?: number }[] {
  if (!expression || !ts.isObjectLiteralExpression(expression)) return []
  return expression.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return []
    const name = propertyName(property.name)
    if (!name || !ts.isObjectLiteralExpression(property.initializer)) return []
    const status = readObjectProperty(property.initializer, 'status')
    return [
      {
        name,
        ...(status && ts.isNumericLiteral(status)
          ? { status: Number(status.text) }
          : {}),
      },
    ]
  })
}

function validateSourceShortCircuitResponses(
  contract: string,
  procedure: string,
  protocol: string,
  pipeline: readonly LayerIR[],
  responses: readonly { readonly name: string; readonly status?: number }[],
  diagnostics: Diagnostic[],
): void {
  const path = `${contract}.${procedure}.${protocol}`
  for (const layer of pipeline) {
    for (const shortCircuit of layer.shortCircuits ?? []) {
      if (shortCircuit.protocol !== 'http') continue
      const response = responses.find(({ name }) => name === shortCircuit.variant)
      if (!response) {
        diagnostics.push({
          code: 'LUTRE_SHORT_CIRCUIT_001',
          message: `${layer.name}のshort circuit variant ${shortCircuit.variant}がresponseに宣言されていません`,
          path,
        })
        continue
      }
      const expectedStatus = shortCircuit.response?.status
      if (
        typeof expectedStatus === 'number' &&
        response.status !== expectedStatus
      ) {
        diagnostics.push({
          code: 'LUTRE_SHORT_CIRCUIT_002',
          message: `${layer.name}のshort circuit variant ${shortCircuit.variant}はHTTP ${expectedStatus}である必要があります`,
          path,
        })
      }
    }
  }
}

function readInboundReturnedProperties(
  definition: ts.ObjectLiteralExpression,
): string[] | undefined {
  const inbound = definition.properties.find(
    (property) =>
      (ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property)) &&
      propertyName(property.name) === 'inbound',
  )
  if (!inbound) return undefined
  const implementation = ts.isPropertyAssignment(inbound)
    ? unwrapExpression(inbound.initializer)
    : inbound
  const returned = getReturnedObject(implementation)
  if (!returned) return undefined
  return returned.properties.flatMap((property) => {
    if (
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property) ||
      ts.isMethodDeclaration(property)
    ) {
      const name = propertyName(property.name)
      return name ? [name] : []
    }
    return []
  })
}

function validateSourceDuplicateProviders(
  modules: readonly SourceModuleDeclaration[],
  diagnostics: Diagnostic[],
): void {
  const modulesBySymbol = new Map(modules.map((module) => [module.symbol, module]))
  const reportedPairs = new Set<string>()

  for (const root of modules) {
    const visited = new Set<number>()
    const providersByToken = new Map<number, SourceProviderDeclaration>()
    const visit = (module: SourceModuleDeclaration): void => {
      if (visited.has(module.symbol)) return
      visited.add(module.symbol)
      for (const importedSymbol of module.imports) {
        const imported = modulesBySymbol.get(importedSymbol)
        if (imported) visit(imported)
      }
      for (const provider of module.providers) {
        const existing = providersByToken.get(provider.tokenSymbol)
        if (!existing) {
          providersByToken.set(provider.tokenSymbol, provider)
          continue
        }
        const pair = [existing.id, provider.id].sort().join('\0')
        if (reportedPairs.has(pair)) continue
        reportedPairs.add(pair)
        diagnostics.push({
          code: 'LUTRE_DI_003',
          message: `Provider ${provider.reference}が${existing.module}と${provider.module}で重複しています`,
          path: `${provider.location.file}:${provider.location.line}:${provider.location.column}`,
        })
      }
    }
    visit(root)
  }
}

function validateSourceTerminal(
  contract: string,
  procedure: string,
  protocol: string,
  pipeline: readonly LayerIR[],
  diagnostics: Diagnostic[],
) {
  const terminals = pipeline.filter((layer) => layer.role === 'terminal')
  const path = `${contract}.${procedure}.${protocol}`
  if (terminals.length !== 1) {
    diagnostics.push({
      code: 'LUTRE_PIPELINE_001',
      message: `${path}のPipelineにはterminalがちょうど1つ必要です`,
      path,
    })
  } else if (terminals[0]!.index !== pipeline.length - 1) {
    diagnostics.push({
      code: 'LUTRE_PIPELINE_002',
      message: `${terminals[0]!.name}はPipelineの最後でなければなりません`,
      path,
    })
  }
}

function validateSourceLayerOrder(
  contract: string,
  procedure: string,
  protocol: string,
  pipeline: readonly LayerIR[],
  diagnostics: Diagnostic[],
): void {
  const path = `${contract}.${procedure}.${protocol}`
  const provided = new Set<string>()
  const validated = new Set<string>()
  for (const layer of pipeline) {
    if (layer.role === 'validation' && layer.name.startsWith('validate.')) {
      validated.add(layer.name.slice('validate.'.length))
    }
    for (const requirement of layer.requiresValidated) {
      if (!validated.has(requirement)) {
        diagnostics.push({
          code: 'LUTRE_VALIDATION_001',
          message: `${layer.name}にはvalidation済みの${requirement}が必要です`,
          path,
        })
      }
    }
    for (const requirement of layer.requires) {
      const providedLater = pipeline
        .slice(layer.index + 1)
        .some((candidate) => candidate.provides.includes(requirement))
      if (!provided.has(requirement) && providedLater) {
        diagnostics.push({
          code: 'LUTRE_PIPELINE_004',
          message: `${layer.name}が必要とする${requirement}は後段でprovideされています`,
          path,
        })
      }
    }
    for (const token of layer.provides) provided.add(token)
  }
}

function getReturnedObject(node: ts.Node): ts.ObjectLiteralExpression | undefined {
  if (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node)
  ) {
    if (!node.body) return undefined
    if (ts.isExpression(node.body)) {
      const body = unwrapExpression(node.body)
      if (ts.isObjectLiteralExpression(body)) return body
    }
    if (ts.isBlock(node.body)) {
      const returned = node.body.statements.find(ts.isReturnStatement)?.expression
      return returned && ts.isObjectLiteralExpression(returned) ? returned : undefined
    }
  }
  return undefined
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function readArrayProperty(
  object: ts.ObjectLiteralExpression | undefined,
  name: string,
  sourceFile: ts.SourceFile,
): string[] {
  if (!object) return []
  const value = readObjectProperty(object, name)
  return value && ts.isArrayLiteralExpression(value)
    ? value.elements.map((element) => element.getText(sourceFile))
    : []
}

function readObjectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === name) {
      return property.initializer
    }
  }
  return undefined
}

function readObjectKeys(expression: ts.Expression | undefined): string[] {
  if (!expression || !ts.isObjectLiteralExpression(expression)) return []
  return expression.properties.flatMap((property) => {
    if (
      ts.isPropertyAssignment(property) ||
      ts.isMethodDeclaration(property) ||
      ts.isShorthandPropertyAssignment(property)
    ) {
      const name = propertyName(property.name)
      return name ? [name] : []
    }
    return []
  })
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined
}

function isNamedCall(node: ts.Node, name: string): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ((ts.isIdentifier(node.expression) && node.expression.text === name) ||
      (ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === name))
  )
}

function isFactoryInvocation(
  node: ts.Node,
  name: string,
): node is ts.CallExpression {
  return (
    isNamedCall(node, name) ||
    (ts.isCallExpression(node) &&
      ts.isCallExpression(node.expression) &&
      isNamedCall(node.expression, name))
  )
}

function locationOf(node: ts.Node, sourceFile: ts.SourceFile): SourceLocationIR {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return {
    file: sourceFile.fileName,
    line: position.line + 1,
    column: position.character + 1,
  }
}
