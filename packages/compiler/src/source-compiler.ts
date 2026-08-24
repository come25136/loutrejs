import { API, type Program } from 'typescript/unstable/sync'
import * as ts from 'typescript/unstable/ast'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import type { Diagnostic, LayerIR } from './ir.js'

export interface SourceLocationIR {
  readonly file: string
  readonly line: number
  readonly column: number
}

export interface SourceModuleIR {
  readonly name: string
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
  readonly explicitInject: boolean
}

export interface SourceConstructorIR {
  readonly className: string
  readonly location: SourceLocationIR
  readonly dependencies: readonly ConstructorDependencyIR[]
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
}

export interface SourceCompilerOptions {
  readonly tsconfigPath: string
  readonly entry?: string
  readonly includeDeclarationFiles?: boolean
}

export function compileTypeScriptSource(
  options: SourceCompilerOptions,
): SourceApplicationManifest {
  const api = new API()
  const snapshot = api.updateSnapshot({
    openProjects: [options.tsconfigPath],
  })
  const project = snapshot
    .getProjects()
    .find(({ configFileName }) => resolve(configFileName) === resolve(options.tsconfigPath))
  if (!project) {
    snapshot.dispose()
    api.close()
    throw new Error(`TypeScript projectを開けませんでした: ${options.tsconfigPath}`)
  }
  const program = project.program
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
  const diagnostics: Diagnostic[] = []
  const envKeys: { env: string; key: string }[] = []
  const layerDefinitions = new Map<string, Omit<LayerIR, 'index'>>()

  for (const sourceFile of sourceFiles) {
    visitSourceFile(sourceFile, {
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
    })
  }

  const implementations = modules.flatMap((module) =>
    module.implementations.flatMap(parseImplementation),
  )
  validateSourceTokenIds(tokens, diagnostics)
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
  snapshot.dispose()
  api.close()
  return manifest
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
}

function visitSourceFile(sourceFile: ts.SourceFile, state: VisitState): void {
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isFactoryInvocation(node.initializer, 'layer')) {
        state.layerDefinitions.set(
          node.name.text,
          readLayerDefinition(node.name.text, node.initializer, sourceFile),
        )
      }
      if (isFactoryInvocation(node.initializer, 'basicAuth')) {
        state.layerDefinitions.set(
          node.name.text,
          readBasicAuthDefinition(node.name.text, node.initializer, sourceFile),
        )
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
      }
      if (isNamedCall(node.initializer, 'contract')) {
        state.contracts.push(
          readContract(
            node.name.text,
            node.initializer,
            sourceFile,
            state.diagnostics,
            state.layerDefinitions,
          ),
        )
      }
    }
    if (ts.isClassDeclaration(node) && node.name) {
      const constructor = readConstructor(node, sourceFile)
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
  return {
    name,
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

function readContract(
  name: string,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  diagnostics: Diagnostic[],
  layerDefinitions: ReadonlyMap<string, Omit<LayerIR, 'index'>>,
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
                  sourceLayer(element, index, sourceFile, layerDefinitions),
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
          validateSourceBasicAuthResponses(
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
    const explicitReference = inject?.arguments[0]?.getText(sourceFile)
    const typeReference = parameter.type?.getText(sourceFile)
    const reference = explicitReference ?? typeReference
    if (!reference) continue
    dependencies.push({
      index,
      parameter: parameter.name.getText(sourceFile),
      reference,
      explicitInject: explicitReference !== undefined,
    })
  }
  return {
    className: declaration.name!.text,
    location: locationOf(declaration, sourceFile),
    dependencies,
  }
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
): LayerIR {
  const name = element.getText(sourceFile)
  const declared = layerDefinitions.get(name)
  if (declared) return { index, ...declared }
  if (isFactoryInvocation(element, 'basicAuth')) {
    return {
      index,
      ...readBasicAuthDefinition(name, element, sourceFile),
    }
  }
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

function readBasicAuthDefinition(
  name: string,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
): Omit<LayerIR, 'index'> {
  const definition = call.arguments[0]
  if (!definition || !ts.isObjectLiteralExpression(definition)) {
    return {
      name,
      role: 'authentication',
      requires: [],
      provides: [],
      requiresValidated: [],
    }
  }
  const declaredName = readObjectProperty(definition, 'name')
  const principal = readObjectProperty(definition, 'principal')
  const unauthorized = readObjectProperty(definition, 'unauthorized')
  const variant =
    unauthorized && ts.isObjectLiteralExpression(unauthorized)
      ? readObjectProperty(unauthorized, 'variant')
      : undefined
  const variantName =
    variant && ts.isStringLiteral(variant) ? variant.text : undefined
  return {
    name:
      declaredName && ts.isStringLiteral(declaredName)
        ? declaredName.text
        : name,
    role: 'authentication',
    requires: [],
    provides: principal ? [principal.getText(sourceFile)] : [],
    requiresValidated: [],
    ...(variantName === undefined
      ? {}
      : {
          shortCircuits: [{ protocol: 'http', variant: variantName }],
        }),
  }
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

function validateSourceBasicAuthResponses(
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
          code: 'LUTRE_AUTH_001',
          message: `${layer.name}のunauthorized variant ${shortCircuit.variant}がresponseに宣言されていません`,
          path,
        })
      } else if (response.status !== 401) {
        diagnostics.push({
          code: 'LUTRE_AUTH_002',
          message: `${layer.name}のunauthorized variant ${shortCircuit.variant}はHTTP 401である必要があります`,
          path,
        })
      }
    }
  }
}

