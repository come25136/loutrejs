import type { EnvClass } from './env.js'
import type { ImplementationDescriptor } from './implementation.js'
import type { ModuleLifecycle } from './lifecycle.js'
import {
  environmentProvider,
  type ProviderDeclaration,
} from './provider.js'

export interface ModuleDefinition {
  readonly name?: string
  readonly description?: string
  readonly imports?: readonly ModuleInstance[]
  readonly environment?: readonly EnvClass[]
  readonly providers?: readonly ProviderDeclaration[]
  readonly implementations?: readonly ImplementationDescriptor[]
  readonly exports?: readonly unknown[]
  readonly lifecycle?: ModuleLifecycle
  readonly requires?: readonly string[]
}

export interface ModuleInstance {
  readonly kind: 'module-instance'
  readonly template: AnyModuleTemplate
  readonly args: unknown
  readonly definition: ModuleDefinition
}

export interface AnyModuleTemplate {
  (args?: any): ModuleInstance
  readonly kind: 'module-template'
  readonly instantiate: (args: any) => ModuleInstance
}

export type ModuleTemplate<Args> = ([Args] extends [void]
  ? { (): ModuleInstance }
  : { (args: Args): ModuleInstance }) & {
  readonly kind: 'module-template'
  readonly instantiate: (args: Args) => ModuleInstance
}

export function defineModule<Args = void>(
  factory: (args: Args) => ModuleDefinition,
): ModuleTemplate<Args> {
  const instantiate = (args: Args): ModuleInstance => {
    const declared = factory(args)
    const environment = [...new Set(declared.environment ?? [])]
    const providers = [
      ...environment.map(environmentProvider),
      ...(declared.providers ?? []),
    ]

    return {
      kind: 'module-instance',
      template: template as AnyModuleTemplate,
      args,
      definition: {
        ...declared,
        ...(environment.length === 0 ? {} : { environment }),
        ...(providers.length === 0 ? {} : { providers }),
      },
    }
  }

  const template = ((args: Args) => instantiate(args)) as ModuleTemplate<Args>
  Object.defineProperties(template, {
    kind: { value: 'module-template', enumerable: true },
    instantiate: { value: instantiate, enumerable: false },
  })

  return template
}

export function asModuleInstance(
  module: ModuleInstance | ModuleTemplate<void>,
): ModuleInstance {
  return module.kind === 'module-instance' ? module : module()
}
