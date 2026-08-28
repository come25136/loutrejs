import type { EnvClass } from './env.js'
import type { ImplementationDescriptor } from './implementation.js'
import type { ModuleLifecycle } from './lifecycle.js'
import { environmentProvider, type ProviderDeclaration } from './provider.js'

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

export const moduleTypeInfo: unique symbol = Symbol('loutre.module-type-info')

export interface ModuleTypeInfo<
  TDefinition extends ModuleDefinition = ModuleDefinition,
> {
  readonly protocols: ProtocolsOfModuleDefinition<TDefinition>
  readonly capabilities: CapabilitiesOfModuleDefinition<TDefinition>
}

type DirectProtocols<TDefinition extends ModuleDefinition> =
  TDefinition['implementations'] extends readonly ImplementationDescriptor[]
    ? TDefinition['implementations'][number]['protocol']
    : never

type ImportedProtocols<TDefinition extends ModuleDefinition> =
  TDefinition['imports'] extends readonly ModuleInstance[]
    ? ModuleProtocols<TDefinition['imports'][number]>
    : never

export type ProtocolsOfModuleDefinition<TDefinition extends ModuleDefinition> =
  | DirectProtocols<TDefinition>
  | ImportedProtocols<TDefinition>

type DirectCapabilities<TDefinition extends ModuleDefinition> =
  TDefinition['implementations'] extends readonly ImplementationDescriptor[]
    ? TDefinition['implementations'][number]['capabilities'][number]
    : never

type ImportedCapabilities<TDefinition extends ModuleDefinition> =
  TDefinition['imports'] extends readonly ModuleInstance[]
    ? ModuleCapabilities<TDefinition['imports'][number]>
    : never

export type CapabilitiesOfModuleDefinition<
  TDefinition extends ModuleDefinition,
> = DirectCapabilities<TDefinition> | ImportedCapabilities<TDefinition>

export type ModuleProtocols<TModule> =
  TModule extends ModuleInstance<infer TDefinition>
    ? ProtocolsOfModuleDefinition<TDefinition>
    : never

export type ModuleCapabilities<TModule> =
  TModule extends ModuleInstance<infer TDefinition>
    ? CapabilitiesOfModuleDefinition<TDefinition>
    : never

export interface ModuleInstance<
  TDefinition extends ModuleDefinition = ModuleDefinition,
> {
  readonly kind: 'module-instance'
  readonly template: AnyModuleTemplate
  readonly args: unknown
  readonly definition: TDefinition
  readonly [moduleTypeInfo]?: ModuleTypeInfo<TDefinition>
}

export interface AnyModuleTemplate {
  (args?: any): ModuleInstance<any>
  readonly kind: 'module-template'
  readonly instantiate: (args: any) => ModuleInstance<any>
  readonly [moduleTypeInfo]?: ModuleTypeInfo<any>
}

export type ModuleTemplate<
  Args,
  TDefinition extends ModuleDefinition = ModuleDefinition,
> = ([Args] extends [void]
  ? { (): ModuleInstance<TDefinition> }
  : { (args: Args): ModuleInstance<TDefinition> }) & {
  readonly kind: 'module-template'
  readonly instantiate: (args: Args) => ModuleInstance<TDefinition>
  readonly [moduleTypeInfo]?: ModuleTypeInfo<TDefinition>
}

export function defineModule<
  Args = void,
  const TDefinition extends ModuleDefinition = ModuleDefinition,
>(factory: (args: Args) => TDefinition): ModuleTemplate<Args, TDefinition> {
  const instantiate = (args: Args): ModuleInstance<TDefinition> => {
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
      } as TDefinition,
    }
  }

  const template = ((args: Args) => instantiate(args)) as ModuleTemplate<
    Args,
    TDefinition
  >
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
