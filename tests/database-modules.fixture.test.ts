import {
  ANALYTICS_DB,
  AppEnv,
  MemoryStorage,
  PRIMARY_DB,
  S3Storage,
  STORAGE,
  createDatabaseFixture,
} from '../fixtures/database-modules/src/index.js'

describe('canonical Fixture C', () => {
  it('同じParameterized Moduleの2 instanceを別tokenで解決する', async () => {
    const { runtime, events, env } = await createDatabaseFixture('memory')
    await runtime.initialize()

    const primary = await runtime.container.resolve(PRIMARY_DB)
    const analytics = await runtime.container.resolve(ANALYTICS_DB)
    const storage = await runtime.container.resolve(STORAGE)

    expect(primary).not.toBe(analytics)
    expect(primary.url).toBe('primary://fixture')
    expect(analytics.url).toBe('analytics://fixture')
    expect(storage).toBeInstanceOf(MemoryStorage)
    expect(env).toBeInstanceOf(AppEnv)
    expect(events).toEqual([
      'primary.connect:primary://fixture',
      'primary.verify',
      'analytics.connect:analytics://fixture',
      'analytics.verify',
      'primary.bootstrap',
      'analytics.bootstrap',
    ])
    expect(
      runtime.graph.modules.filter(({ definition }) =>
        definition.exports?.includes(PRIMARY_DB),
      ),
    ).toHaveLength(1)

    await runtime.shutdown('test')
    expect(events.slice(-6)).toEqual([
      'analytics.close',
      'primary.close',
      'analytics.beforeShutdown:test',
      'primary.beforeShutdown:test',
      'analytics.shutdown:test',
      'primary.shutdown:test',
    ])
  })

  it('finite Env branchからconditional Providerを選ぶ', async () => {
    const { runtime } = await createDatabaseFixture('s3')
    await runtime.initialize()
    expect(await runtime.container.resolve(STORAGE)).toBeInstanceOf(S3Storage)
    await runtime.shutdown()
  })

  it('Env keyは値を含まないsymbolic referenceである', () => {
    const key = AppEnv.key('PRIMARY_DATABASE_URL')
    expect(key).toMatchObject({
      kind: 'runtime-input-key',
      source: 'environment',
      contract: AppEnv,
      key: 'PRIMARY_DATABASE_URL',
    })
    expect(JSON.stringify(key)).not.toContain('primary://fixture')
  })
})
