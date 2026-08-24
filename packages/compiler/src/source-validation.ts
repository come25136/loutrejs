import type { Diagnostic } from './ir.js'
import type {
  ContextPropertyUseIR,
  SourceApplicationManifest,
  SourceConstructorIR,
  SourceContextKeyIR,
  SourceContractIR,
  SourceImplementationIR,
  SourceTokenIR,
} from './source-compiler.js'

export function validateSourceCoverage(
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

export function validateSourceConstructorDependencies(
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

export function validateSourceContextProperties(
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

export function validateSourceContextKeyNames(
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

export function validateSourceLayerReturns(
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

export function validateSourceTokenIds(
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
