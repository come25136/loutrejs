import {
  ANALYTICS_DB,
  AppEnv,
  MemoryStorage,
  PRIMARY_DB,
  S3Storage,
  STORAGE,
  createDatabaseIntegration,
} from '../integrations/database-modules/src/index.js'

describe('database modules integration', () => {
  it('同じParameterized Moduleの2 instanceを別tokenで解決する', async () => {
    const { runtime, events, env, model } =
      await createDatabaseIntegration('memory')
    const primary = runtime.get(PRIMARY_DB)
    const analytics = runtime.get(ANALYTICS_DB)
    const storage = runtime.get(STORAGE)

    expect(primary).not.toBe(analytics)
    expect(primary.url).toBe('primary://example')
    expect(analytics.url).toBe('analytics://example')
    expect(storage).toBeInstanceOf(MemoryStorage)
    expect(env).toBeInstanceOf(AppEnv)
    expect(events).toEqual([
      'primary.connect:primary://example',
      'primary.verify',
      'analytics.connect:analytics://example',
      'analytics.verify',
      'primary.bootstrap',
      'analytics.bootstrap',
    ])
    const primaryProvider = model.nodes.find(
      (node) => node.kind === 'provider' && node.token === PRIMARY_DB,
    )
    expect(
      model.edges.filter(
        (edge) => edge.kind === 'exports' && edge.to === primaryProvider?.id,
      ),
    ).toHaveLength(1)

    await runtime.close('test')
    expect(events.slice(-6)).toEqual([
      'analytics.beforeShutdown:test',
      'primary.beforeShutdown:test',
      'analytics.close',
      'primary.close',
      'analytics.shutdown:test',
      'primary.shutdown:test',
    ])
  })

  it('finite Env branchからconditional Providerを選ぶ', async () => {
    const { runtime } = await createDatabaseIntegration('s3')
    expect(runtime.get(STORAGE)).toBeInstanceOf(S3Storage)
    await runtime.close()
  })

  it('Env keyは値を含まないsymbolic referenceである', () => {
    const key = AppEnv.key('PRIMARY_DATABASE_URL')
    expect(key).toMatchObject({
      kind: 'runtime-input-key',
      source: 'environment',
      contract: AppEnv,
      key: 'PRIMARY_DATABASE_URL',
    })
    expect(JSON.stringify(key)).not.toContain('primary://example')
  })
})
