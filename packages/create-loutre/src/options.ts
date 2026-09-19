import type { RuntimeEngine } from '@loutrejs/loutre/runtime'
import { match } from 'ts-pattern'

export const projectTargets = [
  'node',
  'bun',
  'deno',
  'cloudflare-workers',
  'aws-lambda',
] as const satisfies readonly Exclude<RuntimeEngine, 'electron' | 'unknown'>[]

export type ProjectTarget = Exclude<RuntimeEngine, 'electron' | 'unknown'>

export function createIsTarget(
  target: ProjectTarget,
): (candidate: ProjectTarget) => boolean {
  return (candidate) => target === candidate
}

export const packageManagers = ['npm', 'pnpm', 'yarn', 'bun', 'deno'] as const

export type PackageManager = (typeof packageManagers)[number]

export const targetLabels: Readonly<Record<ProjectTarget, string>> = {
  node: 'Node.js',
  bun: 'Bun',
  deno: 'Deno',
  'cloudflare-workers': 'Cloudflare Workers',
  'aws-lambda': 'AWS Lambda',
}

export const packageManagerLabels: Readonly<Record<PackageManager, string>> = {
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'Yarn',
  bun: 'Bun',
  deno: 'Deno',
}

export function installCommand(packageManager: PackageManager): string {
  return `${packageManager} install`
}

export function runScriptCommand(
  packageManager: PackageManager,
  script: string,
): string {
  return match(packageManager)
    .with('npm', () => `npm run ${script}`)
    .with('pnpm', () => `pnpm run ${script}`)
    .with('yarn', () => `yarn run ${script}`)
    .with('bun', () => `bun run ${script}`)
    .with('deno', () => `deno task ${script}`)
    .exhaustive()
}
