import type { ApplicationDefinition } from '@loutrejs/loutre'
import {
  projectApplicationModel,
  type ApplicationModelGraphIR,
} from '@loutrejs/loutre/graph'
import {
  emitEntry,
  loadEntry,
  loadEntryWithFiles,
  type EmitEntryOptions,
  type LoadEntryOptions,
} from './entry-loader.js'

export type EmitApplicationOptions = EmitEntryOptions

export interface LoadedApplicationDefinition {
  readonly definition: ApplicationDefinition
  readonly files: readonly string[]
}

export interface LoadedApplicationGraph {
  readonly graph: ApplicationModelGraphIR
  readonly files: readonly string[]
}

export async function emitApplication(
  entry: string,
  output: string,
  options: EmitEntryOptions = {},
): Promise<readonly string[]> {
  return emitEntry(entry, output, options)
}

export async function loadApplicationDefinitionWithFiles(
  entry: string,
  options: LoadEntryOptions = {},
): Promise<LoadedApplicationDefinition> {
  const loaded = await loadEntryWithFiles(entry, options)
  assertApplicationDefinition(loaded.value)
  return {
    definition: loaded.value,
    files: loaded.files,
  }
}

export async function loadApplicationDefinition(
  entry: string,
  options: LoadEntryOptions = {},
): Promise<ApplicationDefinition> {
  const value = await loadEntry(entry, options)
  assertApplicationDefinition(value)
  return value
}

export async function loadApplicationGraphWithFiles(
  entry: string,
  options: LoadEntryOptions = {},
): Promise<LoadedApplicationGraph> {
  const loaded = await loadApplicationDefinitionWithFiles(entry, options)
  return {
    graph: projectApplicationModel(loaded.definition.model),
    files: loaded.files,
  }
}

export async function loadApplicationGraph(
  entry: string,
  options: LoadEntryOptions = {},
): Promise<ApplicationModelGraphIR> {
  const application = await loadApplicationDefinition(entry, options)
  return projectApplicationModel(application.model)
}

function isApplicationDefinition(
  value: unknown,
): value is ApplicationDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'application-definition'
  )
}

function assertApplicationDefinition(
  value: unknown,
): asserts value is ApplicationDefinition {
  if (!isApplicationDefinition(value)) {
    throw new Error(
      'Application entry must default export an ApplicationDefinition.',
    )
  }
  if (!value.model || value.model.kind !== 'application-model') {
    throw new Error(
      'ApplicationDefinition must contain a compiled Application Model.',
    )
  }
}
