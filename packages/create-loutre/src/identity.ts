import { resolve } from 'node:path'
export type AbsoluteFsPath = string & {
  readonly '~loutre.scaffolder': 'absolute-path'
}
export type GeneratedPackageName = string & {
  readonly '~loutre.scaffolder': 'package-name'
}
export type GeneratedWorkerName = string & {
  readonly '~loutre.scaffolder': 'worker-name'
}
export const absoluteFsPath = (...paths: readonly string[]): AbsoluteFsPath =>
  resolve(...paths) as AbsoluteFsPath
