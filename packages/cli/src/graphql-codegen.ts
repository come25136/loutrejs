import {
  readFile,
  mkdir,
  rename,
  rm,
  writeFile,
  access,
} from 'node:fs/promises'
import { dirname, resolve, relative, sep } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
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
  isNonNullType,
  isListType,
  isInputObjectType,
  type GraphQLInputType,
  type GraphQLType,
  type GraphQLObjectType,
  type GraphQLInterfaceType,
  Source,
  validate,
  type DocumentNode,
  type GraphQLSchema,
  Kind,
  OperationTypeNode,
} from 'graphql'
import { codegen } from '@graphql-codegen/core'
import * as typescript from '@graphql-codegen/typescript'
import * as resolvers from '@graphql-codegen/typescript-resolvers'
import * as operations from '@graphql-codegen/typescript-operations'
import * as documentNode from '@graphql-codegen/typed-document-node'
import { format } from 'oxfmt'
import {
  parse as parseTypeScript,
  print as printTypeScript,
  type Expression,
} from '@swc/core'
import {
  loadGraphQLConfig,
  type GraphQLCodegenTarget,
} from './graphql-config.js'

export const generatedHeader =
  '// @generated loutre graphql generateの出力です。直接編集しないでください。\n'

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

function stripLocations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLocations)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'loc')
        .map(([key, item]) => [key, stripLocations(item)]),
    )
  return value
}
function resultType(type: GraphQLType): string {
  const inner = (value: GraphQLType): string =>
    isListType(value)
      ? `ReadonlyArray<${resultType(value.ofType)}>`
      : isScalarType(value)
        ? `Scalars['${value.name}']['output']`
        : `ResolversParentTypes['${value.toString()}']`
  return isNonNullType(type) ? inner(type.ofType) : `Maybe<${inner(type)}>`
}
function inputType(type: GraphQLInputType): string {
  const inner = (value: GraphQLInputType): string =>
    isListType(value)
      ? `ReadonlyArray<${inputType(value.ofType)}>`
      : isScalarType(value)
        ? `Scalars['${value.name}']['input']`
        : isInputObjectType(value)
          ? `CoercedInputTypes['${value.name}']`
          : value.toString()
  return isNonNullType(type) ? inner(type.ofType) : `InputMaybe<${inner(type)}>`
}
function inputProperties(
  fields: readonly {
    readonly name: string
    readonly type: GraphQLInputType
    readonly defaultValue?: unknown
    readonly default?: unknown
  }[],
) {
  return fields
    .map(
      (field) =>
        `readonly ${field.name}${isNonNullType(field.type) || field.defaultValue !== undefined || field.default !== undefined ? '' : '?'}: ${inputType(field.type)}`,
    )
    .join('\n')
}
async function formattedOutput(
  path: string,
  content: string,
  fingerprint: string,
) {
  const module = await parseTypeScript(content, {
    syntax: 'typescript',
    comments: false,
  })
  const aliases = new Map<string, string>()
  const body = []
  const names = new Set<string>()
  const templateModule = await parseTypeScript('const value = Kind.NAME', {
    syntax: 'typescript',
  })
  const templateStatement = templateModule.body[0]
  const template =
    templateStatement?.type === 'VariableDeclaration'
      ? templateStatement.declarations[0]?.init
      : undefined
  if (
    template?.type !== 'MemberExpression' ||
    template.object.type !== 'Identifier' ||
    template.property.type !== 'Identifier'
  )
    throw new Error('GraphQL ASTの定数参照を構築できません。')
  const namespaceTemplate = template.object
  const memberTemplate = template.property
  const constants = (expression: Expression): Expression => {
    if (expression.type === 'ArrayExpression') {
      for (const item of expression.elements)
        if (item) item.expression = constants(item.expression)
    } else if (expression.type === 'ObjectExpression') {
      for (const property of expression.properties) {
        if (property.type !== 'KeyValueProperty') continue
        const key =
          property.key.type === 'Identifier' ||
          property.key.type === 'StringLiteral'
            ? property.key.value
            : undefined
        const values =
          key === 'kind'
            ? Kind
            : key === 'operation'
              ? OperationTypeNode
              : undefined
        const literal =
          property.value.type === 'StringLiteral' ? property.value : undefined
        const constant =
          values && literal
            ? Object.entries(values).find(
                ([, value]) => value === literal.value,
              )?.[0]
            : undefined
        if (constant && literal) {
          const namespace = key === 'kind' ? 'Kind' : 'OperationTypeNode'
          property.value = {
            ...template,
            object: { ...namespaceTemplate, value: namespace },
            property: { ...memberTemplate, value: constant },
          }
          names.add(namespace)
        } else property.value = constants(property.value)
      }
    }
    return expression
  }
  for (const statement of module.body) {
    if (
      statement.type === 'ExportDeclaration' &&
      statement.declaration.type === 'VariableDeclaration'
    ) {
      for (const declaration of statement.declaration.declarations) {
        const init = declaration.init
        if (
          declaration.id.type === 'Identifier' &&
          init?.type === 'TsAsExpression' &&
          init.typeAnnotation.type === 'TsTypeReference' &&
          init.typeAnnotation.typeName.type === 'Identifier' &&
          init.typeAnnotation.typeName.value === 'DocumentNode' &&
          init.expression.type === 'TsAsExpression' &&
          init.expression.typeAnnotation.type === 'TsKeywordType' &&
          init.expression.typeAnnotation.kind === 'unknown'
        ) {
          declaration.id = {
            ...declaration.id,
            typeAnnotation: {
              type: 'TsTypeAnnotation',
              span: init.span,
              typeAnnotation: init.typeAnnotation,
            },
          }
          declaration.init = init.expression.expression
        }
        if (
          declaration.id.type === 'Identifier' &&
          'typeAnnotation' in declaration.id &&
          declaration.id.typeAnnotation?.typeAnnotation.type ===
            'TsTypeReference' &&
          declaration.init
        )
          declaration.init = constants(declaration.init)
      }
    }
    if (
      statement.type === 'ExportDeclaration' &&
      statement.declaration.type === 'TsTypeAliasDeclaration'
    ) {
      const name = statement.declaration.id.value
      const printed = (await printTypeScript({ ...module, body: [statement] }))
        .code
      const previous = aliases.get(name)
      if (previous !== undefined) {
        if (previous !== printed)
          throw new Error(`生成された型定義が競合しています: ${name}`)
        continue
      }
      aliases.set(name, printed)
    }
    body.push(statement)
  }
  const constantModule = names.size
    ? await parseTypeScript(
        `import { ${[...names].join(', ')} } from 'graphql'`,
        { syntax: 'typescript' },
      )
    : undefined
  const normalized = await printTypeScript({
    ...module,
    body: [...(constantModule?.body ?? []), ...body],
  })
  const formatted = await format(
    path,
    `${generatedHeader}// fingerprint: ${fingerprint}\n${normalized.code}`,
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
  return { path, content: formatted.code }
}
async function generateTarget(target: GraphQLCodegenTarget, cwd: string) {
  const { schema, ast, files } = await loadSchema(target.schema, cwd)
  validateTarget(target, schema)
  const inputs =
    target.kind === 'client' ? await inputFiles(target.documents, cwd) : []
  const docs = await documents(inputs)
  if (target.kind === 'client')
    validateOperations(schema, concatAST(docs.map((value) => value.document)))
  const blueprint = stripLocations(ast)
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        version: 4,
        target,
        blueprint,
        documents: docs.map((doc) => stripLocations(doc.document)),
      }),
    )
    .digest('hex')
  const config = {
    useTypeImports: true,
    namingConvention: 'keep',
    enumsAsTypes: true,
    immutableTypes: true,
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
  let content = await codegen({
    filename: target.kind === 'server' ? 'types.ts' : target.output,
    schema: ast,
    documents: docs,
    config,
    pluginMap: { typescript, resolvers, operations, documentNode },
    plugins:
      target.kind === 'server'
        ? [{ typescript: {} }, { resolvers: {} }]
        : [{ typescript: {} }, { operations: {} }, { documentNode: {} }],
  })
  const output = resolve(cwd, target.output)
  if (target.kind === 'client')
    return {
      name: 'client',
      root: output,
      files: [await formattedOutput(output, content, fingerprint)],
      inputs: [...files, ...inputs],
    }
  const types = Object.values(schema.getTypeMap())
    .filter(
      (type): type is GraphQLObjectType | GraphQLInterfaceType =>
        !type.name.startsWith('__') &&
        (isObjectType(type) || isInterfaceType(type)),
    )
    .toSorted((left, right) => left.name.localeCompare(right.name))
  const identities: Record<string, Record<string, string>> = {}
  const fields = types
    .map((type) => {
      identities[type.name] = {}
      const items = Object.values(type.getFields())
        .toSorted((left, right) => left.name.localeCompare(right.name))
        .map((field) => {
          identities[type.name]![field.name] = `${type.name}.${field.name}`
          const args = field.args.length
            ? `${type.name}${field.name}Args`
            : 'Record<string, never>'
          return `${field.name}: FieldSpec<ResolversParentTypes['${type.name}'], ${args}, ${resultType(field.type)}, AppContext>`
        })
      return `${type.name}: { ${items.join('\n')} }`
    })
    .join('\n')
  const args = types.flatMap((type) =>
    Object.values(type.getFields())
      .filter((field) => field.args.length)
      .map((field) => ({
        name: `${type.name}${field.name}Args`,
        content: `export type ${type.name}${field.name}Args = { ${inputProperties(field.args)} }`,
      })),
  )
  const module = await parseTypeScript(content, {
    syntax: 'typescript',
    comments: false,
  })
  const argumentNames = new Set(args.map((arg) => arg.name))
  content =
    (
      await printTypeScript({
        ...module,
        body: module.body.filter(
          (statement) =>
            !(
              statement.type === 'ExportDeclaration' &&
              statement.declaration.type === 'TsTypeAliasDeclaration' &&
              argumentNames.has(statement.declaration.id.value)
            ),
        ),
      })
    ).code + args.map((arg) => arg.content).join('\n')
  const inputObjects = Object.values(schema.getTypeMap())
    .filter(isInputObjectType)
    .map(
      (type) =>
        `${type.name}: { ${inputProperties(Object.values(type.getFields()))} }`,
    )
    .join('\n')
  content += `\nexport interface CoercedInputTypes { ${inputObjects} }\n`
  const contextImport = target.contextType.split('#')
  const contextName =
    contextImport.length === 2 ? 'LoutreContext' : target.contextType
  const extra = `\nimport type { FieldSpec } from '@loutrejs/graphql/data'\n${contextImport.length === 2 ? `import type { ${contextImport[1]} as LoutreContext } from '${contextImport[0]}'` : ''}\nexport type CoercedArguments<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]-?: Exclude<T[P], undefined> }\nexport type SchemaContext = ${contextName}\nexport interface SchemaFields { ${fields.replaceAll(', AppContext>', `, ${contextName}>`)} }\n`
  const outputs = {
    'types.ts': content + extra,
    'data.ts': `import { createSchemaData } from '@loutrejs/graphql/data'\nimport type { SchemaFields } from './types.js'\nexport const createData = () => createSchemaData<SchemaFields>(${JSON.stringify(identities)})`,
    'schema-ast.ts': `import type { DocumentNode } from 'graphql'\nimport { bindManifest as bindRuntimeManifest, type GraphQLSchemaDocument, type GraphQLManifest } from '@loutrejs/graphql/runtime'\nimport type { SchemaContext, Resolvers } from './types.js'\nexport const schemaDocument: GraphQLSchemaDocument<SchemaContext> = ${JSON.stringify(blueprint)}\nexport function bindManifest<Context extends object = SchemaContext>(input: { readonly schemaDocument: DocumentNode; readonly resolvers: Resolvers<Context> }): GraphQLManifest<Context> { return bindRuntimeManifest<Context>(input) }`,
  }
  return {
    name: 'server',
    root: output,
    files: await Promise.all(
      Object.entries(outputs).map(([file, source]) =>
        formattedOutput(resolve(output, file), source, fingerprint),
      ),
    ),
    inputs: files,
  }
}

