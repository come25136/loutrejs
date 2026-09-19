import type { ApplicationModel } from '../core/model/types.js'
import { defineModule } from '../core/module.js'
import { provide } from '../core/provider.js'
import { token } from '../core/token.js'

export interface DevtoolsModuleOptions {
  readonly enabled?: boolean
  readonly capture?: {
    readonly providerMethods?: boolean
    readonly results?: false | 'errors' | 'all'
    readonly maxValueBytes?: number
    readonly maxDepth?: number
  }
  readonly replay?: {
    readonly enabled?: boolean
    readonly capsuleTtlMs?: number
    readonly maxCapsules?: number
  }
  readonly redact?: readonly string[]
}

const devtoolsOptionsToken = token<Readonly<DevtoolsModuleOptions>>(
  'loutre.devtools.options',
)

const devtoolsModuleTemplate = defineModule<DevtoolsModuleOptions | undefined>(
  (options = {}) => ({
    name: 'LoutreDevtoolsModule',
    providers: [
      provide(devtoolsOptionsToken).useValue(Object.freeze({ ...options })),
    ],
  }),
)

export function DevtoolsModule(options?: DevtoolsModuleOptions) {
  return devtoolsModuleTemplate(options)
}

export function devtoolsOptionsOf(
  model: ApplicationModel,
): Readonly<DevtoolsModuleOptions> | undefined {
  const provider = model.providers.find((candidate) => {
    if (candidate.kind !== 'value') return false
    const provided = candidate.provide
    return (
      typeof provided !== 'function' &&
      provided.kind === 'token' &&
      provided.id === devtoolsOptionsToken.id
    )
  })
  return provider?.kind === 'value'
    ? (provider.useValue as Readonly<DevtoolsModuleOptions>)
    : undefined
}