function readLayerDefinition(
  name: string,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
): Omit<LayerIR, 'index'> {
  const definition = call.arguments[0]
  if (!definition || !ts.isObjectLiteralExpression(definition)) {
    return {
      name,
      role: 'generic',
      requires: [],
      provides: [],
      requiresValidated: [],
    }
  }
  const declaredName = readObjectProperty(definition, 'name')
  const role = readObjectProperty(definition, 'role')
  const returnedProperties = readInboundReturnedProperties(definition)
  return {
    name:
      declaredName && ts.isStringLiteral(declaredName)
        ? declaredName.text
        : name,
    role:
      role && ts.isStringLiteral(role)
        ? (role.text as LayerIR['role'])
        : 'generic',
    requires: readArrayProperty(definition, 'requires', sourceFile),
    provides: readArrayProperty(definition, 'provides', sourceFile),
    ...(returnedProperties === undefined
      ? {}
      : { returns: returnedProperties }),
    requiresValidated: readArrayProperty(
      definition,
      'requiresValidated',
      sourceFile,
    ).map((value) => value.replace(/^['"]|['"]$/g, '')),
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

function parseImplementation(source: string): SourceImplementationIR[] {
  const match = /implement\(([^)]+)\)\s*\.for\(([^)]+)\)(?:\s*\.procedures\(([^)]*)\))?\s*\.with\(([^)]+)\)/s.exec(
    source,
  )
  if (!match?.[1] || !match[2] || !match[4]) return []
  const procedures = match[3]
    ?.split(',')
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  return [
    {
      contract: match[1].trim(),
      protocol: match[2].trim(),
      ...(procedures === undefined ? {} : { procedures }),
      implementation: match[4].trim(),
    },
  ]
}

function validateSourceCoverage(
  contracts: readonly SourceContractIR[],
  implementations: readonly SourceImplementationIR[],
  diagnostics: Diagnostic[],
): void {
  for (const contract of contracts) {
    for (const procedure of contract.procedures) {
      for (const protocol of procedure.protocols) {
        const covering = implementations.filter(
          (implementation) =>
            implementation.contract === contract.name &&
            implementation.protocol === protocol.name &&
            (implementation.procedures === undefined ||
              implementation.procedures.includes(procedure.name)),
        )
        const path = `${contract.name}.${procedure.name}.${protocol.name}`
        if (covering.length === 0) {
          diagnostics.push({
            code: 'LUTRE_IMPL_001',
            message: `${path}のimplementationがありません`,
            path,
          })
        } else if (covering.length > 1) {
          diagnostics.push({
            code: 'LUTRE_IMPL_002',
            message: `${path}のimplementationが重複しています`,
            path,
          })
        }
      }
    }
  }
}

function validateSourceConstructorDependencies(
  implementations: readonly SourceImplementationIR[],
  constructors: readonly SourceConstructorIR[],
  providers: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  for (const implementation of implementations) {
    const constructor = constructors.find(
      ({ className }) => className === implementation.implementation,
    )
    if (!constructor) continue
    for (const dependency of constructor.dependencies) {
      const available = [...providers].some(
        (provider) =>
          provider === dependency.reference ||
          provider.startsWith(`provide(${dependency.reference})`),
      )
      if (!available) {
        const path = `${implementation.contract}.${implementation.protocol}.${implementation.implementation}`
        diagnostics.push({
          code: dependency.explicitInject ? 'LUTRE_DI_001' : 'LUTRE_DI_002',
          message: dependency.explicitInject
            ? `${implementation.implementation}のconstructor依存${dependency.reference}をapplication scopeで提供するProviderがありません。execution dataはContextOfから取得してください`
            : `${implementation.implementation}のconstructor依存${dependency.reference}を提供するProviderがありません`,
          path,
        })
      }
    }
  }
}

function validateSourceContextProperties(
  implementations: readonly SourceImplementationIR[],
  contextProperties: readonly ContextPropertyUseIR[],
  contextKeys: readonly SourceContextKeyIR[],
  pipelines: SourceApplicationManifest['pipelines'],
  diagnostics: Diagnostic[],
): void {
  const keyByDeclaration = new Map(
    contextKeys.map((key) => [key.name, key.property]),
  )
  const declaredProperties = new Set(contextKeys.map((key) => key.property))
  for (const implementation of implementations) {
    const uses = contextProperties.filter(
      ({ className, property }) =>
        className === implementation.implementation &&
        declaredProperties.has(property),
    )
    for (const use of uses) {
      if (
        implementation.procedures !== undefined &&
        !implementation.procedures.includes(use.method)
      ) {
        continue
      }
      const pipeline = pipelines.find(
        (candidate) =>
          candidate.contract === implementation.contract &&
          candidate.procedure === use.method &&
          candidate.protocol === implementation.protocol,
      )
      if (!pipeline) continue
      const available = new Set(
        pipeline.layers.flatMap((layer) =>
          layer.provides.map(
            (reference) => keyByDeclaration.get(reference) ?? reference,
          ),
        ),
      )
      if (!available.has(use.property)) {
        const path = `${implementation.contract}.${use.method}.${implementation.protocol}`
        diagnostics.push({
          code: 'LUTRE_CONTEXT_001',
          message: `${implementation.implementation}.${use.method}が参照するctx.${use.property}はterminal到達時に利用できません`,
          path,
        })
      }
    }
  }
}

function validateSourceContextKeyNames(
  keys: readonly SourceContextKeyIR[],
  diagnostics: Diagnostic[],
): void {
  const firstByProperty = new Map<string, SourceContextKeyIR>()
  for (const key of keys) {
    const first = firstByProperty.get(key.property)
    if (!first) {
      firstByProperty.set(key.property, key)
      continue
    }
    diagnostics.push({
      code: 'LUTRE_CONTEXT_002',
      message: `Context Key ${key.property}は${first.name}と${key.name}で重複しています`,
      path: key.name,
    })
  }
}

function validateSourceLayerReturns(
  pipelines: SourceApplicationManifest['pipelines'],
  diagnostics: Diagnostic[],
): void {
  for (const pipeline of pipelines) {
    const path = `${pipeline.contract}.${pipeline.procedure}.${pipeline.protocol}`
    for (const layer of pipeline.layers) {
      if (layer.provides.length === 0 || layer.returns === undefined) continue
      const provided = new Set(layer.provides)
      const returned = new Set(layer.returns)
      const missing = layer.provides.filter((property) => !returned.has(property))
      const extra = layer.returns.filter((property) => !provided.has(property))
      if (missing.length === 0 && extra.length === 0) continue
      diagnostics.push({
        code: 'LUTRE_CONTEXT_004',
        message: `${layer.name}のprovidesとinbound返却propertyが一致しません（不足: ${missing.join(', ') || 'なし'}、未宣言: ${extra.join(', ') || 'なし'}）`,
        path,
      })
    }
  }
}

function validateSourceTokenIds(
  tokens: readonly SourceTokenIR[],
  diagnostics: Diagnostic[],
): void {
  const firstById = new Map<string, SourceTokenIR>()
  for (const token of tokens) {
    const first = firstById.get(token.id)
    if (!first) {
      firstById.set(token.id, token)
      continue
    }
    diagnostics.push({
      code: 'LUTRE_TOKEN_001',
      message: `Token ID ${token.id}は${first.name}と${token.name}で重複しています`,
      path: token.name,
    })
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
