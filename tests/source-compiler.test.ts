import { resolve } from 'node:path'
import {
  compileTypeScriptSource,
  createRuntimeLinkagePlan,
} from '@loutrefw/compiler'

describe('TypeScript AST Compiler', () => {
  const manifest = compileTypeScriptSource({
    tsconfigPath: resolve('tsconfig.json'),
  })

  it('Module、Provider、Contract、Pipeline、Capability Graphをsourceから抽出する', () => {
    expect(manifest.version).toBe(1)
    expect(manifest.modules.some(({ name }) => name === 'UsersModule')).toBe(true)
    expect(manifest.modules).toContainEqual(
      expect.objectContaining({
        name: 'UsersModule',
        description: 'Canonical HTTP CRUD fixture',
      }),
    )
    expect(manifest.modules).toContainEqual(
      expect.objectContaining({
        name: 'DatabaseModule',
        description: '`${args.name} database`',
      }),
    )
    expect(manifest.providers).toContain('EventStreamService')
    expect(manifest.contextKeys).toContainEqual({
      name: 'SESSION',
      property: 'session',
      location: expect.any(Object),
    })
    expect(manifest.contracts.some(({ name }) => name === 'UsersContract')).toBe(
      true,
    )
    expect(
      manifest.pipelines.some(
        ({ contract, procedure, protocol, layers }) =>
          contract === 'UsersContract' &&
          procedure === 'get' &&
          protocol === 'http' &&
          layers.at(-1)?.name === 'http.controller',
      ),
    ).toBe(true)
    expect(manifest.capabilities).toContain('http.server')
    expect(manifest.capabilities).toContain('http.response.streaming')
    expect(manifest.capabilities).toContain('messagePort.send')
    expect(manifest.envKeys).toContainEqual({
      env: 'AppEnv',
      key: 'PRIMARY_DATABASE_URL',
    })
    expect(manifest.conditions.some(({ source }) => source.includes('.select('))).toBe(
      true,
    )
    expect(manifest.lifecycles).toContainEqual({
      module: 'DatabaseModule',
      hook: 'onModuleInit',
    })
    expect(JSON.stringify(manifest)).not.toContain('primary://fixture')
    expect(JSON.stringify(manifest)).not.toContain('analytics://fixture')
  })

  it('decoratorなしの通常class constructor依存からRuntime Linkage Artifactを計画する', () => {
    const plan = createRuntimeLinkagePlan({
      tsconfigPath: resolve('tsconfig.json'),
      entry: resolve('fixtures/http-crud/src/app.ts'),
    })
    expect(plan.fragments.flatMap(({ bindings }) => bindings)).toContainEqual({
      target: 'UsersController',
      dependencies: ['UsersService'],
    })
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('非export classとcustom tokenのRuntime Linkage Artifactを計画する', () => {
    const example = createRuntimeLinkagePlan({
      tsconfigPath: resolve('examples/hello-http/tsconfig.json'),
      entry: resolve('examples/hello-http/src/app.ts'),
    })
    expect(example.fragments.flatMap(({ bindings }) => bindings)).toContainEqual({
      target: 'GreetingController',
      dependencies: ['GreetingService'],
    })

    const customToken = createRuntimeLinkagePlan({
      tsconfigPath: resolve('tsconfig.json'),
      entry: resolve('fixtures/compiler-manifest/src/custom-token-linkage.ts'),
    })
    expect(
      customToken.fragments.flatMap(({ bindings }) => bindings),
    ).toContainEqual({
      target: 'CustomTokenService',
      dependencies: ['REPOSITORY'],
    })
  })

  it('ControllerのContext property参照をconstructor DIと区別して抽出する', () => {
    const account = manifest.constructors.find(
      ({ className }) => className === 'AccountController',
    )
    expect(account?.dependencies).toEqual([])
    expect(manifest.contextProperties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          className: 'AccountController',
          property: 'session',
        }),
        expect.objectContaining({
          className: 'AccountController',
          property: 'currentTenant',
        }),
      ]),
    )
  })

  it('basicAuth Layerのauthentication roleとprincipal提供を抽出する', () => {
    const basicAuth = compileTypeScriptSource({
      tsconfigPath: resolve('examples/basic-auth/tsconfig.json'),
      entry: resolve('examples/basic-auth/src/app.ts'),
    })
    const pipeline = basicAuth.pipelines.find(
      ({ contract, procedure }) =>
        contract === 'ProfileContract' && procedure === 'get',
    )

    expect(pipeline?.layers).toContainEqual(
      expect.objectContaining({
        name: 'basicAuthentication',
        role: 'authentication',
        provides: ['currentUser'],
        requiresValidated: [],
        shortCircuits: [
          {
            protocol: 'http',
            variant: 'unauthorized',
            response: { status: 401 },
          },
        ],
      }),
    )
    expect(basicAuth.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'LUTRE_CONTEXT_001' }),
    )
  })

  it('PipelineがprovideしないContext propertyを静的診断する', () => {
    const invalid = compileTypeScriptSource({
      tsconfigPath: resolve('source-fixtures/invalid-context/tsconfig.json'),
    })
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_CONTEXT_001' }),
    )
  })

  it('source上の重複token IDを静的診断する', () => {
    const invalid = compileTypeScriptSource({
      tsconfigPath: resolve('source-fixtures/duplicate-token/tsconfig.json'),
    })
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_TOKEN_001' }),
    )
  })

  it('source上の同名Context Keyを静的診断する', () => {
    const invalid = compileTypeScriptSource({
      tsconfigPath: resolve('source-fixtures/duplicate-context/tsconfig.json'),
    })
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_CONTEXT_002' }),
    )
  })

  it('Layerのprovidesと返却propertyの不一致を静的診断する', () => {
    const invalid = compileTypeScriptSource({
      tsconfigPath: resolve('source-fixtures/invalid-layer-return/tsconfig.json'),
    })
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_CONTEXT_004' }),
    )
  })
})
