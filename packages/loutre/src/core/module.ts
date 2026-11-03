import type { Descriptor } from '../internal/brand.js'
import type { EnvClass } from './env.js'
import type {
  ExecutionDeclaration,
  ExtensionOfDefinition,
  HostApiOfExtension,
} from './extension.js'
import type { ModuleLifecycle } from './lifecycle.js'
import { environmentProvider, type ProviderDeclaration } from './provider.js'

export interface ModuleDefinition {
  readonly name?: string
  readonly description?: string
  readonly imports?: readonly ModuleInput[]
  readonly environment?: readonly EnvClass[]
  readonly providers?: readonly ProviderDeclaration[]
  readonly executions?: readonly ExecutionDeclaration[]
  readonly exports?: readonly unknown[]
  readonly lifecycle?: ModuleLifecycle
}

export const moduleTypeInfo: unique symbol = Symbol('loutre.module-type-info')

export interface ModuleTypeInfo<
  TDefinition extends ModuleDefinition = ModuleDefinition,
> {
  readonly extensions: ExtensionsOfModuleDefinition<TDefinition>
}

type DirectExtensions<TDefinition extends ModuleDefinition> =
  TDefinition['executions'] extends readonly ExecutionDeclaration[]
    ? ExtensionOfDefinition<TDefinition['executions'][number]>
    : never

type ImportedExtensions<TDefinition extends ModuleDefinition> =
  TDefinition['imports'] extends readonly ModuleInput[]
    ? ModuleExtensions<TDefinition['imports'][number]>
    : never

export type ExtensionsOfModuleDefinition<
  TDefinition extends ModuleDefinition,
> = DirectExtensions<TDefinition> | ImportedExtensions<TDefinition>

export type ModuleExtensions<TModule> =
  TModule extends ModuleInstance<infer TDefinition>
    ? ExtensionsOfModuleDefinition<TDefinition>
    : TModule extends ModuleTemplate<void, infer TDefinition>
      ? ExtensionsOfModuleDefinition<TDefinition>
      : never

export type ModuleHostApis<TModule> = HostApiOfExtension<
  ModuleExtensions<TModule>
>

export interface ModuleInstance<
  TDefinition extends ModuleDefinition = ModuleDefinition,
> extends Descriptor<'module-instance'> {
  readonly kind: 'module-instance'
  readonly template: AnyModuleTemplate
  readonly args: unknown
  readonly definition: TDefinition
  readonly [moduleTypeInfo]?: ModuleTypeInfo<TDefinition>
}

export interface AnyModuleTemplate extends Descriptor<'module-template'> {
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
  readonly '~loutre.descriptor': 'module-template'
  readonly instantiate: (args: Args) => ModuleInstance<TDefinition>
  readonly [moduleTypeInfo]?: ModuleTypeInfo<TDefinition>
}

export type ModuleInput = ModuleInstance | ModuleTemplate<void>

export function defineModule<const TDefinition extends ModuleDefinition>(
  definition: TDefinition,
): ModuleInstance<TDefinition>

export function defineModule<
  Args = void,
  const TDefinition extends ModuleDefinition = ModuleDefinition,
>(factory: (args: Args) => TDefinition): ModuleTemplate<Args, TDefinition>

export function defineModule(
  definition: ModuleDefinition | ((args: any) => ModuleDefinition),
): ModuleInstance | AnyModuleTemplate {
  const factory =
    typeof definition === 'function' ? definition : () => definition
  const template = createModuleTemplate(factory)
  return typeof definition === 'function' ? template : template()
}

function createModuleTemplate<Args, TDefinition extends ModuleDefinition>(
  factory: (args: Args) => TDefinition,
): ModuleTemplate<Args, TDefinition> {
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
    } as ModuleInstance<TDefinition>
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

export function asModuleInstance(module: ModuleInput): ModuleInstance {
  return module.kind === 'module-instance' ? module : module()
}
