/// <reference lib="esnext.disposable" preserve="true" />

import type {
  ArgsClass,
  ApplicationModel,
  HostApiOfExtension,
  ModuleExtensions,
  ModuleInstance,
  SchemaInput,
} from '../core/index.js'
import { buildApplicationModel } from '../core/index.js'
import type { Logger } from '../runtime/index.js'

export interface ApplicationDefinitionOptions<
  TModules extends readonly ModuleInstance[],
  TArguments extends ArgsClass | undefined,
> {
  readonly modules: TModules
  readonly arguments?: TArguments
  readonly logger?: Logger
}

export interface ApplicationDefinition<
  TModules extends readonly ModuleInstance[] = readonly ModuleInstance[],
  TArguments extends ArgsClass | undefined = ArgsClass | undefined,
> {
  readonly kind: 'application-definition'
  readonly model: ApplicationModel
  readonly modules: TModules
  readonly arguments: TArguments
  readonly logger?: Logger
}

export function defineApplication<
  const TModules extends readonly ModuleInstance[],
  const TArguments extends ArgsClass | undefined = undefined,
>(
  options: ApplicationDefinitionOptions<TModules, TArguments>,
): ApplicationDefinition<TModules, TArguments> {
  return Object.freeze({
    kind: 'application-definition',
    model: buildApplicationModel({
      modules: options.modules,
      ...(options.arguments === undefined
        ? {}
        : { arguments: options.arguments }),
    }),
    modules: options.modules,
    arguments: options.arguments as TArguments,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  })
}

export type ApplicationArgumentsInput<
  TDefinition extends ApplicationDefinition,
> =
  TDefinition['arguments'] extends ArgsClass<infer TSchema>
    ? SchemaInput<TSchema>
    : never

export type BootstrapArguments<TDefinition extends ApplicationDefinition> =
  TDefinition['arguments'] extends ArgsClass<infer TSchema>
    ? {} extends SchemaInput<TSchema>
      ? { readonly arguments?: SchemaInput<TSchema> }
      : { readonly arguments: SchemaInput<TSchema> }
    : { readonly arguments?: never }

type UnionToIntersection<TUnion> = (
  TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never

export type ApplicationExtensions<TDefinition extends ApplicationDefinition> =
  ModuleExtensions<TDefinition['modules'][number]>

export type ApplicationExtensionHostApis<
  TDefinition extends ApplicationDefinition,
> = UnionToIntersection<HostApiOfExtension<ApplicationExtensions<TDefinition>>>

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

export type RequireApplicationHost<
  TDefinition extends ApplicationDefinition,
  TNamespace extends PropertyKey,
> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : TNamespace extends keyof ApplicationExtensionHostApis<TDefinition>
      ? TDefinition
      : never
