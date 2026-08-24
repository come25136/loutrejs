import type { ImplementationBinding } from './implementation.js'
import type { ProviderDeclaration } from './provider.js'
import type { ModuleLifecycle } from './lifecycle.js'

export interface ModuleDefinition {
  readonly description?: string
  readonly imports?: readonly ModuleInstance[]
  readonly providers?: readonly ProviderDeclaration[]
  readonly implementations?: readonly ImplementationBinding[]
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
  const instantiate = (args: Args): ModuleInstance => ({
    kind: 'module-instance',
    template: template as AnyModuleTemplate,
    args,
    definition: factory(args),
  })

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
