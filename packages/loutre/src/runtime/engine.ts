export type RuntimeEngine =
  | 'node'
  | 'bun'
  | 'cloudflare-workers'
  | 'aws-lambda'
  | 'electron'
  | 'unknown'

const runtimeLabels = {
  node: 'Node.js',
  bun: 'Bun',
  'cloudflare-workers': 'Cloudflare Workers',
  'aws-lambda': 'AWS Lambda',
  electron: 'Electron',
  unknown: 'an unknown runtime',
} as const satisfies Readonly<Record<RuntimeEngine, string>>

export function detectRuntimeEngine(): RuntimeEngine {
  const globals = globalThis as typeof globalThis & {
    readonly Bun?: unknown
    readonly Deno?: unknown
    readonly WebSocketPair?: unknown
    readonly navigator?: { readonly userAgent?: string }
    readonly process?: {
      readonly env?: Readonly<Record<string, string | undefined>>
      readonly release?: { readonly name?: string }
      readonly versions?: Readonly<Record<string, string | undefined>>
    }
  }
  if (
    globals.Bun !== undefined ||
    globals.process?.versions?.bun !== undefined
  ) {
    return 'bun'
  }
  if (globals.Deno !== undefined) return 'unknown'
  if (
    globals.navigator?.userAgent === 'Cloudflare-Workers' ||
    globals.WebSocketPair !== undefined
  ) {
    return 'cloudflare-workers'
  }
  if (globals.process?.versions?.electron !== undefined) return 'electron'
  if (
    globals.process?.env?.AWS_EXECUTION_ENV?.startsWith('AWS_Lambda_nodejs')
  ) {
    return 'aws-lambda'
  }
  if (
    globals.process?.release?.name === 'node' ||
    globals.process?.versions?.node !== undefined
  ) {
    return 'node'
  }
  return 'unknown'
}

export function assertRuntimeEngine(
  expected: Exclude<RuntimeEngine, 'unknown'>,
): void {
  const actual = detectRuntimeEngine()
  if (actual === expected) {
    assertSupportedBunVersion()
    return
  }
  throw new Error(
    `LUTRE_RUNTIME_MISMATCH: Expected ${runtimeLabels[expected]}, detected ${runtimeLabels[actual]}.`,
  )
}

export function assertSupportedBunVersion(): void {
  if (detectRuntimeEngine() !== 'bun') return
  const globals = globalThis as typeof globalThis & {
    readonly Bun?: { readonly version?: string }
    readonly process?: { readonly versions?: { readonly bun?: string } }
  }
  const version = globals.Bun?.version ?? globals.process?.versions?.bun
  const release = version?.match(/^(\d+)\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/)
  if (
    release &&
    (Number(release[1]) > 1 ||
      (Number(release[1]) === 1 && Number(release[2]) >= 4))
  )
    return
  throw new Error(
    `LUTRE_RUNTIME_VERSION: Bun ${version ?? 'unknown'} is not supported. Bun >=1.4.0 (stable) is required.`,
  )
}
