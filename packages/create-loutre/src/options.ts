export const projectTargets = [
  'node',
  'bun',
  'deno',
  'workerd',
  'lambda',
] as const

export type ProjectTarget = (typeof projectTargets)[number]

export const packageManagers = ['npm', 'pnpm', 'yarn', 'bun', 'deno'] as const

export type PackageManager = (typeof packageManagers)[number]

export const targetLabels: Readonly<Record<ProjectTarget, string>> = {
  node: 'Node.js',
  bun: 'Bun',
  deno: 'Deno',
  workerd: 'Cloudflare Workers',
  lambda: 'AWS Lambda',
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
  switch (packageManager) {
    case 'npm':
      return `npm run ${script}`
    case 'pnpm':
      return `pnpm run ${script}`
    case 'yarn':
      return `yarn run ${script}`
    case 'bun':
      return `bun run ${script}`
    case 'deno':
      return `deno task ${script}`
  }
}
