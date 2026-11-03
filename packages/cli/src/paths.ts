import { resolve, relative, isAbsolute, sep, win32 } from 'node:path'
import { pathToFileURL } from 'node:url'

type PathValue<Kind extends string> = string & {
  readonly '~loutre.cli-path': Kind
}
export type AbsoluteFsPath = PathValue<'absolute'>
export type ProjectRelativePath = PathValue<'project-relative'>
export type NormalizedWatchPath = PathValue<'watch'>
export type WatchIgnorePattern = PathValue<'ignore-pattern'>
export type FileUrl = PathValue<'file-url'>
export const absoluteFsPath = (...paths: readonly string[]): AbsoluteFsPath =>
  resolve(...paths) as AbsoluteFsPath
export const fileUrl = (path: AbsoluteFsPath): FileUrl =>
  pathToFileURL(path).href as FileUrl
export const normalizedWatchPath = (path: string): NormalizedWatchPath =>
  path
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '') as NormalizedWatchPath
export const watchIgnorePattern = (value: string): WatchIgnorePattern =>
  normalizedWatchPath(value) as string as WatchIgnorePattern
export function projectRelativePath(
  file: AbsoluteFsPath,
  root: AbsoluteFsPath,
): ProjectRelativePath | undefined {
  const path = relative(root, file)
  if (
    path === '' ||
    path === '..' ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path) ||
    win32.isAbsolute(path)
  )
    return undefined
  return path.split(sep).join('/') as ProjectRelativePath
}
