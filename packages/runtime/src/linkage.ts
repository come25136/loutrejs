import type { Class, TokenLike } from '@loutrejs/core'

export interface RuntimeLinkageHeader {
  readonly version: 1
  readonly fingerprint: string
}

export interface RuntimeLinkageArtifact extends RuntimeLinkageHeader {
  readonly bindings: readonly (
    readonly [target: Class, dependencies: readonly TokenLike[]]
  )[]
}

export interface CompiledApplicationArtifacts {
  readonly graph: RuntimeLinkageHeader
  readonly linkage: RuntimeLinkageArtifact
}

export const runtimeLinkageTarget: unique symbol = Symbol(
  'loutre.runtime-linkage-target',
)

export interface RuntimeLinkableApplication {
  readonly [runtimeLinkageTarget]: (artifact: RuntimeLinkageArtifact) => void
}

export function linkApplication<TApplication extends RuntimeLinkableApplication>(
  application: TApplication,
  artifacts: CompiledApplicationArtifacts,
): TApplication {
  if (artifacts.graph.version !== artifacts.linkage.version) {
    throw new Error(
      `Graph Manifest version ${artifacts.graph.version}とRuntime Linkage Artifact version ${artifacts.linkage.version}が一致しません`,
    )
  }
  if (artifacts.graph.fingerprint !== artifacts.linkage.fingerprint) {
    throw new Error(
      'Graph ManifestとRuntime Linkage Artifactのfingerprintが一致しません',
    )
  }
  application[runtimeLinkageTarget](artifacts.linkage)
  return application
}
