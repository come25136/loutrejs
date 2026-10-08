import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import glob from 'fast-glob'
import {
  assertValidSchema,
  buildASTSchema,
  concatAST,
  findBreakingChanges,
  findDangerousChanges,
  isObjectType,
  isInterfaceType,
  isScalarType,
  parse,
  print,
  Source,
  validate,
  type DocumentNode,
  type GraphQLSchema,
} from 'graphql'
import { codegen } from '@graphql-codegen/core'
import * as typescript from '@graphql-codegen/typescript'
import * as resolvers from '@graphql-codegen/typescript-resolvers'
import * as operations from '@graphql-codegen/typescript-operations'
import * as documentNode from '@graphql-codegen/typed-document-node'
import { format } from 'oxfmt'
import { parse as parseTypeScript, print as printTypeScript } from '@swc/core'
import {
  graphQLCodegenConfig,
  type GraphQLCodegenTarget,
} from './graphql-config.js'

export const generatedHeader =
  '// このファイルはloutre graphql generateが生成します。直接編集しないでください。\n'

export async function inputFiles(
  patterns: readonly string[],
  cwd: string,
): Promise<string[]> {
  const files = new Set<string>()
  for (const pattern of patterns) {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(pattern))
      throw new Error('入力はlocal SDL / operation fileを指定してください。')
    const matches = await glob(pattern, {
      cwd,
      absolute: true,
      onlyFiles: true,
      unique: true,
    })
    if (matches.length === 0)
      throw new Error(`入力fileが見つかりません: ${pattern}`)
    for (const file of matches) files.add(resolve(file))
  }
  return [...files].toSorted()
}

async function documents(files: readonly string[]) {
  return Promise.all(
    files.map(async (file) => ({
      location: file,
      document: parse(new Source(await readFile(file, 'utf8'), file)),
    })),
  )
}

export async function loadSchema(patterns: readonly string[], cwd: string) {
  const files = await inputFiles(patterns, cwd)
  const ast = concatAST((await documents(files)).map((value) => value.document))
  const schema = buildASTSchema(ast)
  assertValidSchema(schema)
  return { files, ast, schema }
}

function validateTarget(target: GraphQLCodegenTarget, schema: GraphQLSchema) {
  if (target.kind === 'server') {
    for (const name of Object.keys(target.mappers ?? {})) {
      const type = schema.getType(name)
      if (!type || (!isObjectType(type) && !isInterfaceType(type)))
        throw new Error(
          `mappers.${name}はschemaのobject / interface型を指定してください。`,
        )
    }
  }
  for (const name of Object.keys(target.scalars ?? {})) {
    const type = schema.getType(name)
    if (!type || !isScalarType(type))
      throw new Error(`scalars.${name}はschemaのscalar型を指定してください。`)
  }
}

function validateOperations(schema: GraphQLSchema, ast: DocumentNode) {
  const errors = validate(schema, ast)
  if (errors.length)
    throw new Error(errors.map((error) => error.toString()).join('\n'))
  const names = new Set<string>()
  let count = 0
  for (const definition of ast.definitions) {
    if (definition.kind !== 'OperationDefinition') continue
    count++
    if (!definition.name)
      throw new Error('client operationには名前が必要です。')
    if (names.has(definition.name.value))
      throw new Error(`operation名が重複しています: ${definition.name.value}`)
    names.add(definition.name.value)
  }
  if (count === 0) throw new Error('client documentにoperationが必要です。')
}

async function generateTarget(target: GraphQLCodegenTarget, cwd: string) {
  const { schema, ast, files } = await loadSchema(target.schema, cwd)
  validateTarget(target, schema)
  const inputs =
    target.kind === 'client' ? await inputFiles(target.documents, cwd) : []
  const docs = await documents(inputs)
  if (target.kind === 'client')
    validateOperations(schema, concatAST(docs.map((value) => value.document)))
  const config = {
    useTypeImports: true,
    enumsAsTypes: true,
    strictScalars: true,
    defaultScalarType: 'unknown',
    disableDescriptions: true,
    scalars: target.scalars ?? {},
    ...(target.kind === 'server'
      ? {
          contextType: target.contextType,
          mappers: target.mappers ?? {},
          mapperTypeSuffix: 'Domain',
        }
      : {}),
  }
  const content = await codegen({
    filename: target.output,
    schema: ast,
    documents: docs,
    config,
    pluginMap: { typescript, resolvers, operations, documentNode },
    plugins:
      target.kind === 'server'
        ? [{ typescript: {} }, { resolvers: {} }]
        : [{ typescript: {} }, { operations: {} }, { documentNode: {} }],
  })
  const runtimeSchema =
    target.kind === 'server'
      ? `\nexport const typeDefs = ${JSON.stringify(print(ast))}\n`
      : ''
  const normalized = await printTypeScript(
    await parseTypeScript(content + runtimeSchema, {
      syntax: 'typescript',
      comments: false,
    }),
  )
  const formatted = await format(
    target.output,
    generatedHeader + normalized.code,
    {
      singleQuote: true,
      semi: false,
      trailingComma: 'all',
      printWidth: 80,
      endOfLine: 'lf',
    },
  )
  if (formatted.errors.length)
    throw new Error(formatted.errors.map((error) => error.message).join('\n'))
  return {
    path: resolve(cwd, target.output),
    content: formatted.code,
    inputs: [...files, ...inputs],
  }
}

export async function planGeneration(configPath: string, selected?: string) {
  const config = graphQLCodegenConfig.parse(
    JSON.parse(await readFile(configPath, 'utf8')),
  )
  const entries = Object.entries(config.targets).filter(
    ([name]) => selected === undefined || name === selected,
  )
  if (entries.length === 0)
    throw new Error(`targetが見つかりません: ${selected}`)
  const cwd = dirname(configPath)
  const outputs = await Promise.all(
    entries.map(async ([name, target]) => ({
      name,
      ...(await generateTarget(target, cwd)),
    })),
  )
  const paths = new Set<string>()
  const inputs = new Set(outputs.flatMap((output) => output.inputs))
  for (const output of outputs) {
    if (paths.has(output.path) || inputs.has(output.path))
      throw new Error(`出力先が重複するか入力と衝突します: ${output.path}`)
    paths.add(output.path)
  }
  return outputs
}

async function existingContent(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export async function generate(
  configPath: string,
  selected: string | undefined,
  check: boolean,
) {
  const outputs = await planGeneration(configPath, selected)
  const changed: string[] = []
  for (const output of outputs) {
    const previous = await existingContent(output.path)
    if (previous !== undefined && !previous.startsWith(generatedHeader))
      throw new Error(`生成物以外のfileは上書きできません: ${output.path}`)
    if (previous !== output.content) changed.push(output.path)
  }
  if (!check) {
    for (const output of outputs) {
      if (!changed.includes(output.path)) continue
      await mkdir(dirname(output.path), { recursive: true })
      const temporary = `${output.path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, output.content)
        await rename(temporary, output.path)
      } finally {
        await rm(temporary, { force: true })
      }
    }
  }
  return { outputs, changed }
}

export async function compareSchemas(
  before: string,
  after: string,
  cwd: string,
) {
  const [previous, next] = await Promise.all([
    loadSchema([before], cwd),
    loadSchema([after], cwd),
  ])
  return {
    breaking: findBreakingChanges(previous.schema, next.schema),
    dangerous: findDangerousChanges(previous.schema, next.schema),
  }
}
