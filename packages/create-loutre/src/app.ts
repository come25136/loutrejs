import { readdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { defineApplication, defineModule, inject, task } from '@loutrejs/loutre'
import { writeStarter } from './starter.js'

export interface CreateProjectInput {
  readonly cwd: string
  readonly target: string
}

export interface CreateProjectResult {
  readonly packageName: string
  readonly targetDirectory: string
}

export class ProjectScaffolder {
  async create(input: CreateProjectInput): Promise<CreateProjectResult> {
    const targetDirectory = resolve(input.cwd, input.target)
    const packageName = packageNameFor(targetDirectory)
    await assertTargetIsEmpty(targetDirectory)

    await writeStarter(targetDirectory, packageName)

    return { packageName, targetDirectory }
  }
}

export const createProject = task<CreateProjectInput, CreateProjectResult>({
  name: 'project.create',
  factory:
    (scaffolder = inject(ProjectScaffolder)) =>
    (input) =>
      scaffolder.create(input),
})

const CreateLoutreModule = defineModule(() => ({
  name: 'CreateLoutreModule',
  providers: [ProjectScaffolder],
}))

export default defineApplication({
  modules: [CreateLoutreModule()],
  tasks: [createProject],
})

async function assertTargetIsEmpty(targetDirectory: string): Promise<void> {
  try {
    const entries = await readdir(targetDirectory)
    if (entries.length > 0) {
      throw new Error(`生成先が空ではありません: ${targetDirectory}`)
    }
  } catch (error) {
    if (isMissingDirectory(error)) return
    throw error
  }
}

function isMissingDirectory(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function packageNameFor(targetDirectory: string): string {
  const name = basename(targetDirectory)
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '-')
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')

  if (
    name.length === 0 ||
    name.length > 214 ||
    name.startsWith('.') ||
    name.startsWith('_')
  ) {
    throw new Error(`npm package名を生成できません: ${targetDirectory}`)
  }
  return name
}