export async function planGeneration(configPath: string, selected?: string) {
  const config = await loadGraphQLConfig(configPath)
  const entries = Object.entries(config.targets)
    .filter(([name]) => selected === undefined || name === selected)
    .toSorted(([a], [b]) => a.localeCompare(b))
  if (!entries.length) throw new Error(`targetが見つかりません: ${selected}`)
  const cwd = dirname(configPath)
  const generations = await Promise.all(
    entries.map(async ([name, target]) => ({
      ...(await generateTarget(target, cwd)),
      name,
    })),
  )
  const roots: string[] = []
  const inputs = new Set(
    generations.flatMap((generation) => generation.inputs).concat(configPath),
  )
  for (const generation of generations) {
    if (
      roots.some(
        (root) =>
          root === generation.root ||
          root.startsWith(`${generation.root}${sep}`) ||
          generation.root.startsWith(`${root}${sep}`),
      ) ||
      [...inputs].some(
        (input) =>
          input === generation.root ||
          input.startsWith(`${generation.root}${sep}`),
      )
    )
      throw new Error(`出力先が重複するか入力と衝突します: ${generation.root}`)
    roots.push(generation.root)
  }
  return generations
}
async function existingContent(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
export async function generate(
  configPath: string,
  selected: string | undefined,
  check: boolean,
) {
  const generations = await planGeneration(configPath, selected)
  const outputs = generations.flatMap((generation) =>
    generation.files.map((file) => ({ ...file, name: generation.name })),
  )
  const changed: string[] = []
  for (const output of outputs) {
    const previous = await existingContent(output.path)
    if (previous !== undefined && !previous.startsWith(generatedHeader))
      throw new Error(`生成物以外のfileは上書きできません: ${output.path}`)
    if (previous !== output.content) changed.push(output.path)
  }
  for (const generation of generations) {
    if (generation.files.length > 1 && (await exists(generation.root))) {
      const existing = await glob('**/*', {
        cwd: generation.root,
        absolute: true,
        onlyFiles: true,
        dot: true,
      })
      for (const path of existing)
        if (!generation.files.some((file) => file.path === path))
          throw new Error(`生成directoryに管理外のfileがあります: ${path}`)
    }
  }
  if (!check && changed.length) {
    const stages: {
      root: string
      temporary: string
      backup: string
      previous: boolean
      mutated: boolean
      preserveBackup: boolean
    }[] = []
    try {
      for (const generation of generations) {
        if (!generation.files.some((file) => changed.includes(file.path)))
          continue
        await mkdir(dirname(generation.root), { recursive: true })
        const temporary = `${generation.root}.${randomUUID()}.tmp`
        const backup = `${generation.root}.${randomUUID()}.tmp`
        const stage = {
          root: generation.root,
          temporary,
          backup,
          previous: await exists(generation.root),
          mutated: false,
          preserveBackup: false,
        }
        stages.push(stage)
        if (generation.files.length > 1) await mkdir(temporary)
        for (const file of generation.files)
          await writeFile(
            generation.files.length > 1
              ? resolve(temporary, relative(generation.root, file.path))
              : temporary,
            file.content,
          )
      }
      for (const stage of stages) {
        if (stage.previous) await rename(stage.root, stage.backup)
        stage.mutated = true
        await rename(stage.temporary, stage.root)
      }
    } catch (error) {
      const failures: unknown[] = [error]
      for (const stage of stages.toReversed()) {
        if (!stage.mutated) continue
        try {
          await rm(stage.root, { recursive: true, force: true })
          if (stage.previous) await rename(stage.backup, stage.root)
        } catch (failure) {
          stage.preserveBackup = true
          failures.push(
            new Error(`正常世代のbackupを保持しました: ${stage.backup}`, {
              cause: failure,
            }),
          )
        }
      }
      if (failures.length > 1)
        throw new AggregateError(
          failures,
          '生成物の復旧に失敗しました。backupを保持しています。',
          { cause: error },
        )
      throw error
    } finally {
      await Promise.all(
        stages.flatMap((stage) => [
          rm(stage.temporary, { recursive: true, force: true }),
          ...(stage.preserveBackup
            ? []
            : [rm(stage.backup, { recursive: true, force: true })]),
        ]),
      )
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
